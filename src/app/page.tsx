import { createClient } from "@/lib/supabase/server";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { LogsAndSummaryTabs } from "@/components/dashboard/LogsAndSummaryTabs";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import type { DailyLog, Prediction, AnalyticsCache, Setting } from "@/lib/supabase/types";
import type { MonthStats } from "@/components/history/SeasonSummary";

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

function buildMonthStats(logs: DailyLog[], months = 3): MonthStats[] {
  const map = new Map<string, DailyLog[]>();
  for (const log of logs) {
    const month = log.log_date.slice(0, 7);
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(log);
  }
  const avg = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null);
    return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, months)
    .map(([month, entries]) => {
      const withWeight = entries.filter((d) => d.weight !== null);
      return {
        month,
        avgWeight: avg(entries.map((d) => d.weight)),
        avgCalories: avg(entries.map((d) => d.calories)),
        avgProtein: avg(entries.map((d) => d.protein)),
        startWeight: withWeight[0]?.weight ?? null,
        endWeight: withWeight[withWeight.length - 1]?.weight ?? null,
        days: entries.length,
      };
    });
}

export default async function DashboardPage() {
  const [logs, predictions, enriched, settings] = await Promise.all([
    fetchLogs(),
    fetchPredictions(),
    fetchEnrichedLogs(),
    fetchSettings(),
  ]);

  const sma7 = (enriched ?? [])
    .filter((r) => r.weight_sma7 !== null)
    .map((r) => ({ date: r.log_date, value: r.weight_sma7! }));

  const latestTdee = (enriched ?? [])
    .filter((r) => r.tdee_estimated !== null)
    .at(-1)?.tdee_estimated ?? null;

  const goalWeight = typeof settings["goal_weight"] === "number" ? settings["goal_weight"] : undefined;
  const monthlyTarget = typeof settings["monthly_target"] === "number" ? settings["monthly_target"] : undefined;
  const contestDate = typeof settings["contest_date"] === "string" ? settings["contest_date"] : undefined;
  const monthStats = buildMonthStats(logs, 3);

  return (
    <DashboardLayout>
      {logs.length > 0 ? (
        <>
          <KpiCards logs={logs} settings={settings} avgTdee={latestTdee} />
          {predictions.length > 0 && (
            <ForecastChart
              logs={logs}
              predictions={predictions}
              sma7={sma7}
              goalWeight={goalWeight}
              monthlyTarget={monthlyTarget}
              contestDate={contestDate}
            />
          )}
          <LogsAndSummaryTabs logs={logs} monthStats={monthStats} />
        </>
      ) : (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          左のフォームから最初のログを入力してください。
        </p>
      )}
    </DashboardLayout>
  );
}
