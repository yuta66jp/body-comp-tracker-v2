import { createClient } from "@/lib/supabase/server";
import { MacroKpiCards } from "@/components/macro/MacroKpiCards";
import { MacroStackedChart } from "@/components/macro/MacroStackedChart";
import { MacroDailyTable } from "@/components/macro/MacroDailyTable";
import { MacroPfcSummary } from "@/components/macro/MacroPfcSummary";
import { FactorAnalysis, FactorAnalysisPlaceholder } from "@/components/charts/FactorAnalysis";
import type { FactorEntry, FactorMeta } from "@/lib/utils/factorAnalysisUtils";
import {
  calcMacroKpi,
  calcDailyMacro,
  calcMacroDiff,
  calcPfcKcalRatio,
} from "@/lib/utils/calcMacro";
import type { MacroTargets } from "@/lib/utils/calcMacro";
import { getXgboostAvailability, errorAvailability } from "@/lib/analytics/status";
import type { DailyLog, AnalyticsCache } from "@/lib/supabase/types";

export const revalidate = 3600;

async function fetchLogs(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs").select("*").order("log_date", { ascending: true });
  if (error) { console.error(error.message); return []; }
  return (data as DailyLog[]) ?? [];
}

type FactorFetchResult =
  | { kind: "ok"; payload: Record<string, FactorEntry>; meta: FactorMeta | null; updatedAt: string }
  | { kind: "not_found" }
  | { kind: "error" };

async function fetchFactorAnalysis(): Promise<FactorFetchResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("analytics_cache")
    .select("payload, updated_at")
    .eq("metric_type", "xgboost_importance")
    .single();
  if (error) {
    return error.code === "PGRST116" ? { kind: "not_found" } : { kind: "error" };
  }
  if (!data) return { kind: "not_found" };
  const row = data as Pick<AnalyticsCache, "payload" | "updated_at">;
  const rawPayload = row.payload as Record<string, unknown>;
  // _meta を分離して残りを FactorEntry として渡す
  const { _meta, ...entries } = rawPayload;
  return {
    kind: "ok",
    payload: entries as Record<string, FactorEntry>,
    meta: (_meta ?? null) as FactorMeta | null,
    updatedAt: row.updated_at,
  };
}

async function fetchMacroTargets(): Promise<MacroTargets & { calTarget: number | null }> {
  const supabase = createClient();
  const keys = ["target_calories_kcal", "target_protein_g", "target_fat_g", "target_carbs_g", "goal_calories"];
  const { data } = await supabase
    .from("settings")
    .select("key, value_num")
    .in("key", keys);
  const map: Record<string, number | null> = {};
  for (const row of (data as { key: string; value_num: number | null }[]) ?? []) {
    map[row.key] = row.value_num;
  }
  return {
    calories: map["target_calories_kcal"] ?? null,
    protein:  map["target_protein_g"]     ?? null,
    fat:      map["target_fat_g"]         ?? null,
    carbs:    map["target_carbs_g"]       ?? null,
    // 後方互換: MacroDailyTable 用 (旧 goal_calories → target_calories_kcal にフォールバック)
    calTarget: map["target_calories_kcal"] ?? map["goal_calories"] ?? null,
  };
}

export default async function MacroPage() {
  const [logs, factorFetch, targetsResult] = await Promise.all([
    fetchLogs(),
    fetchFactorAnalysis(),
    fetchMacroTargets(),
  ]);

  if (logs.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-gray-400">データがありません。</p>
      </main>
    );
  }

  const { calTarget, ...targets } = targetsResult;
  const kpi = calcMacroKpi(logs);
  const dailyData = calcDailyMacro(logs, 60);
  const diff = calcMacroDiff(kpi.weekly, targets);
  const pfcRatio = calcPfcKcalRatio(kpi.weekly);

  // xgboost_importance の新鮮さを判定
  const latestRawLogDate = logs[logs.length - 1]?.log_date ?? null;
  const factorAvailability =
    factorFetch.kind === "error"
      ? errorAvailability()
      : getXgboostAvailability(
          factorFetch.kind === "ok" ? factorFetch.updatedAt : null,
          latestRawLogDate
        );

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

        {factorFetch.kind === "ok" ? (
          <FactorAnalysis
            data={factorFetch.payload}
            meta={factorFetch.meta}
            updatedAt={factorFetch.updatedAt}
            analyticsAvailability={factorAvailability}
          />
        ) : (
          <FactorAnalysisPlaceholder analyticsAvailability={factorAvailability} />
        )}
      </div>
    </main>
  );
}
