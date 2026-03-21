/**
 * daily_logs テーブルの read 責務を集約する。
 *
 * ## 現行クエリ一覧
 *
 * | 関数 | 取得列 | 用途 | 戻り値型 |
 * |---|---|---|---|
 * | fetchDailyLogs()            | 全列 (*)              | Dashboard / TDEE / Macro 共用 | QueryResult |
 * | fetchWeightLogs()           | log_date, weight      | History ページ補助            | ベストエフォート |
 * | fetchDailyLogsForSettings() | log_date, weight, calories | Settings DataQuality 計算 | QueryResult |
 *
 * ## 後続 Issue での分割方針（#164 設計整理済み）
 *
 * 現在 fetchDailyLogs() は全件・全列取得だが、以下の分割が検討されている:
 * - #166 (Macro): fetchMacroDailyLogs(60)  — 6列・DESC LIMIT 60
 * - #167 (TDEE) : fetchRecentDailyLogs(14) — 3列・DESC LIMIT 14
 * - 両画面の stale 判定: fetchLatestUpdatedAt() — MAX(updated_at) のみ
 * - Dashboard は全期間・全列が必要なため fetchDailyLogs() を継続利用
 *
 * 詳細: docs/daily-logs-read-inventory.md
 *
 * ## write 系・UI 固有文言はここに含めない
 */
import { createClient } from "@/lib/supabase/server";
import type { DailyLog, CareerLog, Prediction } from "@/lib/supabase/types";
import type { DataQualityLog } from "@/lib/utils/calcDataQuality";
import type { QueryResult } from "./queryResult";

/**
 * daily_logs を全カラム・日付昇順で取得する。
 *
 * 利用画面:
 *   - Dashboard: 全期間・全列が必要（月次計画・ForecastChart・calcReadiness 等）
 *   - Macro: 現状全件取得だが #166 で fetchMacroDailyLogs(60) に分離予定
 *   - TDEE:  現状全件取得だが #167 で fetchRecentDailyLogs(14) に分離予定
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
 *
 * 利用画面: History ページ専用（currentLogs → currentAsCareer 変換用補助クエリ）。
 * 他画面への流用禁止（用途が混在するとクエリ責務が不明確になる）。
 * weight が null のレコードは除外する。
 *
 * フォールバック: エラー時は空配列を返す（ベストエフォート）。
 * 補助的データのため空配列でも history ページの主要機能は維持される。
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
 *
 * 利用画面: Settings ページ専用（DataQuality 計算 + currentWeight 取得）。
 * 他画面への流用禁止（用途が混在するとクエリ責務が不明確になる）。
 *
 * 戻り値型は DataQualityLog[] (= Pick<DailyLog, "log_date" | "weight" | "calories">[])
 * で実取得列に一致させてある。未取得列を呼び出し側が参照すると型エラーになる。
 *
 * 戻り値:
 *   kind: "ok"    — 取得成功。data が空配列 = ログ未入力（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 */
export async function fetchDailyLogsForSettings(): Promise<QueryResult<DataQualityLog[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date, weight, calories")
    .order("log_date", { ascending: true });
  if (error) {
    console.error("[fetchDailyLogsForSettings] daily_logs fetch error:", error.message, { code: error.code });
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", data: (data as DataQualityLog[]) ?? [] };
}

/**
 * career_logs を全カラム・日付昇順で取得する。
 * History ページの主データとして使われる。
 *
 * 戻り値:
 *   kind: "ok"    — 取得成功。data が空配列 = 過去シーズンデータ未登録（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 */
export async function fetchCareerLogs(): Promise<QueryResult<CareerLog[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("career_logs")
    .select("*")
    .order("log_date", { ascending: true });
  if (error) {
    console.error("[fetchCareerLogs] career_logs fetch error:", error.message, { code: error.code });
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", data: (data as CareerLog[]) ?? [] };
}

/**
 * career_logs から log_date / season / target_date のみを取得する。
 * Dashboard ページのシーズンマップ構築用（全カラム不要）。
 *
 * フォールバック: エラー時は空配列を返す（ベストエフォート）。
 * シーズンバッジは補助表示のため、取得失敗時は非表示になるだけで主要機能は維持される。
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
 * フォールバック: エラー時は空配列を返す（ベストエフォート）。
 * ForecastChart は predictions が空のとき非表示になるため、取得失敗時も graceful degradation が成立する。
 * ML バッチが未実行の場合も空配列が正常な空状態として扱われるため QueryResult 化は不要。
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
