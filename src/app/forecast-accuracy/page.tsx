import { createClient } from "@/lib/supabase/server";
import { BacktestResults } from "@/components/charts/BacktestResults";
import { BarChart2 } from "lucide-react";
import type {
  ForecastBacktestRun,
  ForecastBacktestMetric,
} from "@/lib/supabase/types";

export const revalidate = 3600; // 1時間キャッシュ (バッチは週1回)

async function fetchLatestRun(): Promise<ForecastBacktestRun | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forecast_backtest_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("forecast_backtest_runs fetch error:", error.message);
    return null;
  }
  return ((data as ForecastBacktestRun[]) ?? [])[0] ?? null;
}

async function fetchMetrics(runId: string): Promise<ForecastBacktestMetric[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forecast_backtest_metrics")
    .select("*")
    .eq("run_id", runId)
    .order("horizon_days", { ascending: true });
  if (error) {
    console.error("forecast_backtest_metrics fetch error:", error.message);
    return [];
  }
  return (data as ForecastBacktestMetric[]) ?? [];
}

export default async function ForecastAccuracyPage() {
  const run = await fetchLatestRun();

  if (!run) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart2 size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">予測精度評価</h1>
        </div>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-500">
            まだバックテストが実行されていません
          </p>
          <p className="mt-2 text-xs text-slate-400">
            GitHub Actions の <code className="bg-slate-100 px-1 rounded">ml-backtest.yml</code> を手動実行するか、毎週月曜 AM 4:00 JST の自動実行をお待ちください。
          </p>
          <p className="mt-1 text-xs text-slate-400">
            ローカルでの実行: <code className="bg-slate-100 px-1 rounded">python ml-pipeline/backtest.py</code>
          </p>
        </div>
      </main>
    );
  }

  const metrics = await fetchMetrics(run.id);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center gap-2 mb-6">
        <BarChart2 size={20} className="text-blue-600" />
        <h1 className="text-xl font-bold text-gray-800">予測精度評価</h1>
        <span className="ml-auto text-xs text-slate-400">
          データは週次バッチで更新されます
        </span>
      </div>

      {metrics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            バックテスト実行は記録されていますが、指標データが見つかりませんでした。
          </p>
          <p className="mt-1 text-xs text-slate-400">
            データが十分でない可能性があります（最低 {30 + 30} 件の体重記録が必要）。
          </p>
        </div>
      ) : (
        <BacktestResults run={run} metrics={metrics} />
      )}
    </main>
  );
}
