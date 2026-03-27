/**
 * History page loading skeleton — mirrors PageShell + charts + comparison table layout.
 */
import { SkeletonBlock, SkeletonCardRow } from "@/components/ui/Skeleton";

export default function HistoryLoading() {
  return (
    <main className="py-4 md:py-6">
      <div className="mx-auto max-w-screen-xl px-4 flex flex-col gap-6">
        {/* Page title */}
        <SkeletonBlock className="h-8 w-24" />
        {/* Today window comparison cards */}
        <SkeletonCardRow count={3} height="h-24" cols="grid-cols-1 sm:grid-cols-3" />
        {/* Days-out chart */}
        <SkeletonBlock className="h-64" />
        {/* Season low chart */}
        <SkeletonBlock className="h-48" />
        {/* Season comparison table */}
        <SkeletonBlock className="h-56" />
      </div>
    </main>
  );
}
