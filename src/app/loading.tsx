/**
 * Dashboard loading skeleton — mirrors DashboardLayout structure.
 *
 * #361 でサイドバーが廃止され DashboardLayout は flex-col に統一された。
 * MobileMealLoggerSheet トリガー + メインコンテンツの縦並び構成を反映する。
 */
import { SkeletonBlock, SkeletonCardRow } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 py-6 gap-6 dark:bg-slate-950">
      {/* MobileMealLoggerSheet trigger */}
      <SkeletonBlock className="h-11 lg:max-w-xs" />
      {/* KpiCards */}
      <SkeletonCardRow count={3} height="h-24" cols="grid-cols-1 sm:grid-cols-3" />
      {/* GoalNavigator */}
      <SkeletonBlock className="h-48" />
      {/* ForecastChart */}
      <SkeletonBlock className="h-64" />
      {/* WeeklyReview */}
      <SkeletonBlock className="h-40" />
      {/* LogsAndSummaryTabs */}
      <SkeletonBlock className="h-56" />
    </div>
  );
}
