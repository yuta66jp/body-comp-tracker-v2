"use server";

import { revalidateAfterEnrichedLogsMutation } from "@/lib/cache/revalidate";

/**
 * /tdee の ISR キャッシュを再検証する Server Action。
 *
 * ml-daily バッチ（enrich.py）は GitHub Actions から Supabase を直接更新するため、
 * Next.js の ISR キャッシュは自動で無効化されない。
 * ユーザーが "表示を更新" ボタンを押したときにこのアクションを呼び、
 * 定期バッチ・手動バッチの双方で同じ経路で即時反映を可能にする。
 *
 * enrich.py 再実行などのバッチ再計算は行わない（表示の再検証のみ）。
 */
export async function revalidateTdee(): Promise<void> {
  revalidateAfterEnrichedLogsMutation();
}
