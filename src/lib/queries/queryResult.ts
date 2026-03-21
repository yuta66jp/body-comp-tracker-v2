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
 * この型を使用する関数 (空状態と取得エラーを区別すべき主要クエリ):
 *   - fetchDashboardDailyLogs   (daily_logs 16列 — Dashboard 専用)
 *   - fetchMacroDailyLogs       (daily_logs 6列 LIMIT 60 — Macro 専用)
 *   - fetchTdeeDailyLogs        (daily_logs 3列 LIMIT 30 — TDEE 専用)
 *   - fetchDailyLogsForSettings (daily_logs — settings ページ用)
 *   - fetchCareerLogs           (career_logs — history ページ主データ)
 *   - fetchSettings             (settings → AppSettings 変換)
 *   - fetchSettingsRows         (settings 行配列 — SettingsForm 用)
 *   - fetchFoods                (food_master — foods ページ主データ)
 *   - fetchMenus                (menu_master — foods ページ主データ)
 *   - fetchLatestRuns           (forecast_backtest_runs — 予測精度ページ主データ)
 *   - fetchMetrics              (forecast_backtest_metrics — 予測精度ページ主データ)
 *
 * ベストエフォート (空配列フォールバックで graceful degradation が成立する補助クエリ):
 *   - fetchWeightLogs / fetchCareerLogsForDashboard / fetchPredictions
 *   - fetchMacroTargets
 *   各関数の JSDoc に意図を明記している。
 *
 * analytics_cache の fresh / stale / unavailable / error は
 * AnalyticsAvailability (src/lib/analytics/status.ts) で管理する。
 */
export type QueryResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "error"; message: string };
