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

/** config JSON から文字列フィールドを安全に読み出す。存在しない場合は null。 */
function cfgStr(run: ForecastBacktestRun, key: string): string | null {
  const cfg = run.config;
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const v = (cfg as Record<string, Json>)[key];
    if (typeof v === "string") return v;
  }
  return null;
}

/** config JSON から数値フィールドを安全に読み出す。存在しない場合は null。 */
function cfgNum(run: ForecastBacktestRun, key: string): number | null {
  const cfg = run.config;
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const v = (cfg as Record<string, Json>)[key];
    if (typeof v === "number") return v;
  }
  return null;
}

/**
 * prev run の実行条件が current run と比較可能か判定する。
 *
 * 判定フィールド:
 *   - horizons         : 評価ホライズンセットが異なると同じホライズンの MAE を比較できない
 *   - feature_set      : 使用特徴量セットが異なると別実験とみなす
 *   - origin_step_days : 評価ウィンドウのサンプリング間隔が異なると評価精度の分母が変わる
 *
 * フィールドが旧 run に存在しない場合は比較可能とみなす (graceful fallback)。
 * eval_policies は BacktestComparison が all_days のみ参照するため判定不要。
 */
function isRunComparable(current: ForecastBacktestRun, prev: ForecastBacktestRun): boolean {
  // horizons: top-level number[] カラムで比較 (順序不同)
  const curH = [...(current.horizons ?? [])].sort((a, b) => a - b);
  const preH = [...(prev.horizons    ?? [])].sort((a, b) => a - b);
  if (curH.length !== preH.length || curH.some((v, i) => v !== preH[i])) return false;

  // feature_set: config JSON フィールド (どちらかが読めない場合はスキップ)
  const curFs = cfgStr(current, "feature_set");
  const preFs = cfgStr(prev,    "feature_set");
  if (curFs !== null && preFs !== null && curFs !== preFs) return false;

  // origin_step_days: config JSON フィールド (どちらかが読めない場合はスキップ)
  const curStep = cfgNum(current, "origin_step_days");
  const preStep = cfgNum(prev,    "origin_step_days");
  if (curStep !== null && preStep !== null && curStep !== preStep) return false;

  return true;
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
  /** true = 前回 daily run と実行条件が一致し、前回比として比較可能。false = 条件が異なり比較不可。 */
  prevDailyRunComparable: boolean;
  /** true = 前回 sma7 run と実行条件が一致し、前回比として比較可能。false = 条件が異なり比較不可。 */
  prevSma7RunComparable: boolean;
}>> {
  const supabase = await createClient();
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

  // 前回 run が存在する場合のみ比較可能性を判定する。
  // 前回 run が存在しない場合は true にしておくが、prev metrics が空なので MaeDeltaBadge は表示されない。
  const prevDailyRunComparable =
    dailyRuns[0] && dailyRuns[1] ? isRunComparable(dailyRuns[0], dailyRuns[1]) : true;
  const prevSma7RunComparable =
    sma7Runs[0] && sma7Runs[1] ? isRunComparable(sma7Runs[0], sma7Runs[1]) : true;

  return {
    kind: "ok",
    data: {
      dailyRun:              dailyRuns[0] ?? null,
      sma7Run:               sma7Runs[0]  ?? null,
      prevDailyRun:          dailyRuns[1] ?? null,
      prevSma7Run:           sma7Runs[1]  ?? null,
      prevDailyRunComparable,
      prevSma7RunComparable,
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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
