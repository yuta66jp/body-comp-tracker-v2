/**
 * forecast_backtest_runs / forecast_backtest_metrics テーブルの read 責務を集約する。
 *
 * - fetchLatestRuns()   : 最新 20 件の run を取得し、daily / sma7 それぞれの最新 run を返す
 * - fetchMetrics()      : 指定 run_id のメトリクスを取得する
 *
 * write 系はここに含めない。
 * UI 固有の表示文言はここに含めない。
 */
import { createClient } from "@/lib/supabase/server";
import type { ForecastBacktestRun, ForecastBacktestMetric, Json } from "@/lib/supabase/types";

/**
 * config.series_type を安全に読み出す。
 * 旧来の run (series_type なし) は "daily" として扱う。
 */
function getSeriesType(run: ForecastBacktestRun): string {
  const cfg = run.config;
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const st = (cfg as Record<string, Json>)["series_type"];
    if (typeof st === "string") return st;
  }
  return "daily";
}

/**
 * 最新 20 件の run を取得し、daily / sma7 それぞれの最新 run を返す。
 * 旧来の run (config.series_type なし) は daily として扱う。
 *
 * フォールバック: エラー時は { dailyRun: null, sma7Run: null } を返す。
 */
export async function fetchLatestRuns(): Promise<{
  dailyRun: ForecastBacktestRun | null;
  sma7Run: ForecastBacktestRun | null;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forecast_backtest_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("forecast_backtest_runs fetch error:", error.message);
    return { dailyRun: null, sma7Run: null };
  }

  const runs = (data as ForecastBacktestRun[]) ?? [];
  const dailyRun = runs.find((r) => getSeriesType(r) === "daily") ?? null;
  const sma7Run = runs.find((r) => getSeriesType(r) === "sma7") ?? null;

  return { dailyRun, sma7Run };
}

/**
 * 指定 run_id のメトリクスを horizon_days 昇順で取得する。
 *
 * フォールバック: エラー時は空配列を返す。
 */
export async function fetchMetrics(runId: string): Promise<ForecastBacktestMetric[]> {
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
