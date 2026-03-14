import { SettingsForm } from "@/components/settings/SettingsForm";
import { ExportSection } from "@/components/settings/ExportSection";
import { ImportSection } from "@/components/settings/ImportSection";
import { DataQualityPanel } from "@/components/settings/DataQualityPanel";
import { calcDataQuality } from "@/lib/utils/calcDataQuality";
import { fetchSettingsRows } from "@/lib/queries/settings";
import { fetchDailyLogsForSettings } from "@/lib/queries/dailyLogs";

export const revalidate = 0;

export default async function SettingsPage() {
  const [settings, logs] = await Promise.all([
    fetchSettingsRows(),
    fetchDailyLogsForSettings(),
  ]);
  const qualityReport = calcDataQuality(logs);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">設定</h1>
      <div className="space-y-6">
        <SettingsForm initialSettings={settings} />
        <DataQualityPanel report={qualityReport} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ExportSection />
          <ImportSection />
        </div>
      </div>
    </main>
  );
}
