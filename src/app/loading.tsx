/**
 * Dashboard loading skeleton — approximate DashboardLayout structure.
 * Sidebar (lg: visible) + main content area with KpiCards, chart, review sections.
 */
import { SkeletonBlock, SkeletonCardRow } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 py-6 gap-2 lg:flex-row lg:items-start lg:px-4">
      {/* Main content */}
      <div className="min-w-0 flex-1 flex flex-col gap-6 px-4 lg:px-0">
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

      {/* Sidebar (MealLogger) — visible on lg+ */}
      <div className="hidden lg:flex w-80 shrink-0">
        <SkeletonBlock className="w-full h-[600px]" />
      </div>
    </div>
  );
}
