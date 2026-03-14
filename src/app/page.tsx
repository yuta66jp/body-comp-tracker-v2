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
import { fetchDailyLogs, fetchPredictions, fetchCareerLogsForDashboard } from "@/lib/queries/dailyLogs";
import { fetchSettings } from "@/lib/queries/settings";
import { fetchEnrichedLogs } from "@/lib/queries/analytics";
import type { DailyLog, CareerLog } from "@/lib/supabase/types";
import type { MonthStats } from "@/components/history/SeasonSummary";

/** career_logs から日付→シーズン名のマップを構築 */
function buildSeasonMap(careerLogs: Pick<CareerLog, "log_date" | "season" | "target_date">[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const log of careerLogs) {
    map.set(log.log_date, log.season);
  }
  return map;
}

/** career_logs の各シーズンの日付範囲を算出 */
function buildSeasonRanges(careerLogs: Pick<CareerLog, "log_date" | "season" | "target_date">[]): Array<{ season: string; start: string; end: string }> {
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
  const [logs, predictions, settings, careerLogs] = await Promise.all([
    fetchDailyLogs(),
    fetchPredictions(),
    fetchSettings(),
    fetchCareerLogsForDashboard(),
  ]);

  // enriched_logs は rawLogs の最新日を渡して新鮮さを判定する
  const latestRawLogDate = logs[logs.length - 1]?.log_date ?? null;
  const enrichedResult = await fetchEnrichedLogs(latestRawLogDate);

  const enrichedRows = enrichedResult.rows;
  const enrichedAvailability = enrichedResult.availability;

  const sma7 = enrichedRows
    .filter((r) => r.weight_sma7 !== null)
    .map((r) => ({ date: r.log_date, value: r.weight_sma7! }));

  const latestTdee = enrichedRows
    .filter((r) => r.tdee_estimated !== null)
    .at(-1)?.tdee_estimated ?? null;

  const goalWeight = settings.targetWeight ?? undefined;
  const monthlyTarget = settings.monthlyTarget ?? undefined;
  const contestDate = settings.contestDate ?? undefined;
  const currentSeason = settings.currentSeason;

  // シーズン関連データ
  const seasonMap = buildSeasonMap(careerLogs);
  const seasonRanges = buildSeasonRanges(careerLogs);

  const monthStats = buildMonthStats(logs, 3).map((s) => ({
    ...s,
    season: getSeasonForMonth(s.month, seasonRanges, currentSeason),
  }));

  const qualityReport = calcDataQuality(logs);

  const phase = settings.currentPhase ?? "Cut";

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
