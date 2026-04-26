/**
 * revalidate.ts — キャッシュ再検証の集約モジュール
 *
 * Next.js の revalidatePath() 呼び出しをここに集約し、
 * 各 Server Action がバラバラに path 列挙するのを防ぐ。
 *
 * ## 使い方
 * Server Action の保存処理が成功した直後に、対応する関数を呼ぶ。
 *
 * ## 将来の revalidateTag() 移行に向けた設計
 * 現在は revalidatePath() ベースだが、fetch 側にキャッシュタグを付与したときは
 * 各関数内の実装を revalidateTag() に差し替えるだけで移行できる。
 * 呼び出し側 (Server Action) は変更不要。
 *
 * ## ページ依存マップ (更新種別 → 影響ページ)
 *
 * daily_logs 更新:
 *   /             fetchDashboardDailyLogs / fetchEnrichedLogs
 *   /history      fetchWeightLogs
 *   /macro        fetchMacroDailyLogs / fetchLatestUpdatedAt / fetchFactorAnalysis
 *   /tdee         fetchTdeeDailyLogs / fetchLatestUpdatedAt / fetchEnrichedLogs
 *   /settings     fetchDailyLogsForSettings (データ品質セクション)
 *
 * settings 更新:
 *   /             fetchSettings
 *   /history      fetchSettings
 *   /macro        fetchSettings / fetchMacroTargets
 *   /tdee         fetchSettings
 *   /settings     fetchSettingsRows
 *
 * forecast backtest 更新:
 *   /forecast-accuracy  fetchLatestRuns / fetchMetrics
 *
 * food_master / menu_master 更新:
 *   /foods       fetchFoods / fetchMenus
 *
 * analytics_cache (enriched_logs) 更新:
 *   /tdee         fetchEnrichedLogs
 *   ※ GitHub Actions の ml-daily バッチは Supabase を直接更新するため、
 *     Next.js 側の ISR キャッシュは自動で無効化されない。
 *     /tdee の手動 refresh ボタンがこの関数を呼び、バッチ後の即時反映を可能にする。
 */

import { revalidatePath } from "next/cache";

/**
 * daily_logs への書き込み後に呼ぶ。
 * daily_logs データを参照するすべてのページを再検証する。
 */
export function revalidateAfterDailyLogMutation(): void {
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/macro");
  revalidatePath("/tdee");
  revalidatePath("/settings"); // fetchDailyLogsForSettings (データ品質セクション)
}

/**
 * settings への書き込み後に呼ぶ。
 * settings データを参照するすべてのページを再検証する。
 */
export function revalidateAfterSettingsMutation(): void {
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/macro");
  revalidatePath("/tdee");
  revalidatePath("/settings");
}

/**
 * forecast backtest データの更新後に呼ぶ。
 * バックテスト結果を表示するページを再検証する。
 */
export function revalidateAfterForecastMutation(): void {
  revalidatePath("/forecast-accuracy");
}

/**
 * food_master / menu_master への書き込み後に呼ぶ。
 * 食品データベースページの Server Component 初期値を再検証する。
 */
export function revalidateAfterFoodMutation(): void {
  revalidatePath("/foods");
}

/**
 * analytics_cache の enriched_logs 更新後に呼ぶ（手動 refresh ボタン経由）。
 *
 * ml-daily バッチは GitHub Actions から Supabase を直接更新するため、
 * Next.js の ISR キャッシュ（/tdee は revalidate=3600）は自動で無効化されない。
 * 定期バッチ・手動バッチのどちらでも、ユーザーが "表示を更新" ボタンを
 * 押した時点でこの関数が呼ばれ、/tdee の ISR キャッシュを再検証する。
 */
export function revalidateAfterEnrichedLogsMutation(): void {
  revalidatePath("/tdee");
}
