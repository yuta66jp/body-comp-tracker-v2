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
import type { QueryResult } from "./queryResult";

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
 * 戻り値:
 *   kind: "ok"    — 取得成功。dailyRun / sma7Run が null = バックテスト未実行（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 *
 * エラー時に null を返すと「バックテスト未実行」と誤表示されるため QueryResult を使用する。
 */
export async function fetchLatestRuns(): Promise<QueryResult<{
  dailyRun: ForecastBacktestRun | null;
  sma7Run: ForecastBacktestRun | null;
}>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forecast_backtest_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[fetchLatestRuns] forecast_backtest_runs fetch error:", error.message);
    return { kind: "error", message: error.message };
  }

  const runs = (data as ForecastBacktestRun[]) ?? [];
  const dailyRun = runs.find((r) => getSeriesType(r) === "daily") ?? null;
  const sma7Run = runs.find((r) => getSeriesType(r) === "sma7") ?? null;

  return { kind: "ok", data: { dailyRun, sma7Run } };
}

/**
 * 指定 run_id のメトリクスを horizon_days 昇順で取得する。
 *
 * 戻り値:
 *   kind: "ok"    — 取得成功。data が空配列 = 指標データ未生成（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 *
 * run の存在は fetchLatestRuns で確認済みのうえで呼ばれるため、
 * エラー時に空配列を返すと「指標データが見つかりませんでした」と誤表示されるおそれがある。
 */
export async function fetchMetrics(runId: string): Promise<QueryResult<ForecastBacktestMetric[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forecast_backtest_metrics")
    .select("*")
    .eq("run_id", runId)
    .order("horizon_days", { ascending: true });
  if (error) {
    console.error("[fetchMetrics] forecast_backtest_metrics fetch error:", error.message);
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", data: (data as ForecastBacktestMetric[]) ?? [] };
}
