/**
 * Macro page loading skeleton — mirrors PageShell + MacroKpiCards + chart + table layout.
 */
import { SkeletonBlock, SkeletonCardRow } from "@/components/ui/Skeleton";

export default function MacroLoading() {
  return (
    <main className="py-4 md:py-6">
      <div className="mx-auto max-w-screen-xl px-4 flex flex-col gap-6">
        {/* Page title */}
        <SkeletonBlock className="h-8 w-32" />
        {/* KPI cards */}
        <SkeletonCardRow count={4} height="h-24" cols="grid-cols-2 sm:grid-cols-4" />
        {/* PFC summary */}
        <SkeletonBlock className="h-32" />
        {/* Stacked chart */}
        <SkeletonBlock className="h-64" />
        {/* Daily table */}
        <SkeletonBlock className="h-56" />
      </div>
    </main>
  );
}
