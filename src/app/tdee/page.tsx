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
} from "@/lib/utils/calcTdee";
import type { DailyLog, AnalyticsCache, Setting } from "@/lib/supabase/types";

export const revalidate = 3600;

async function fetchEnrichedLogs() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("analytics_cache")
    .select("payload, updated_at")
    .eq("metric_type", "enriched_logs")
    .single();
  if (error || !data) return null;
  const row = data as Pick<AnalyticsCache, "payload" | "updated_at">;
  return row.payload as Array<{ log_date: string; weight_sma7: number | null; tdee_estimated: number | null }>;
}

async function fetchRawLogs(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs").select("*").order("log_date", { ascending: true });
  if (error) return [];
  return (data as DailyLog[]) ?? [];
}

async function fetchSettings(): Promise<Record<string, number | null>> {
  const supabase = createClient();
  const { data } = await supabase.from("settings").select("key, value_num");
  const rows = (data as Setting[] | null) ?? [];
  return Object.fromEntries(rows.map((r) => [r.key, r.value_num]));
}

export default async function TdeePage() {
  const [enriched, rawLogs, settings] = await Promise.all([
    fetchEnrichedLogs(),
    fetchRawLogs(),
    fetchSettings(),
  ]);

  // 理論 TDEE（settings から）
  const heightCm = settings["height_cm"] ?? null;
  const ageYears = settings["age"] ?? null;
  const activityFactor = settings["activity_factor"] ?? 1.55;
  const latestWeight = rawLogs.filter((d) => d.weight !== null).at(-1)?.weight ?? null;

  const theoreticalTdee =
    heightCm && ageYears && latestWeight
      ? calcTheoreticalTdee({
          weightKg: latestWeight,
          heightCm,
          ageYears,
          isMale: true, // TODO: settings に性別追加
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

  // enriched がある場合はその日付軸を使う。ない場合は rawLogs を軸に tdee=null で描画
  const chartData = enriched
    ? enriched.map((row) => ({
        date: row.log_date.slice(5),
        tdee: row.tdee_estimated,
        intake: calMaMap.get(row.log_date) ?? null,
        theoretical: theoreticalTdee,
      }))
    : sortedRaw.map((row) => ({
        date: row.log_date.slice(5),
        tdee: null,
        intake: calMaMap.get(row.log_date) ?? null,
        theoretical: theoreticalTdee,
      }));

  const tdeeValues = (enriched ?? []).map((r) => r.tdee_estimated).filter((v): v is number => v !== null);
  const avgTdee = tdeeValues.length > 0
    ? tdeeValues.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, tdeeValues.length)
    : null;

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
  const weightStdDev = weights7.length > 1 && avgW7 !== null
    ? Math.sqrt(weights7.map((w) => (w - avgW7) ** 2).reduce((a, b) => a + b, 0) / weights7.length)
    : undefined;

  // 収支・理論変化・解釈
  const balance = calcEnergyBalance(avgCalories7, avgTdee);
  const theoreticalWeightChange = calcTheoreticalWeightChangePerWeek(balance);
  const confidence = calcTdeeConfidence({ calDays, weightDays, hasTdeeEstimate: avgTdee !== null, weightStdDev });
  const interpretation = buildTdeeInterpretation(balance, theoreticalWeightChange, measuredWeightChange);

  // rawLogs を主軸にして直近14日を表示（enriched にない新規エントリも反映）
  const enrichedTdeeMap = new Map(
    (enriched ?? []).map((r) => [r.log_date, r.tdee_estimated])
  );
  const tableData = sortedRaw.slice(-14).map((row) => ({
    date: row.log_date,
    calories: row.calories,
    tdee: enrichedTdeeMap.get(row.log_date) ?? null,
  }));

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">TDEE・代謝分析</h1>

      {/* ML バッチ未実行の補助案内（コンテンツはブロックしない） */}
      {!enriched && (
        <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-700">
          実測 TDEE は ML バッチ（enrich.py）未実行のため表示できません。
          理論 TDEE・平均摂取カロリー・体重推移は引き続き表示しています。
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
        />
        <TdeeDetailChart data={chartData} avgTdee={avgTdee} />
        <TdeeDailyTable data={tableData} />
        {!theoreticalTdee && (
          <p className="text-center text-xs text-gray-400">
            ※ 理論 TDEE を表示するには「設定」で身長・年齢・活動係数を入力してください。
          </p>
        )}
      </div>
    </main>
  );
}
