import { createClient } from "@/lib/supabase/server";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { LogsAndSummaryTabs } from "@/components/dashboard/LogsAndSummaryTabs";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DataQualityBadge } from "@/components/dashboard/DataQualityBadge";
import { GoalNavigator } from "@/components/dashboard/GoalNavigator";
import { WeeklyReviewCard } from "@/components/dashboard/WeeklyReviewCard";
import { calcDataQuality } from "@/lib/utils/calcDataQuality";
import { calcReadiness } from "@/lib/utils/calcReadiness";
import { calcWeeklyReview } from "@/lib/utils/calcWeeklyReview";
import { getEnrichedLogsAvailability, errorAvailability } from "@/lib/analytics/status";
import type { AnalyticsAvailability } from "@/lib/analytics/status";
import type { DailyLog, Prediction, AnalyticsCache, Setting, CareerLog, EnrichedLogPayloadRow } from "@/lib/supabase/types";
import type { MonthStats } from "@/components/history/SeasonSummary";

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

type EnrichedLogsFetch =
  | { kind: "ok"; rows: EnrichedLogPayloadRow[]; updatedAt: string }
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
    rows: row.payload as unknown as EnrichedLogPayloadRow[],
    updatedAt: row.updated_at,
  };
}

async function fetchSettings(): Promise<Record<string, number | string | null>> {
  const supabase = createClient();
  const { data } = await supabase.from("settings").select("key, value_num, value_str");
  const rows = (data as Setting[] | null) ?? [];
  return Object.fromEntries(
    rows.map((r) => [r.key, r.value_num !== null ? r.value_num : r.value_str])
  );
}

async function fetchCareerLogs(): Promise<CareerLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("career_logs").select("log_date, season, target_date").order("log_date");
  if (error) return [];
  return (data as CareerLog[]) ?? [];
}

/** career_logs から日付→シーズン名のマップを構築 */
function buildSeasonMap(careerLogs: CareerLog[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const log of careerLogs) {
    map.set(log.log_date, log.season);
  }
  return map;
}

/** career_logs の各シーズンの日付範囲を算出 */
function buildSeasonRanges(careerLogs: CareerLog[]): Array<{ season: string; start: string; end: string }> {
  const map = new Map<string, { start: string; end: string }>();
  for (const log of careerLogs) {
    const cur = map.get(log.season);
    if (!cur) {
      map.set(log.season, { start: log.log_date, end: log.log_date });
    } else {
      if (log.log_date < cur.start) cur.start = log.log_date;
      if (log.log_date > cur.end) cur.end = log.log_date;
    }
  }
  return Array.from(map.entries()).map(([season, { start, end }]) => ({ season, start, end }));
}

/** 月（YYYY-MM）が属するシーズンを推定 */
function getSeasonForMonth(month: string, ranges: Array<{ season: string; start: string; end: string }>, currentSeason: string | null): string | null {
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  for (const r of ranges) {
    if (r.start <= monthEnd && r.end >= monthStart) return r.season;
  }
  return currentSeason; // career_logs に該当なし → 現在シーズン
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
  const [logs, predictions, enriched, settings, careerLogs] = await Promise.all([
    fetchLogs(),
    fetchPredictions(),
    fetchEnrichedLogs(),
    fetchSettings(),
    fetchCareerLogs(),
  ]);

  // enriched_logs の新鮮さを判定
  const latestRawLogDate = logs[logs.length - 1]?.log_date ?? null;
  const enrichedRows = enriched.kind === "ok" ? enriched.rows : [];
  const enrichedAvailability: AnalyticsAvailability =
    enriched.kind === "error"
      ? errorAvailability()
      : getEnrichedLogsAvailability(
          enriched.kind === "ok" ? enriched.updatedAt : null,
          latestRawLogDate
        );

  const sma7 = enrichedRows
    .filter((r) => r.weight_sma7 !== null)
    .map((r) => ({ date: r.log_date, value: r.weight_sma7! }));

  const latestTdee = enrichedRows
    .filter((r) => r.tdee_estimated !== null)
    .at(-1)?.tdee_estimated ?? null;

  const goalWeight = typeof settings["goal_weight"] === "number" ? settings["goal_weight"] : undefined;
  const monthlyTarget = typeof settings["monthly_target"] === "number" ? settings["monthly_target"] : undefined;
  const contestDate = typeof settings["contest_date"] === "string" ? settings["contest_date"] : undefined;
  const currentSeason = typeof settings["current_season"] === "string" ? settings["current_season"] : null;

  // シーズン関連データ
  const seasonMap = buildSeasonMap(careerLogs);
  const seasonRanges = buildSeasonRanges(careerLogs);

  const monthStats = buildMonthStats(logs, 3).map((s) => ({
    ...s,
    season: getSeasonForMonth(s.month, seasonRanges, currentSeason),
  }));

  const qualityReport = calcDataQuality(logs);

  const phase =
    typeof settings["current_phase"] === "string" ? settings["current_phase"] : "Cut";

  const readinessMetrics = calcReadiness(logs, {
    contest_date: contestDate ?? null,
    goal_weight: goalWeight ?? null,
  });

  // enriched_logs から log_date → tdee_estimated の Map を構築
  const enrichedTdeeMap = new Map<string, number>();
  for (const row of enrichedRows) {
    if (row.tdee_estimated !== null) {
      enrichedTdeeMap.set(row.log_date, row.tdee_estimated);
    }
  }

  const weeklyReview = calcWeeklyReview(logs, readinessMetrics, qualityReport, {
    enrichedTdeeMap,
    phase,
  });

  return (
    <DashboardLayout>
      {logs.length > 0 ? (
        <>
          {/* シーズンバッジ */}
          {currentSeason && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                📅 {currentSeason}
              </span>
            </div>
          )}
          <KpiCards logs={logs} settings={settings} avgTdee={latestTdee} />
          <GoalNavigator
            metrics={readinessMetrics}
            phase={phase}
            goalWeight={goalWeight ?? null}
            contestDate={contestDate ?? null}
            avgTdee={latestTdee}
          />
          <WeeklyReviewCard data={weeklyReview} phase={phase} enrichedAvailability={enrichedAvailability} />
          <DataQualityBadge report={qualityReport} />
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
          <LogsAndSummaryTabs logs={logs} monthStats={monthStats} seasonMap={seasonMap} currentSeason={currentSeason} />
        </>
      ) : (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          左のフォームから最初のログを入力してください。
        </p>
      )}
    </DashboardLayout>
  );
}
