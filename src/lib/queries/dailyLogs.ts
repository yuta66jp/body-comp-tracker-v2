/**
 * daily_logs テーブルの **front SSR 専用 projection query** を集約する。
 *
 * ## このモジュールのスコープ
 *
 * - Server Components / Server Actions / Route Handlers が Next.js SSR 時に呼ぶ read query
 * - すべての関数は「画面が必要とする列のみ」の projection query であり、全列 full read は含まない
 * - write 系・UI 固有文言はここに含めない
 *
 * ## full read が必要な箇所（このモジュール外で管理）
 *
 * | 経路 | 場所 | 用途 |
 * |---|---|---|
 * | Client SWR hook    | `src/lib/hooks/useDailyLogs.ts`    | MealLogger フォーム hydration 用クライアント全列取得 |
 * | CSV export route   | `src/app/api/export/route.ts`      | CSV ダウンロード用全列取得（全列が必要）              |
 * | ML/batch (Python)  | `ml-pipeline/enrich.py`, `analyze.py` | TDEE・因子分析バッチ。supabase-py 経由で直接読む    |
 *
 * front 側の Server Component ページがこれらの経路を使わないようにすること。
 * 新しい画面を追加する場合は、必要な列を絞った専用 query をここに追加すること。
 *
 * ## 現行クエリ一覧
 *
 * | 関数 | 取得列 | 用途 | 戻り値型 |
 * |---|---|---|---|
 * | fetchDashboardDailyLogs()   | 16列（note・leg_flag 除く）  | Dashboard 専用 (#165)                | QueryResult |
 * | fetchMacroDailyLogs(days)   | 6列・DESC LIMIT days         | Macro 専用 (#166)                    | QueryResult |
 * | fetchTdeeDailyLogs(limit)   | 3列・DESC LIMIT limit        | TDEE raw fallback 専用 (#166)        | QueryResult |
 * | fetchLatestUpdatedAt()      | updated_at 1行               | stale 判定用（Macro/TDEE共用）       | ベストエフォート |
 * | fetchWeightLogs()           | log_date, weight             | History ページ補助                   | ベストエフォート |
 * | fetchDailyLogsForSettings() | log_date, weight, calories   | Settings DataQuality 計算            | QueryResult |
 *
 * 詳細: docs/daily-logs-read-inventory.md
 */
import { createClient } from "@/lib/supabase/server";
import type { DailyLog, DashboardDailyLog, MacroDailyLog, TdeeDailyLog, CareerLog, Prediction } from "@/lib/supabase/types";
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
 * Macro ページ専用: 直近 days 日分の daily_logs を 6 列で取得する。
 *
 * 取得列: log_date, weight, calories, protein, fat, carbs
 * 並び順: 日付降順で LIMIT {days} 取得後、昇順に並び直して返す。
 *
 * stale 判定: updated_at は取得しない。stale 判定が必要な場合は fetchLatestUpdatedAt() を別途呼ぶこと。
 *
 * 戻り値:
 *   kind: "ok"    — 取得成功。data が空配列 = ログ未入力（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 */
export async function fetchMacroDailyLogs(days = 60): Promise<QueryResult<MacroDailyLog[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date, weight, calories, protein, fat, carbs")
    .order("log_date", { ascending: false })
    .limit(days);
  if (error) {
    console.error("[fetchMacroDailyLogs] daily_logs fetch error:", error.message, { code: error.code });
    return { kind: "error", message: error.message };
  }
  const sorted = ((data as unknown as MacroDailyLog[]) ?? []).reverse();
  return { kind: "ok", data: sorted };
}

/**
 * TDEE ページ専用: 直近 limit 行の daily_logs を 3 列で取得する。
 *
 * 取得列: log_date, weight, calories
 * 並び順: 日付降順で LIMIT {limit} 取得後、昇順に並び直して返す。
 *
 * ## デフォルト値 180 の根拠
 * enriched_logs が unavailable（ML バッチ未実行）の場合、グラフは raw ログを
 * fallback として直接描画する。TDEE 推移は「約 6 か月の体重推移」として
 * 引き続き表示されることが要件のため、約 6 か月 ≈ 180 日を確保する。
 * enriched が fresh / stale の場合は enrichedRows が主軸となるため
 * 余分な取得は KPI / table の slice 範囲にのみ影響し、機能面への影響はない。
 *
 * ## page.tsx 側での切り出し方針
 *   - fallback グラフ: 取得全体（最大 180 行）を使う
 *   - KPI（直近 7 / 14 日集計）: sortedRaw.slice(-14) / slice(-7) で切り出す
 *   - テーブル（直近 14 日）: sortedRaw.slice(-14) で切り出す
 *   - latestWeight: weight != null の末尾行を使う
 *
 * stale 判定: updated_at は取得しない。stale 判定が必要な場合は fetchLatestUpdatedAt() を別途呼ぶこと。
 *
 * 戻り値:
 *   kind: "ok"    — 取得成功。data が空配列 = ログ未入力（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で graceful degradation すること。
 */
export async function fetchTdeeDailyLogs(limit = 180): Promise<QueryResult<TdeeDailyLog[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date, weight, calories")
    .order("log_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[fetchTdeeDailyLogs] daily_logs fetch error:", error.message, { code: error.code });
    return { kind: "error", message: error.message };
  }
  const sorted = ((data as unknown as TdeeDailyLog[]) ?? []).reverse();
  return { kind: "ok", data: sorted };
}

/**
 * daily_logs の最終更新日時を取得する。
 *
 * Macro / TDEE ページの analytics_cache stale 判定用。
 * MAX(log_date) ではなく MAX(updated_at) を使うことで、
 * 過去日ログの更新でも正しく stale を検知できる。
 *
 * フォールバック: エラー時は null を返す（ベストエフォート）。
 * stale 判定が null になると fetchEnrichedLogs / fetchFactorAnalysis が
 * キャッシュを常に fresh とみなすため、最悪ケースでも表示は崩れない。
 */
export async function fetchLatestUpdatedAt(): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("[fetchLatestUpdatedAt] daily_logs fetch error:", error.message);
    return null;
  }
  const row = (data as { updated_at: string }[] | null)?.[0];
  return row?.updated_at ?? null;
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
