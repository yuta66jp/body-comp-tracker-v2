/**
 * forecast_backtest_runs / forecast_backtest_metrics テーブルの read 責務を集約する。
 *
 * - fetchLatestRuns()          : 最新 20 件の run を取得し、daily / sma7 それぞれの最新 run を返す
 * - fetchMetrics()             : 指定 run_id のメトリクスを取得する
 * - fetchFlaggedLogsForRun()   : 指定日付範囲の cheat / travel フラグ付き daily_logs を取得する
 *                                (除外日一覧の再導出に使用)
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
 * 最新 20 件の run を取得し、daily / sma7 それぞれの最新 run と直前 run を返す。
 * 旧来の run (config.series_type なし) は daily として扱う。
 *
 * 戻り値:
 *   kind: "ok"    — 取得成功。各 run が null = バックテスト未実行 / 前回なし（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 *
 * エラー時に null を返すと「バックテスト未実行」と誤表示されるため QueryResult を使用する。
 */
export async function fetchLatestRuns(): Promise<QueryResult<{
  dailyRun: ForecastBacktestRun | null;
  sma7Run: ForecastBacktestRun | null;
  prevDailyRun: ForecastBacktestRun | null;
  prevSma7Run: ForecastBacktestRun | null;
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
  const dailyRuns = runs.filter((r) => getSeriesType(r) === "daily");
  const sma7Runs  = runs.filter((r) => getSeriesType(r) === "sma7");

  return {
    kind: "ok",
    data: {
      dailyRun:     dailyRuns[0] ?? null,
      sma7Run:      sma7Runs[0]  ?? null,
      prevDailyRun: dailyRuns[1] ?? null,
      prevSma7Run:  sma7Runs[1]  ?? null,
    },
  };
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

/**
 * 指定日付範囲の daily_logs から cheat / travel フラグのある行を取得する。
 *
 * 用途: BacktestExcludedDates コンポーネントが除外日一覧を再導出するために使用する。
 *       (除外日は DB に保存されていないため、フロント側で run.config + daily_logs から再構築する)
 *
 * ベストエフォート: エラー時は空配列を返しページをブロックしない。
 * 意図的に QueryResult 化しない: 除外日一覧表示は補助情報であり、失敗してもページ全体に影響しない。
 *
 * @param minDate - 取得開始日 (YYYY-MM-DD、含む)
 * @param maxDate - 取得終了日 (YYYY-MM-DD、含む)
 */
export async function fetchFlaggedLogsForRun(
  minDate: string,
  maxDate: string,
): Promise<Array<{ log_date: string; is_cheat_day: boolean | null; is_travel_day: boolean | null }>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date, is_cheat_day, is_travel_day")
    .gte("log_date", minDate)
    .lte("log_date", maxDate)
    .order("log_date", { ascending: true });

  if (error) {
    console.error("[fetchFlaggedLogsForRun] daily_logs fetch error:", error.message);
    return [];
  }
  return (data as Array<{ log_date: string; is_cheat_day: boolean | null; is_travel_day: boolean | null }>) ?? [];
}
