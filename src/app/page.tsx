// 毎リクエストで DB フェッチを実行し、当日の未入力をデータ品質判定に反映する。
// 設定ページ (settings/page.tsx) と同じ revalidate = 0 とすることで判定一致を保証する。
export const revalidate = 0;

import { StatusNotice } from "@/components/ui/StatusNotice";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { LogsAndSummaryTabs } from "@/components/dashboard/LogsAndSummaryTabs";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DataQualityBadge } from "@/components/dashboard/DataQualityBadge";
import { GoalNavigator } from "@/components/dashboard/GoalNavigator";
import { WeeklyReviewCard } from "@/components/dashboard/WeeklyReviewCard";
import { calcDataQuality } from "@/lib/utils/calcDataQuality";
import { calcReadiness, calcGoalReachDate } from "@/lib/utils/calcReadiness";
import { calcWeeklyReview } from "@/lib/utils/calcWeeklyReview";
import { calcBulkWeeklyPlanPace } from "@/lib/utils/bulkWeeklyPlanPace";
import { calcMonthlyGoalProgress } from "@/lib/utils/calcMonthlyGoalProgress";
import { toJstDateStr, addDaysStr, dateRangeStr, calcDaysLeft } from "@/lib/utils/date";
import { calcWeightTrend } from "@/lib/utils/calcTrend";
import { buildMonthlyGoalPlan } from "@/lib/utils/monthlyGoalPlan";
import { buildMonthlyGoalSummaryRows, buildMonthlyGoalComparisonRows } from "@/lib/utils/monthlyGoalVisualization";
import { calcMonthlyBehaviorStats } from "@/lib/utils/calcMonthlyBehaviorStats";
import { buildMonthlySeasonSummary } from "@/lib/utils/monthlySeasonSummary";
import { fetchDashboardDailyLogs, fetchPredictions, fetchCareerLogsForDashboard } from "@/lib/queries/dailyLogs";
import { fetchSeasons, selectActiveSeason } from "@/lib/queries/seasons";
import { fetchGoogleHealthDailyMetricsForRange } from "@/lib/queries/googleHealthDailyMetrics";
import { fetchSettings } from "@/lib/queries/settings";
import { fetchEnrichedLogs } from "@/lib/queries/analytics";
import { mapToAppSettings } from "@/lib/domain/settings";
import type { DashboardDailyLog, CareerLog } from "@/lib/supabase/types";
import type { MonthStats } from "@/components/history/SeasonSummary";
import {
  buildGoogleHealthNotConnectedStatus,
  buildGoogleHealthStatusError,
  getGoogleHealthStatusForUser,
} from "@/lib/googleHealth/status";
import { getCurrentUser } from "@/lib/supabase/server";

/** career_logs から日付→シーズン名のマップを構築 */
function buildSeasonMap(careerLogs: Pick<CareerLog, "log_date" | "season" | "target_date">[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const log of careerLogs) {
    map.set(log.log_date, log.season);
  }
  return map;
}

function buildMonthStats(logs: DashboardDailyLog[], months = 3): Omit<MonthStats, "seasonSummary">[] {
  const map = new Map<string, DashboardDailyLog[]>();
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

async function fetchGoogleHealthStatusForDashboard() {
  try {
    const user = await getCurrentUser();
    if (!user) return buildGoogleHealthNotConnectedStatus();
    return await getGoogleHealthStatusForUser(user.id);
  } catch {
    return buildGoogleHealthStatusError("google_health_connection_status_lookup_failed");
  }
}

export default async function DashboardPage() {
  // 基準日を最初に確定し、以降の全計算・クエリ範囲で共有する。
  // revalidate = 0 によりキャッシュなしでレンダリングされるため、
  // toJstDateStr() は常に JST 当日を返す。
  const today = toJstDateStr();

  const [logsResult, predictions, settingsResult, careerLogs, seasonsResult, googleHealthStatus] = await Promise.all([
    fetchDashboardDailyLogs(),
    fetchPredictions(),
    fetchSettings(),
    fetchCareerLogsForDashboard(),
    fetchSeasons(),
    fetchGoogleHealthStatusForDashboard(),
  ]);

  // QueryResult を展開。エラー時はフォールバック値で graceful degradation を維持する。
  const logs = logsResult.kind === "ok" ? logsResult.data : [];
  const settings = settingsResult.kind === "ok" ? settingsResult.data : mapToAppSettings([]);
  const activeSeasonResult = seasonsResult.kind === "ok"
    ? selectActiveSeason(seasonsResult.data)
    : seasonsResult;
  const activeSeason = activeSeasonResult.kind === "ok" ? activeSeasonResult.data : null;

  const firstLogDate = logs.at(0)?.log_date ?? null;
  const googleHealthMetricsResult = firstLogDate
    ? await fetchGoogleHealthDailyMetricsForRange(firstLogDate, today)
    : { kind: "ok" as const, data: [] };
  const googleHealthMetrics =
    googleHealthMetricsResult.kind === "ok" ? googleHealthMetricsResult.data : [];

  // MAX(updated_at) を使って stale 判定する。
  // MAX(log_date) ではなく MAX(updated_at) を使うことで、過去日の行修正でも stale を正しく検知できる。
  //
  // logsResult.kind === "error" のとき undefined を渡すことで、analytics の鮮度判定を
  // "unavailable" に落とす。null（ログが0件の正常初期状態）と区別するため undefined を使う。
  const latestRawLogUpdatedAt: string | null | undefined =
    logsResult.kind === "error"
      ? undefined
      : logsResult.data.reduce<string | null>((max, l) => {
          if (!l.updated_at) return max;
          return max === null || l.updated_at > max ? l.updated_at : max;
        }, null);
  const enrichedResult = await fetchEnrichedLogs(latestRawLogUpdatedAt);

  const enrichedRows = enrichedResult.rows;
  const enrichedAvailability = enrichedResult.availability;

  const sma7 = enrichedRows
    .filter((r) => r.weight_sma7 !== null)
    .map((r) => ({ date: r.log_date, value: r.weight_sma7! }));

  const latestTdee = enrichedRows
    .filter((r) => r.tdee_estimated !== null)
    .at(-1)?.tdee_estimated ?? null;

  const goalWeight = activeSeason?.targetWeight ?? undefined;
  const contestDate = activeSeason?.targetDate;
  const currentSeason = activeSeason?.name ?? null;
  const dashboardSettings = {
    ...settings,
    contestDate: contestDate ?? null,
    currentSeason,
    currentPhase: activeSeason?.phase ?? null,
    targetWeight: goalWeight ?? null,
  };

  // シーズン関連データ
  const seasonMap = buildSeasonMap(careerLogs);

  const monthStats = buildMonthStats(logs, 3).map((s) => ({
    ...s,
    seasonSummary: buildMonthlySeasonSummary(
      logs.filter((log) => log.log_date.startsWith(s.month)),
      seasonsResult.kind === "ok" ? seasonsResult.data : null
    ),
  }));

  const qualityReport = calcDataQuality(logs, today);

  const phase = activeSeason?.phase ?? "Cut";
  const activeSeasonLogs = activeSeason
    ? logs.filter((log) => log.log_date >= activeSeason.startDate)
    : [];

  const readinessMetrics = calcReadiness(logs, {
    contest_date: contestDate ?? null,
    goal_weight: goalWeight ?? null,
  });

  // Cutの到達予測 (7日平均 + 30日線形トレンド) — KpiCardsで表示。
  // BulkのKPI・ナビは下記bulkPlanPaceを使い、早期到達を評価しない。
  const d30Start = addDaysStr(today, -29) ?? today;
  const logByDate30 = new Map(logs.map((l) => [l.log_date, l]));
  const trend30Data = dateRangeStr(d30Start, today)
    .map((d) => ({ date: d, weight: logByDate30.get(d)?.weight ?? null }))
    .filter((p): p is { date: string; weight: number } => p.weight !== null);
  const slopePerDay30 = trend30Data.length >= 2 ? calcWeightTrend(trend30Data).slope : null;
  const goalReachResult = calcGoalReachDate(
    readinessMetrics.weight_7d_avg,
    slopePerDay30,
    goalWeight ?? null,
    today,
  );
  const daysNeeded =
    goalReachResult.status === "projected" && goalReachResult.date !== null
      ? calcDaysLeft(today, goalReachResult.date)
      : null;
  const bufferDays: number | null =
    daysNeeded !== null && readinessMetrics.days_to_contest !== null
      ? readinessMetrics.days_to_contest - daysNeeded
      : null;

  // 判断用 KPI の基準 TDEE は canonical な avg_tdee_14d を参照する。
  // canonical は enrich.py の avg_tdee_14d 最終値。旧バッチ互換のため
  // tdee_estimated 末尾 14 件の平均にフォールバックする（/tdee ページと同じ閾値）。
  const batchAvgTdee14d: number | null = enrichedRows.at(-1)?.avg_tdee_14d ?? null;
  const avgTdee14d: number | null = batchAvgTdee14d ?? (() => {
    const vals = enrichedRows.slice(-14)
      .map((r) => r.tdee_estimated)
      .filter((v): v is number => v !== null);
    return vals.length >= 7 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  // 今月目標進捗の比較値: 最新体重優先 (単日ノイズ込みの実測値で進捗を把握する)
  // GoalNavigator のペース分析 (refWeight) は引き続き 7日平均優先のままとする
  const comparisonWeight =
    [...activeSeasonLogs].reverse().find((log) => log.weight !== null)?.weight ??
    activeSeason?.startWeight ??
    null;
  // 当月最小体重: 今月の実測ログから最小値を導出
  const currentMonthPrefix = today.slice(0, 7);
  const currentMonthWeights = activeSeasonLogs
    .filter((l) => l.log_date.startsWith(currentMonthPrefix) && l.weight !== null)
    .map((l) => l.weight!);
  const currentMonthMinWeight = currentMonthWeights.length > 0
    ? Math.min(...currentMonthWeights)
    : null;
  const monthlyPlanStartDate = activeSeason?.monthlyPlanStartDate ?? activeSeason?.startDate ?? null;
  const monthlyGoalProgress = calcMonthlyGoalProgress({
    contestDate: contestDate ?? null,
    targetWeight: goalWeight ?? null,
    monthlyPlanStartMonth: activeSeason?.monthlyPlanStartMonth ?? null,
    monthlyPlanStartDate,
    monthlyPlanStartWeight: activeSeason?.monthlyPlanStartWeight ?? null,
    monthlyPlanOverrides: activeSeason?.monthlyPlanOverrides ?? [],
    comparisonWeight,
    today,
    phase,
  });

  // 進行中シーズンのsnapshot済み開始情報から月次計画を構築する。
  const monthlyGoalPlan =
    activeSeason &&
    contestDate &&
    goalWeight !== undefined &&
    activeSeason.monthlyPlanStartMonth !== null &&
    activeSeason.monthlyPlanStartWeight !== null
      ? buildMonthlyGoalPlan({
          currentWeight: activeSeason.monthlyPlanStartWeight,
          today,
          planStartMonth: activeSeason.monthlyPlanStartMonth,
          planStartDate: monthlyPlanStartDate,
          phase: activeSeason.phase,
          finalGoalWeight: goalWeight,
          goalDeadlineDate: contestDate,
          monthlyActuals: [],
          overrides: activeSeason.monthlyPlanOverrides,
        })
      : null;

  // Bulkの週次評価は進行中シーズン内のログと月次計画だけを使う。
  // Cutから切り替えた直後に過去シーズンの減量ログを混ぜない。
  const bulkEvaluationLogs = monthlyPlanStartDate
    ? activeSeasonLogs.filter((log) => log.log_date >= monthlyPlanStartDate)
    : activeSeasonLogs;
  const weeklyLogs = phase === "Bulk" ? bulkEvaluationLogs : logs;
  const weeklyReadinessMetrics = phase === "Bulk"
    ? calcReadiness(
        weeklyLogs,
        {
          contest_date: contestDate ?? null,
          goal_weight: goalWeight ?? null,
        },
        today
      )
    : readinessMetrics;
  const weeklyQualityReport = phase === "Bulk"
    ? calcDataQuality(weeklyLogs, today, { startDate: monthlyPlanStartDate ?? undefined })
    : qualityReport;
  const bulkPlanPace =
    phase === "Bulk" &&
    activeSeason &&
    monthlyGoalPlan?.isValid &&
    monthlyGoalPlan.entries.length > 0
      ? calcBulkWeeklyPlanPace({
          startDate: monthlyPlanStartDate!,
          startWeight: activeSeason.monthlyPlanStartWeight!,
          targetDate: activeSeason.targetDate,
          entries: monthlyGoalPlan.entries,
          logs: bulkEvaluationLogs,
          today,
        })
      : null;
  const weeklyReview = calcWeeklyReview(
    weeklyLogs,
    weeklyReadinessMetrics,
    weeklyQualityReport,
    {
      avgTdee14d,
      phase,
      googleHealthMetrics,
      bulkPlanPace,
    }
  );

  const monthlyGoalSummaryRows =
    monthlyGoalPlan?.isValid && monthlyGoalPlan.entries.length > 0
      ? buildMonthlyGoalComparisonRows(
          buildMonthlyGoalSummaryRows(monthlyGoalPlan, activeSeasonLogs, today),
          phase
        )
      : [];

  // 月別行動・生活集計: buildMonthStats と同じ 3 ヶ月分を計算する
  const monthlyBehaviorStats = calcMonthlyBehaviorStats(logs, 3, googleHealthMetrics);

  return (
    <DashboardLayout
      googleHealthStatus={googleHealthStatus}
      header={
        <>
          {/* Read error banners — graceful degradation: コンテンツはブロックしない */}
          {logsResult.kind === "error" && (
            <StatusNotice status="error">
              ログデータの取得中にエラーが発生しました。ページを再読み込みしてください。
            </StatusNotice>
          )}
          {settingsResult.kind === "error" && (
            <StatusNotice status="error">
              設定データの取得中にエラーが発生しました。一部の表示がデフォルト値になります。
            </StatusNotice>
          )}
          {activeSeasonResult.kind === "error" && (
            <StatusNotice status="error">
              {seasonsResult.kind === "error"
                ? "シーズン情報の取得中にエラーが発生しました。月別のシーズン名と月次計画は表示できません。"
                : "シーズン情報の取得中にエラーが発生しました。月次計画は表示されません。"}
            </StatusNotice>
          )}
          {googleHealthMetricsResult.kind === "error" && (
            <StatusNotice status="caution">
              Google Health データの取得中にエラーが発生しました。日次メトリクス表示は一部欠落します。
            </StatusNotice>
          )}
          {readinessMetrics.days_to_contest !== null && readinessMetrics.days_to_contest < 0 && (
            <StatusNotice status="caution">
              {phase !== "Bulk" ? "大会日" : "目標日"}を過ぎています。設定から次のフェーズに移行してください。
            </StatusNotice>
          )}
        </>
      }
    >
      {logsResult.kind === "error" ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          データを取得できませんでした。
        </p>
      ) : logs.length > 0 ? (
        <>
          <KpiCards logs={weeklyLogs} settings={dashboardSettings} avgTdee={latestTdee} currentWeight={weeklyReadinessMetrics.current_weight} currentSeason={currentSeason} goalReachResult={goalReachResult} bufferDays={bufferDays} bulkPlanPace={bulkPlanPace} />
          <GoalNavigator
            metrics={weeklyReadinessMetrics}
            phase={phase}
            goalWeight={goalWeight ?? null}
            contestDate={contestDate ?? null}
            avgCalories={weeklyReview.nutrition.avgCalories}
            monthlyGoalProgress={monthlyGoalProgress}
            currentMonthMinWeight={currentMonthMinWeight}
            bulkPlanPace={bulkPlanPace}
          />
          <WeeklyReviewCard data={weeklyReview} phase={phase} enrichedAvailability={enrichedAvailability} />
          <DataQualityBadge report={qualityReport} />
          {predictions.length > 0 ? (
            <ForecastChart
              logs={logs}
              predictions={predictions}
              sma7={sma7}
              goalWeight={goalWeight}
              contestDate={contestDate}
              phase={phase}
              monthlyGoalEntries={
                monthlyGoalPlan?.isValid && monthlyGoalPlan.entries.length > 0
                  ? monthlyGoalPlan.entries
                  : undefined
              }
            />
          ) : (
            <StatusNotice status="caution">
              <p className="mb-1 font-semibold">体重予測グラフ</p>
              <p>ML バッチ（predict.py）が実行されると表示されます。毎日 AM 3:00 JST に自動実行されます。</p>
            </StatusNotice>
          )}
        <LogsAndSummaryTabs
          logs={logs}
          googleHealthMetrics={googleHealthMetrics}
            monthStats={monthStats}
            seasonMap={seasonMap}
            currentSeason={currentSeason}
            monthlyGoalSummaryRows={monthlyGoalSummaryRows}
            monthlyBehaviorStats={monthlyBehaviorStats}
          />
        </>
      ) : (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          左のフォームから最初のログを入力してください。
        </p>
      )}
    </DashboardLayout>
  );
}
