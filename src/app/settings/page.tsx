import { SettingsForm } from "@/components/settings/SettingsForm";
import { ExportSection } from "@/components/settings/ExportSection";
import { ImportSection } from "@/components/settings/ImportSection";
import { DataQualityPanel } from "@/components/settings/DataQualityPanel";
import { calcDataQuality } from "@/lib/utils/calcDataQuality";
import { fetchSettingsRows } from "@/lib/queries/settings";
import { fetchDailyLogsForSettings } from "@/lib/queries/dailyLogs";

export const revalidate = 0;

export default async function SettingsPage() {
  const [settingsRowsResult, logsResult] = await Promise.all([
    fetchSettingsRows(),
    fetchDailyLogsForSettings(),
  ]);

  // QueryResult を展開。エラー時はフォールバック値で graceful degradation を維持する。
  const settingsRows = settingsRowsResult.kind === "ok" ? settingsRowsResult.data : [];
  const logs = logsResult.kind === "ok" ? logsResult.data : [];
  const qualityReport = calcDataQuality(logs);

  // 最新の記録体重 (最新 log_date のもの)。月次目標計画の起点体重として使用。
  const currentWeight =
    [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date)).at(-1)?.weight ?? null;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">設定</h1>

      {/* Read error banners — graceful degradation: コンテンツはブロックしない */}
      {settingsRowsResult.kind === "error" && (
        <div className="mb-5 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          設定データの取得中にエラーが発生しました。ページを再読み込みしてください。
        </div>
      )}
      {logsResult.kind === "error" && (
        <div className="mb-5 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          ログデータの取得中にエラーが発生しました。データ品質の表示がデフォルト値になります。
        </div>
      )}

      <div className="space-y-6">
        <SettingsForm initialSettings={settingsRows} currentWeight={currentWeight} />
        <DataQualityPanel report={qualityReport} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ExportSection />
          <ImportSection />
        </div>
      </div>
    </main>
  );
}
