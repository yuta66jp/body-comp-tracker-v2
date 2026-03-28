/**
 * Foods page loading skeleton — mirrors PageShell + FoodTable + MenuTable layout.
 */
import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function FoodsLoading() {
  return (
    <main className="py-4 md:py-6">
      <div className="mx-auto max-w-screen-xl px-4 flex flex-col gap-6">
        {/* Page title */}
        <SkeletonBlock className="h-8 w-48" />
        {/* FoodTable (search + list) */}
        <SkeletonBlock className="h-72" />
        {/* MenuTable */}
        <SkeletonBlock className="h-56" />
      </div>
    </main>
  );
}
