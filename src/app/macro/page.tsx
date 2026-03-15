import { MacroKpiCards } from "@/components/macro/MacroKpiCards";
import { MacroStackedChart } from "@/components/macro/MacroStackedChart";
import { MacroDailyTable } from "@/components/macro/MacroDailyTable";
import { MacroPfcSummary } from "@/components/macro/MacroPfcSummary";
import { FactorAnalysis, FactorAnalysisPlaceholder } from "@/components/charts/FactorAnalysis";
import {
  calcMacroKpi,
  calcDailyMacro,
  calcMacroDiff,
  calcPfcKcalRatio,
} from "@/lib/utils/calcMacro";
import type { MacroTargets } from "@/lib/utils/calcMacro";
import { fetchDailyLogs } from "@/lib/queries/dailyLogs";
import { fetchMacroTargets } from "@/lib/queries/settings";
import { fetchFactorAnalysis } from "@/lib/queries/analytics";

export const revalidate = 3600;

export default async function MacroPage() {
  const [logsResult, targetsResult] = await Promise.all([
    fetchDailyLogs(),
    fetchMacroTargets(),
  ]);

  if (logsResult.kind === "error") {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <h1 className="mb-6 text-xl font-bold text-gray-800">栄養分析</h1>
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          ログデータの取得中にエラーが発生しました。ページを再読み込みしてください。
        </div>
      </main>
    );
  }

  const logs = logsResult.data;

  if (logs.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-gray-400">データがありません。</p>
      </main>
    );
  }

  // MAX(updated_at) を使って stale 判定する。
  // MAX(log_date) ではなく MAX(updated_at) を使うことで、過去日の行修正でも stale を正しく検知できる。
  const latestRawLogUpdatedAt = logs.reduce<string | null>((max, l) => {
    if (!l.updated_at) return max;
    return max === null || l.updated_at > max ? l.updated_at : max;
  }, null);
  const factorResult = await fetchFactorAnalysis(latestRawLogUpdatedAt);

  const { calTarget, ...targets }: MacroTargets & { calTarget: number | null } = targetsResult;
  const kpi = calcMacroKpi(logs);
  const dailyData = calcDailyMacro(logs, 60);
  const diff = calcMacroDiff(kpi.weekly, targets);
  const pfcRatio = calcPfcKcalRatio(kpi.weekly);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">栄養分析</h1>
      <div className="space-y-6">
        {/* 上段: kcal / PFC 目標差分・前週比サマリー */}
        <MacroKpiCards kpi={kpi} targets={targets} diff={diff} />

        {/* 中段: 今週の PFC kcal 比率 */}
        <MacroPfcSummary ratio={pfcRatio} />

        {/* 既存: PFC 構成比推移（直近60日） */}
        <MacroStackedChart data={dailyData} />

        {/* 既存: 日次栄養内訳テーブル */}
        <MacroDailyTable data={dailyData} calTarget={calTarget} />

        {factorResult.payload !== null ? (
          <FactorAnalysis
            data={factorResult.payload}
            meta={factorResult.meta}
            updatedAt={factorResult.updatedAt ?? ""}
            analyticsAvailability={factorResult.availability}
          />
        ) : (
          <FactorAnalysisPlaceholder analyticsAvailability={factorResult.availability} />
        )}
      </div>
    </main>
  );
}
