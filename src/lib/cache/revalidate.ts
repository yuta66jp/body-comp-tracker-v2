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
 *   /             fetchDailyLogs / fetchEnrichedLogs
 *   /history      fetchWeightLogs
 *   /macro        fetchDailyLogs / fetchFactorAnalysis
 *   /tdee         fetchDailyLogs / fetchEnrichedLogs
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
