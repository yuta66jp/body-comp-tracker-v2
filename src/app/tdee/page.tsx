// TDEE は enrich.py (batch) を canonical source とする。
// このページは canonical 値の表示・fallback・整形のみを担う。
// TDEE の再計算・再集約・再平滑化はここでは行わない。
//
// 平滑化仕様: enrich.py の tdee_estimated は weight_sma7.diff() + rolling median (window=7, min_periods=3)
// 係数: KCAL_PER_KG_FAT = 7200 kcal/kg (Hall et al., 2012)
// 7日平均 TDEE: enrichedRows の avg_tdee_7d (enrich.py で事前計算済み)
// 7日平均カロリー: enrichedRows の avg_calories_7d (enrich.py で事前計算済み)
import { TdeeKpiCard } from "@/components/tdee/TdeeKpiCard";
import { TdeeDetailChart } from "@/components/tdee/TdeeDetailChart";
import { TdeeDailyTable } from "@/components/tdee/TdeeDailyTable";
import {
  calcTheoreticalTdee,
  calcEnergyBalance,
  calcTheoreticalWeightChangePerWeek,
  calcTdeeConfidence,
  buildTdeeInterpretation,
} from "@/lib/utils/calcTdee";
import { fetchDailyLogs } from "@/lib/queries/dailyLogs";
import { fetchSettings } from "@/lib/queries/settings";
import { fetchEnrichedLogs } from "@/lib/queries/analytics";
import type { CurrentPhase } from "@/lib/utils/energyBalance";

export const revalidate = 3600;

export default async function TdeePage() {
  const [rawLogs, settings] = await Promise.all([
    fetchDailyLogs(),
    fetchSettings(),
  ]);

  const sortedRaw = [...rawLogs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const latestRawLogDate = sortedRaw[sortedRaw.length - 1]?.log_date ?? null;

  // enriched_logs は rawLogs の最新日を渡して新鮮さを判定する
  const enrichedResult = await fetchEnrichedLogs(latestRawLogDate);
  const enrichedRows = enrichedResult.rows;
  const enrichedAvailability = enrichedResult.availability;

  // current_phase — "Cut" / "Bulk" のみ有効（それ以外は null に落とす）
  const rawPhase = settings.currentPhase;
  const currentPhase: CurrentPhase | null =
    rawPhase === "Cut" || rawPhase === "Bulk" ? rawPhase : null;

  // 理論 TDEE（settings から）
  const heightCm = settings.height;
  const ageYears = settings.age;
  const activityFactor = settings.activityFactor ?? 1.55;
  const latestWeight = rawLogs.filter((d) => d.weight !== null).at(-1)?.weight ?? null;

  const isMale: boolean | null =
    settings.gender === "male" ? true : settings.gender === "female" ? false : null;

  const theoreticalTdee =
    heightCm !== null && ageYears !== null && latestWeight !== null && isMale !== null
      ? calcTheoreticalTdee({
          weightKg: latestWeight,
          heightCm,
          ageYears,
          isMale,
          activityFactor,
        })
      : null;

  // グラフ用データ: enriched がある場合はその日付軸を使う。ない場合は rawLogs を軸に tdee=null で描画。
  // tdee は canonical 値 (tdee_estimated) をそのまま使う。再平滑化しない。
  // intake は batch の avg_calories_7d を使う（ない場合は calories の raw 値で fallback）。
  const rawCaloriesMap = new Map<string, number | null>(
    sortedRaw.map((r) => [r.log_date, r.calories])
  );
  const hasEnrichedData = enrichedResult.availability.status === "fresh" || enrichedResult.availability.status === "stale";
  const chartData = hasEnrichedData
    ? enrichedRows.map((row) => ({
        date: row.log_date.slice(5),
        tdee: row.tdee_estimated,
        // avg_calories_7d が新フィールドのため古いバッチ結果では undefined になる場合がある
        intake: row.avg_calories_7d ?? rawCaloriesMap.get(row.log_date) ?? null,
        theoretical: theoreticalTdee,
      }))
    : sortedRaw.map((row) => ({
        date: row.log_date.slice(5),
        tdee: null,
        intake: row.calories,
        theoretical: theoreticalTdee,
      }));

  // 直近7日の平均 TDEE: バッチの avg_tdee_7d 最終値を使う（canonical）
  // avg_tdee_7d が新フィールドのため古いバッチ結果では undefined になる場合がある。
  // その場合は enrichedRows 末尾 7 件の tdee_estimated を平均して fallback する。
  const lastEnrichedRow = enrichedRows.at(-1);
  const avgTdee: number | null = (() => {
    if (lastEnrichedRow?.avg_tdee_7d !== undefined && lastEnrichedRow.avg_tdee_7d !== null) {
      return lastEnrichedRow.avg_tdee_7d;
    }
    // fallback: 末尾 7 件の tdee_estimated の平均
    const vals = enrichedRows.slice(-7)
      .map((r) => r.tdee_estimated)
      .filter((v): v is number => v !== null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  // 直近7日の平均カロリー: バッチの avg_calories_7d 最終値を使う（canonical）
  // fallback: rawLogs 末尾 7 件の calories 平均
  const avgCalories7: number | null = (() => {
    if (lastEnrichedRow?.avg_calories_7d !== undefined && lastEnrichedRow.avg_calories_7d !== null) {
      return lastEnrichedRow.avg_calories_7d;
    }
    const last7 = sortedRaw.slice(-7).filter((d) => d.calories !== null);
    return last7.length > 0 ? last7.reduce((s, d) => s + d.calories!, 0) / last7.length : null;
  })();

  // TDEE 推定値の標準偏差 (信頼度判定に使用)
  // 直近7件の tdee_estimated から算出する
  const tdeeValues7 = enrichedRows.slice(-7)
    .map((r) => r.tdee_estimated)
    .filter((v): v is number => v !== null);
  const tdeeStdDev =
    tdeeValues7.length > 1
      ? (() => {
          const mean = tdeeValues7.reduce((a, b) => a + b, 0) / tdeeValues7.length;
          return Math.sqrt(
            tdeeValues7.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) /
              tdeeValues7.length
          );
        })()
      : undefined;

  // 実測変化: 直近7日 vs 前7日 の平均体重差
  const last7 = sortedRaw.slice(-7);
  const prev7 = sortedRaw.slice(-14, -7);
  const weights7 = last7.filter((d) => d.weight !== null).map((d) => d.weight!);
  const weightsPrev7 = prev7.filter((d) => d.weight !== null).map((d) => d.weight!);
  const avgW7 = weights7.length > 0 ? weights7.reduce((a, b) => a + b, 0) / weights7.length : null;
  const avgWPrev7 = weightsPrev7.length > 0 ? weightsPrev7.reduce((a, b) => a + b, 0) / weightsPrev7.length : null;
  const measuredWeightChange = avgW7 !== null && avgWPrev7 !== null
    ? Math.round((avgW7 - avgWPrev7) * 100) / 100
    : null;

  // 信頼度算出
  const calDays = last7.filter((d) => d.calories !== null).length;
  const weightDays = weights7.length;
  const weightStdDev =
    weights7.length > 1 && avgW7 !== null
      ? Math.sqrt(
          weights7.map((w) => (w - avgW7) ** 2).reduce((a, b) => a + b, 0) / weights7.length
        )
      : undefined;

  // 収支・理論変化・解釈
  const balance = calcEnergyBalance(avgCalories7, avgTdee);
  const theoreticalWeightChange = calcTheoreticalWeightChangePerWeek(balance);
  const confidence = calcTdeeConfidence({
    calDays,
    weightDays,
    hasTdeeEstimate: avgTdee !== null,
    weightStdDev,
    tdeeStdDev,
  });
  const interpretation = buildTdeeInterpretation(balance, theoreticalWeightChange, measuredWeightChange);

  // テーブル用: rawLogs を主軸にして直近14日を表示（enriched にない新規エントリも反映）
  // TDEE 列は canonical の tdee_estimated をそのまま使う
  const enrichedTdeeMap = new Map<string, number | null>(
    enrichedRows.map((r) => [r.log_date, r.tdee_estimated])
  );
  const tableData = sortedRaw.slice(-14).map((row) => ({
    date: row.log_date,
    calories: row.calories,
    tdee: enrichedTdeeMap.get(row.log_date) ?? null,
  }));

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">TDEE・代謝分析</h1>

      {/* enriched_logs の状態バナー（コンテンツはブロックしない） */}
      {enrichedAvailability.status === "error" && (
        <div className="mb-5 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          実測 TDEE のデータ取得中にエラーが発生しました。
          しばらく待ってからページを再読み込みしてください。
          理論 TDEE・平均摂取カロリー・体重推移は引き続き表示しています。
        </div>
      )}
      {enrichedAvailability.status === "unavailable" && (
        <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-700">
          実測 TDEE は ML バッチ（enrich.py）が未実行のため表示できません（未計算）。
          理論 TDEE・平均摂取カロリー・体重推移は引き続き表示しています。
        </div>
      )}
      {enrichedAvailability.status === "stale" && (
        <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-700">
          実測 TDEE は再計算前のデータを表示しています（最終更新: {enrichedAvailability.lastUpdatedDate}、
          {enrichedAvailability.staleDays}日前の計算）。
          直近入力が反映されるのは次回バッチ実行後（毎日 AM 3:00 JST）です。
        </div>
      )}

      <div className="space-y-6">
        <TdeeKpiCard
          avgTdee={avgTdee}
          theoreticalTdee={theoreticalTdee}
          avgCalories={avgCalories7}
          balance={balance}
          theoreticalWeightChange={theoreticalWeightChange}
          measuredWeightChange={measuredWeightChange}
          confidence={confidence}
          interpretation={interpretation}
          enrichedAvailability={enrichedAvailability}
        />
        <TdeeDetailChart data={chartData} avgTdee={avgTdee} />
        <TdeeDailyTable data={tableData} phase={currentPhase} />
        {!theoreticalTdee && (
          <p className="text-center text-xs text-gray-400">
            ※ 理論 TDEE を表示するには「設定」で身長・年齢・活動係数・性別を入力してください。
          </p>
        )}
      </div>
    </main>
  );
}
