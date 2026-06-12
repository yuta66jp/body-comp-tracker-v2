import { StatusNotice } from "@/components/ui/StatusNotice";
import { MacroKpiCards } from "@/components/macro/MacroKpiCards";
import { MacroStackedChart } from "@/components/macro/MacroStackedChart";
import { MacroDailyTable } from "@/components/macro/MacroDailyTable";
import { MacroPfcSummary } from "@/components/macro/MacroPfcSummary";
import { PageShell } from "@/components/ui/PageShell";
import { TableScroll } from "@/components/ui/TableScroll";
import {
  calcMacroKpi,
  calcDailyMacro,
  calcMacroDiff,
  calcPfcKcalRatio,
} from "@/lib/utils/calcMacro";
import type { MacroTargets } from "@/lib/utils/calcMacro";
import { fetchMacroDailyLogs } from "@/lib/queries/dailyLogs";
import { fetchMacroTargets, fetchSettings } from "@/lib/queries/settings";

export const revalidate = 3600;

export default async function MacroPage() {
  const [logsResult, targetsResult, settingsResult] = await Promise.all([
    fetchMacroDailyLogs(60),
    fetchMacroTargets(),
    fetchSettings(),
  ]);

  // QueryResult を展開。エラー時はフォールバック値で graceful degradation を維持する。
  const logs = logsResult.kind === "ok" ? logsResult.data : [];

  const { calTarget, ...targets }: MacroTargets & { calTarget: number | null } = targetsResult;
  const currentPhase = settingsResult.kind === "ok" ? settingsResult.data.currentPhase : null;
  const kpi = calcMacroKpi(logs);
  const dailyData = calcDailyMacro(logs, 60);
  const diff = calcMacroDiff(kpi.weekly, targets);
  const pfcRatio = calcPfcKcalRatio(kpi.weekly);

  return (
    <PageShell title="栄養分析">

      {/* error banner — graceful degradation: ページ全体はブロックしない */}
      {logsResult.kind === "error" && (
        <StatusNotice status="error" className="mb-5">
          ログデータの取得中にエラーが発生しました。ページを再読み込みしてください。
        </StatusNotice>
      )}

      {logs.length === 0 ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">
          栄養データが記録されるとグラフが表示されます。
        </div>
      ) : (
        <div className="space-y-6">
          {/* 上段: kcal / PFC 目標差分・前週比サマリー */}
          <MacroKpiCards kpi={kpi} targets={targets} diff={diff} phase={currentPhase} />

          {/* 中段: 今週の PFC kcal 比率 */}
          <MacroPfcSummary ratio={pfcRatio} />

          {/* 既存: PFC 構成比推移（直近60日） */}
          <MacroStackedChart data={dailyData} />

          {/* 既存: 日次栄養内訳テーブル（モバイルでエッジブリード） */}
          <TableScroll>
            <MacroDailyTable data={dailyData} calTarget={calTarget} />
          </TableScroll>
        </div>
      )}

    </PageShell>
  );
}
