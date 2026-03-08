import { createClient } from "@/lib/supabase/server";
import { MacroKpiCards } from "@/components/macro/MacroKpiCards";
import { MacroStackedChart } from "@/components/macro/MacroStackedChart";
import { MacroDailyTable } from "@/components/macro/MacroDailyTable";
import { FactorAnalysis } from "@/components/charts/FactorAnalysis";
import { calcMacroKpi, calcDailyMacro } from "@/lib/utils/calcMacro";
import type { DailyLog, AnalyticsCache } from "@/lib/supabase/types";

export const revalidate = 3600;

async function fetchLogs(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs").select("*").order("log_date", { ascending: true });
  if (error) { console.error(error.message); return []; }
  return (data as DailyLog[]) ?? [];
}

async function fetchFactorAnalysis() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("analytics_cache")
    .select("payload, updated_at")
    .eq("metric_type", "xgboost_importance")
    .single();
  if (error || !data) return null;
  const row = data as Pick<AnalyticsCache, "payload" | "updated_at">;
  return { payload: row.payload as Record<string, { label: string; importance: number; pct: number }>, updatedAt: row.updated_at };
}

async function fetchCalTarget(): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from("settings").select("value_num").eq("key", "goal_calories").single();
  return (data as { value_num: number | null } | null)?.value_num ?? 2000;
}

export default async function MacroPage() {
  const [logs, factorResult, calTarget] = await Promise.all([
    fetchLogs(),
    fetchFactorAnalysis(),
    fetchCalTarget(),
  ]);

  if (logs.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-gray-400">データがありません。</p>
      </main>
    );
  }

  const kpi = calcMacroKpi(logs);
  const dailyData = calcDailyMacro(logs, 60);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">栄養分析</h1>
      <div className="space-y-6">
        <MacroKpiCards kpi={kpi} />
        <MacroStackedChart data={dailyData} />
        <MacroDailyTable data={dailyData} calTarget={calTarget} />
        {factorResult && (
          <FactorAnalysis data={factorResult.payload} updatedAt={factorResult.updatedAt} />
        )}
      </div>
    </main>
  );
}
