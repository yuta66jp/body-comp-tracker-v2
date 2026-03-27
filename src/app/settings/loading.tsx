/**
 * Settings page loading skeleton — mirrors PageShell + SettingsForm + data panels layout.
 */
import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <main className="py-4 md:py-6">
      <div className="mx-auto max-w-screen-xl px-4 flex flex-col gap-6">
        {/* Page title */}
        <SkeletonBlock className="h-8 w-16" />
        {/* Settings form */}
        <SkeletonBlock className="h-96" />
        {/* Data quality panel */}
        <SkeletonBlock className="h-48" />
        {/* Export / import sections */}
        <SkeletonBlock className="h-32" />
        <SkeletonBlock className="h-32" />
      </div>
    </main>
  );
}
