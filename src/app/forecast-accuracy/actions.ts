"use server";

import { revalidateAfterForecastMutation } from "@/lib/cache/revalidate";

/**
 * 保存済みバックテスト結果を即時反映するための再検証アクション。
 *
 * backtest の再実行ではなく、ISR キャッシュの再検証のみを行う。
 * 通常運用は revalidate = 3600 で十分だが、バッチ実行直後の確認時に利用する。
 */
export async function revalidateForecastAccuracy(): Promise<void> {
  revalidateAfterForecastMutation();
}
