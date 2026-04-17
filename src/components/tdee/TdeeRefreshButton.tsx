"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { revalidateTdee } from "@/app/tdee/actions";

/**
 * /tdee の ISR キャッシュを即時反映するボタン。
 *
 * 動作:
 *   1. Server Action で revalidatePath("/tdee") を実行
 *   2. router.refresh() でクライアントキャッシュをクリアして再レンダリング
 *
 * 想定ユースケース:
 *   - ml-daily の手動実行 (workflow_dispatch) 直後に DB 反映を画面で確認したいとき
 *   - 過去日ログを編集したあとに enriched_logs 再計算を反映させたいとき
 *
 * これは enrich.py の再実行ではなく、既に保存済みの analytics_cache 値の再表示のみ。
 */
export function TdeeRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleRefresh() {
    startTransition(async () => {
      await revalidateTdee();
      router.refresh();
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    });
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      {done && (
        <span className="text-xs text-emerald-600 font-medium">✓ 表示を更新しました</span>
      )}
      <button
        onClick={handleRefresh}
        disabled={isPending}
        title="ML バッチ実行後の最新データを即時反映します（再計算ではありません）"
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <RefreshCw size={13} className={isPending ? "animate-spin" : ""} />
        {isPending ? "更新中..." : "表示を更新"}
      </button>
    </div>
  );
}
