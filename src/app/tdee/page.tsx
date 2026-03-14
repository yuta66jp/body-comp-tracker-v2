import { createClient } from "@/lib/supabase/server";
import { TdeeKpiCard } from "@/components/tdee/TdeeKpiCard";
import { TdeeDetailChart } from "@/components/tdee/TdeeDetailChart";
import { TdeeDailyTable } from "@/components/tdee/TdeeDailyTable";
import {
  calcTheoreticalTdee,
  calcEnergyBalance,
  calcTheoreticalWeightChangePerWeek,
  calcTdeeConfidence,
  buildTdeeInterpretation,
  smoothTdeeSeries,
} from "@/lib/utils/calcTdee";
import { getEnrichedLogsAvailability, errorAvailability } from "@/lib/analytics/status";
import type { DailyLog, AnalyticsCache, Setting } from "@/lib/supabase/types";
import type { CurrentPhase } from "@/lib/utils/energyBalance";

export const revalidate = 3600;

type EnrichedLogsRow = { log_date: string; weight_sma7: number | null; tdee_estimated: number | null };
type EnrichedLogsFetch =
  | { kind: "ok"; rows: EnrichedLogsRow[]; updatedAt: string }
  | { kind: "not_found" }
  | { kind: "error" };

async function fetchEnrichedLogs(): Promise<EnrichedLogsFetch> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("analytics_cache")
    .select("payload, updated_at")
    .eq("metric_type", "enriched_logs")
    .single();
  if (error) {
    return error.code === "PGRST116" ? { kind: "not_found" } : { kind: "error" };
  }
  if (!data) return { kind: "not_found" };
  const row = data as Pick<AnalyticsCache, "payload" | "updated_at">;
  return {
    kind: "ok",
    rows: row.payload as EnrichedLogsRow[],
    updatedAt: row.updated_at,
  };
}

async function fetchRawLogs(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs").select("*").order("log_date", { ascending: true });
  if (error) return [];
  return (data as DailyLog[]) ?? [];
}

async function fetchSettings(): Promise<Record<string, number | string | null>> {
  const supabase = createClient();
  const { data } = await supabase.from("settings").select("key, value_num, value_str");
  const rows = (data as Setting[] | null) ?? [];
  return Object.fromEntries(
    rows.map((r) => [r.key, r.value_num !== null ? r.value_num : r.value_str])
  );
}

export default async function TdeePage() {
  const [enrichedFetch, rawLogs, settings] = await Promise.all([
    fetchEnrichedLogs(),
    fetchRawLogs(),
    fetchSettings(),
  ]);
  const enrichedRows = enrichedFetch.kind === "ok" ? enrichedFetch.rows : [];

  // current_phase — "Cut" / "Bulk" のみ有効（それ以外は null に落とす）
  const rawPhase = settings["current_phase"];
  const currentPhase: CurrentPhase | null =
    rawPhase === "Cut" || rawPhase === "Bulk" ? rawPhase : null;

  // 理論 TDEE（settings から）
  const heightCm = typeof settings["height_cm"] === "number" ? settings["height_cm"] : null;
  const ageYears = typeof settings["age"] === "number" ? settings["age"] : null;
  const activityFactor = typeof settings["activity_factor"] === "number" ? settings["activity_factor"] : 1.55;
  const latestWeight = rawLogs.filter((d) => d.weight !== null).at(-1)?.weight ?? null;

  const sex = settings["sex"];
  const isMale: boolean | null =
    sex === "male" ? true : sex === "female" ? false : null;

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

  // 10日移動平均カロリー（グラフ用）
  const sortedRaw = [...rawLogs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const calMaMap = new Map<string, number>();
  for (let i = 0; i < sortedRaw.length; i++) {
    const window = sortedRaw.slice(Math.max(0, i - 9), i + 1).filter((d) => d.calories !== null);
    if (window.length > 0) {
      calMaMap.set(sortedRaw[i].log_date, window.reduce((s, d) => s + d.calories!, 0) / window.length);
    }
  }

  // enriched_logs の新鮮さを判定
  const latestRawLogDate = sortedRaw[sortedRaw.length - 1]?.log_date ?? null;
  const enrichedAvailability =
    enrichedFetch.kind === "error"
      ? errorAvailability()
      : getEnrichedLogsAvailability(
          enrichedFetch.kind === "ok" ? enrichedFetch.updatedAt : null,
          latestRawLogDate
        );

  // enriched TDEE 系列を平滑化（水分・塩分・便通由来の単日ノイズを除去）
  // enrich.py 側でも SMA7 差分 + rolling median 済みだが、フロントで一層かけることで
  // バッチ未更新日や直近エントリのノイズも吸収する
  const allTdeeRaw: (number | null)[] = enrichedRows.map((r) => r.tdee_estimated);
  const smoothedTdeeValues = smoothTdeeSeries(allTdeeRaw);
  const smoothedTdeeMap = new Map(
    enrichedRows.map((r, i) => [r.log_date, smoothedTdeeValues[i]])
  );

  // enriched がある場合はその日付軸を使う。ない場合は rawLogs を軸に tdee=null で描画
  const chartData = enrichedFetch.kind === "ok"
    ? enrichedRows.map((row) => ({
        date: row.log_date.slice(5),
        tdee: smoothedTdeeMap.get(row.log_date) ?? null,
        intake: calMaMap.get(row.log_date) ?? null,
        theoretical: theoreticalTdee,
      }))
    : sortedRaw.map((row) => ({
        date: row.log_date.slice(5),
        tdee: null,
        intake: calMaMap.get(row.log_date) ?? null,
        theoretical: theoreticalTdee,
      }));

  // 直近7日の平滑化済み TDEE から平均値を算出
  const tdeeValues7 = smoothedTdeeValues.slice(-7).filter((v): v is number => v !== null);
  const avgTdee =
    tdeeValues7.length > 0
      ? tdeeValues7.reduce((a, b) => a + b, 0) / tdeeValues7.length
      : null;

  // TDEE 推定値の標準偏差 (信頼度判定に使用)
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

  const last7 = sortedRaw.slice(-7);
  const calLogs7 = last7.filter((d) => d.calories !== null);
  const avgCalories7 = calLogs7.length > 0
    ? calLogs7.reduce((s, d) => s + d.calories!, 0) / calLogs7.length
    : null;

  // 実測変化: 直近7日 vs 前7日 の平均体重差
  const prev7 = sortedRaw.slice(-14, -7);
  const weights7 = last7.filter((d) => d.weight !== null).map((d) => d.weight!);
  const weightsPrev7 = prev7.filter((d) => d.weight !== null).map((d) => d.weight!);
  const avgW7 = weights7.length > 0 ? weights7.reduce((a, b) => a + b, 0) / weights7.length : null;
  const avgWPrev7 = weightsPrev7.length > 0 ? weightsPrev7.reduce((a, b) => a + b, 0) / weightsPrev7.length : null;
  const measuredWeightChange = avgW7 !== null && avgWPrev7 !== null
    ? Math.round((avgW7 - avgWPrev7) * 100) / 100
    : null;

  // 信頼度算出
  const calDays = calLogs7.length;
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

  // rawLogs を主軸にして直近14日を表示（enriched にない新規エントリも反映）
  // smoothedTdeeMap を使うことで TDEE 列も平滑化済みの値を表示
  const tableData = sortedRaw.slice(-14).map((row) => ({
    date: row.log_date,
    calories: row.calories,
    tdee: smoothedTdeeMap.get(row.log_date) ?? null,
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
