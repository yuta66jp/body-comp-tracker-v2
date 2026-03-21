/**
 * daily_logs テーブルの read 責務を集約する。
 *
 * ## 現行クエリ一覧
 *
 * | 関数 | 取得列 | 用途 | 戻り値型 |
 * |---|---|---|---|
 * | fetchDashboardDailyLogs()   | 16列（note・leg_flag 除く） | Dashboard 専用 (#165)       | QueryResult |
 * | fetchDailyLogs()            | 全列 (*)                   | Macro / TDEE 暫定共用 (#166/#167 で廃止予定) | QueryResult |
 * | fetchWeightLogs()           | log_date, weight           | History ページ補助          | ベストエフォート |
 * | fetchDailyLogsForSettings() | log_date, weight, calories | Settings DataQuality 計算  | QueryResult |
 *
 * ## 後続 Issue での分割方針（#164 設計整理済み）
 *
 * - #165 (Dashboard): fetchDashboardDailyLogs() を新設。全期間・16列。
 * - #166 (Macro): fetchMacroDailyLogs(60)  — 6列・DESC LIMIT 60
 * - #167 (TDEE) : fetchRecentDailyLogs(14) — 3列・DESC LIMIT 14
 * - 両画面の stale 判定: fetchLatestUpdatedAt() — MAX(updated_at) のみ
 * - #166/#167 完了後、fetchDailyLogs() は削除予定
 *
 * 詳細: docs/daily-logs-read-inventory.md
 *
 * ## write 系・UI 固有文言はここに含めない
 */
import { createClient } from "@/lib/supabase/server";
import type { DailyLog, DashboardDailyLog, CareerLog, Prediction } from "@/lib/supabase/types";
import type { DataQualityLog } from "@/lib/utils/calcDataQuality";
import type { QueryResult } from "./queryResult";

/**
 * Dashboard 専用: daily_logs を 16 列・全期間・日付昇順で取得する。
 *
 * ## 取得列と除外列の根拠（#165 棚卸し済み）
 *
 * 取得列 (16列):
 *   log_date, weight, calories, protein, fat, carbs,
 *   is_cheat_day, is_refeed_day, is_eating_out, is_travel_day, is_poor_sleep,
 *   sleep_hours, had_bowel_movement, training_type, work_mode, updated_at
 *
 * 除外列 (2列):
 *   - note     : Dashboard のいずれの関数・コンポーネントでも参照されない
 *   - leg_flag : Dashboard では参照されない（training_type から導出される派生値）
 *
 * ## 用途別の列対応
 *   - calcReadiness          : log_date, weight
 *   - calcWeeklyReview       : log_date, calories, protein, fat, carbs,
 *                              is_cheat_day, is_refeed_day, is_eating_out, is_travel_day, is_poor_sleep
 *   - calcDataQuality        : log_date, weight, calories
 *   - monthlyGoalVisualization: log_date, weight
 *   - calendarUtils          : log_date, weight, calories, had_bowel_movement, training_type, work_mode,
 *                              is_cheat_day, is_refeed_day, is_eating_out, is_travel_day, is_poor_sleep
 *   - RecentLogsTable        : log_date, weight, calories, sleep_hours, had_bowel_movement,
 *                              training_type, work_mode, is_cheat_day, is_refeed_day,
 *                              is_eating_out, is_travel_day, is_poor_sleep
 *   - ForecastChart          : log_date, weight
 *   - buildMonthStats        : log_date, weight, calories, protein
 *   - stale 判定             : updated_at (MAX を page.tsx で算出して fetchEnrichedLogs に渡す)
 *
 * ## 全期間が必要な理由
 *   - calcReadiness のトレンド計算（14日・30日平均）
 *   - monthlyGoalVisualization の月次実績集計（大会月まで全月必要）
 *   - ForecastChart の全期間体重プロット
 *   - stale 判定の MAX(updated_at) は全ログ走査が必要
 *
 * 戻り値:
 *   kind: "ok"    — 取得成功。data が空配列 = ログ未入力（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 */
export async function fetchDashboardDailyLogs(): Promise<QueryResult<DashboardDailyLog[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select(
      "log_date, weight, calories, protein, fat, carbs, " +
      "is_cheat_day, is_refeed_day, is_eating_out, is_travel_day, is_poor_sleep, " +
      "sleep_hours, had_bowel_movement, training_type, work_mode, updated_at"
    )
    .order("log_date", { ascending: true });
  if (error) {
    console.error("[fetchDashboardDailyLogs] daily_logs fetch error:", error.message, { code: error.code });
    return { kind: "error", message: error.message };
  }
  // 列を明示指定すると supabase-js が戻り値型を絞り込むため unknown 経由でキャストする。
  // DashboardDailyLog は取得列と 1:1 対応しており、未取得の note / leg_flag は含まない。
  return { kind: "ok", data: (data as unknown as DashboardDailyLog[]) ?? [] };
}

/**
 * daily_logs を全カラム・日付昇順で取得する。
 *
 * @deprecated Dashboard は fetchDashboardDailyLogs() を使用すること。
 * このクエリは Macro / TDEE の暫定共用クエリとして残しており、
 * #166 (Macro) / #167 (TDEE) の専用クエリ実装後に削除予定。
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
