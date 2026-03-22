import { SettingsForm } from "@/components/settings/SettingsForm";
import { ExportSection } from "@/components/settings/ExportSection";
import { ImportSection } from "@/components/settings/ImportSection";
import { DataQualityPanel } from "@/components/settings/DataQualityPanel";
import { calcDataQuality } from "@/lib/utils/calcDataQuality";
import { fetchSettingsRows } from "@/lib/queries/settings";
import { fetchDailyLogsForSettings } from "@/lib/queries/dailyLogs";
import { PageShell } from "@/components/ui/PageShell";

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

  // 最新の非 null 体重。月次目標計画の起点体重として使用。
  // 最新 log_date のレコードに weight がなくても、過去の記録があれば計画 UI が機能する。
  const currentWeight =
    [...logs]
      .sort((a, b) => a.log_date.localeCompare(b.log_date))
      .findLast((l) => l.weight !== null)
      ?.weight ?? null;

  return (
    <PageShell title="設定">
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

        {/* データ操作セクション: エクスポート / インポート */}
        <div>
          <div className="mb-3 flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              データ操作
            </span>
            <div className="flex-1 border-t border-slate-100" />
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600">
              既存データに影響します
            </span>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ExportSection />
            <ImportSection />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
