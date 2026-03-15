/**
 * サーバーサイドクエリの状態付き戻り値型。
 *
 * kind: "ok"    — 取得成功。data は空配列・null フィールドも含む正常値。
 * kind: "error" — Supabase フェッチで予期しないエラー発生。
 *
 * 使い分け:
 *   ok with empty data — "データがない" (未入力・未設定) = 正常な空状態
 *   error              — "取得エラー" (DB 接続失敗・認証エラー等)
 *
 * analytics_cache の fresh / stale / unavailable は
 * AnalyticsAvailability (analytics/status.ts) で管理する。
 * daily_logs / settings はこの型を使用する。
 */
export type QueryResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "error"; message: string };
