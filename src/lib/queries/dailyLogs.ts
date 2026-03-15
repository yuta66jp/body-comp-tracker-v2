/**
 * daily_logs テーブルの read 責務を集約する。
 *
 * - fetchDailyLogs()           : 全カラム・昇順。Dashboard / TDEE / Macro ページ用
 * - fetchWeightLogs()          : log_date + weight のみ。重みの軽いクエリが必要な場面用
 * - fetchDailyLogsForSettings(): log_date + weight + calories のみ。DataQuality 計算用
 * - fetchCareerLogs()          : career_logs テーブル取得。History / Dashboard ページ用
 * - fetchPredictions()         : predictions テーブル取得。Dashboard ページ用
 *
 * write 系（upsert / insert / update）はここに含めない。
 * UI 固有の表示文言はここに含めない。
 */
import { createClient } from "@/lib/supabase/server";
import type { DailyLog, CareerLog, Prediction } from "@/lib/supabase/types";
import type { QueryResult } from "./queryResult";

/**
 * daily_logs を全カラム・日付昇順で取得する。
 * Dashboard / TDEE / Macro ページで最もよく使われる形式。
 *
 * 戻り値:
 *   kind: "ok"    — 取得成功。data が空配列 = ログ未入力（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 */
export async function fetchDailyLogs(): Promise<QueryResult<DailyLog[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("*")
    .order("log_date", { ascending: true });
  if (error) {
    console.error("[fetchDailyLogs] daily_logs fetch error:", error.message, { code: error.code });
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", data: (data as DailyLog[]) ?? [] };
}

/**
 * daily_logs から log_date と weight のみを取得する。
 * 体重のみが必要な軽量クエリ用（history ページの currentLogs）。
 * weight が null のレコードは除外する。
 *
 * フォールバック: エラー時は空配列を返す。
 */
export async function fetchWeightLogs(): Promise<Pick<DailyLog, "log_date" | "weight">[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date, weight")
    .not("weight", "is", null)
    .order("log_date", { ascending: true });
  if (error) {
    console.error("daily_logs (weight only) fetch error:", error.message);
    return [];
  }
  return (data as Pick<DailyLog, "log_date" | "weight">[]) ?? [];
}

/**
 * daily_logs から log_date / weight / calories のみを取得する。
 * DataQuality 計算（settings ページ）用。
 *
 * 戻り値は DailyLog[] として型付けされるが、実際には 3 カラムのみ取得する。
 * calcDataQuality が参照するのは log_date / weight / calories のみのため安全。
 *
 * フォールバック: エラー時は空配列を返す。
 */
export async function fetchDailyLogsForSettings(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date, weight, calories")
    .order("log_date", { ascending: true });
  if (error) {
    console.error("daily_logs (settings) fetch error:", error.message);
    return [];
  }
  return (data as DailyLog[]) ?? [];
}

/**
 * career_logs を全カラム・日付昇順で取得する。
 * History / Dashboard ページで使われる。
 *
 * フォールバック: エラー時は空配列を返す。
 */
export async function fetchCareerLogs(): Promise<CareerLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("career_logs")
    .select("*")
    .order("log_date", { ascending: true });
  if (error) {
    console.error("career_logs fetch error:", error.message);
    return [];
  }
  return (data as CareerLog[]) ?? [];
}

/**
 * career_logs から log_date / season / target_date のみを取得する。
 * Dashboard ページのシーズンマップ構築用（全カラム不要）。
 *
 * フォールバック: エラー時は空配列を返す。
 */
export async function fetchCareerLogsForDashboard(): Promise<Pick<CareerLog, "log_date" | "season" | "target_date">[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("career_logs")
    .select("log_date, season, target_date")
    .order("log_date");
  if (error) return [];
  return (data as Pick<CareerLog, "log_date" | "season" | "target_date">[]) ?? [];
}

/**
 * predictions を全カラム・日付昇順で取得する。
 * Dashboard ページの ForecastChart 用。
 *
 * フォールバック: エラー時は空配列を返す。
 */
export async function fetchPredictions(): Promise<Prediction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("predictions")
    .select("*")
    .order("ds", { ascending: true });
  if (error) {
    console.error("predictions fetch error:", error.message);
    return [];
  }
  return (data as Prediction[]) ?? [];
}
