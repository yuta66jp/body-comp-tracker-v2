"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { revalidateForecastAccuracy } from "@/app/forecast-accuracy/actions";

/**
 * 保存済みバックテスト結果を即時反映するボタン。
 *
 * 動作:
 *   1. Server Action で revalidatePath("/forecast-accuracy") を実行
 *   2. router.refresh() でクライアントキャッシュをクリアして再レンダリング
 *
 * これは backtest の再実行ではなく、表示の再検証のみ。
 */
export function ForecastAccuracyRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleRefresh() {
    startTransition(async () => {
      await revalidateForecastAccuracy();
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
        title="保存済みのバックテスト結果を再反映します（再計算ではありません）"
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw size={13} className={isPending ? "animate-spin" : ""} />
        {isPending ? "更新中..." : "表示を更新"}
      </button>
    </div>
  );
}
