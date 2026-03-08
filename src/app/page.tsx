import { createClient } from "@/lib/supabase/server";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { RecentLogsTable } from "@/components/dashboard/RecentLogsTable";
import { MealLogger } from "@/components/meal/MealLogger";
import { calcMetabolicSim } from "@/lib/utils/calcTdee";
import type { DailyLog, Prediction, AnalyticsCache, Setting } from "@/lib/supabase/types";

export const revalidate = 3600;

async function fetchLogs(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs").select("*").order("log_date", { ascending: true });
  if (error) { console.error(error.message); return []; }
  return (data as DailyLog[]) ?? [];
}

async function fetchPredictions(): Promise<Prediction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("predictions").select("*").order("ds", { ascending: true });
  if (error) { console.error(error.message); return []; }
  return (data as Prediction[]) ?? [];
}

async function fetchEnrichedLogs() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("analytics_cache")
    .select("payload")
    .eq("metric_type", "enriched_logs")
    .single();
  if (error || !data) return null;
  const row = data as Pick<AnalyticsCache, "payload">;
  return row.payload as Array<{ log_date: string; weight_sma7: number | null; tdee_estimated: number | null }>;
}

async function fetchSettings(): Promise<Record<string, number | string | null>> {
  const supabase = createClient();
  const { data } = await supabase.from("settings").select("key, value_num, value_str");
  const rows = (data as Setting[] | null) ?? [];
  return Object.fromEntries(
    rows.map((r) => [r.key, r.value_num !== null ? r.value_num : r.value_str])
  );
}

export default async function DashboardPage() {
  const [logs, predictions, enriched, settings] = await Promise.all([
    fetchLogs(),
    fetchPredictions(),
    fetchEnrichedLogs(),
    fetchSettings(),
  ]);

  // SMA7（enriched_logs から）
  const sma7 = (enriched ?? [])
    .filter((r) => r.weight_sma7 !== null)
    .map((r) => ({ date: r.log_date, value: r.weight_sma7! }));

  // 代謝シミュレーション
  const latestWeight = logs.filter((d) => d.weight !== null).at(-1)?.weight ?? null;
  const latestTdee = (enriched ?? [])
    .filter((r) => r.tdee_estimated !== null)
    .at(-1)?.tdee_estimated ?? null;
  const avgCalories7 = (() => {
    const last7 = logs.slice(-7).filter((d) => d.calories !== null);
    return last7.length > 0
      ? last7.reduce((s, d) => s + d.calories!, 0) / last7.length
      : null;
  })();

  const targetDate = typeof settings["contest_date"] === "string"
    ? settings["contest_date"]
    : null;

  const sim =
    latestWeight && latestTdee && avgCalories7 && targetDate
      ? calcMetabolicSim(latestWeight, latestTdee, avgCalories7, targetDate)
      : [];

  const goalWeight = typeof settings["goal_weight"] === "number"
    ? settings["goal_weight"]
    : undefined;
  const monthlyTarget = typeof settings["monthly_target"] === "number"
    ? settings["monthly_target"]
    : undefined;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">Body Composition Tracker</h1>
      <div className="space-y-6">
        <MealLogger />
        {logs.length > 0 && (
          <>
            <KpiCards
              logs={logs}
              settings={settings}
              avgTdee={latestTdee}
            />
            {predictions.length > 0 && (
              <ForecastChart
                logs={logs}
                predictions={predictions}
                sma7={sma7}
                sim={sim}
                goalWeight={goalWeight}
                monthlyTarget={monthlyTarget}
              />
            )}
            <RecentLogsTable logs={logs} />
          </>
        )}
        {logs.length === 0 && (
          <p className="text-center text-sm text-gray-400">
            上のフォームから最初のログを入力してください。
          </p>
        )}
      </div>
    </main>
  );
}
