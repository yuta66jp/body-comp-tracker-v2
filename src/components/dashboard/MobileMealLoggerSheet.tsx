"use client";

/**
 * MobileMealLoggerSheet — 食事ログ入力シート / モーダル
 *
 * #361: モバイル専用 bottom sheet から PC/モバイル 共用コンポーネントに拡張。
 *   - モバイル (<lg): 画面下端から出現する bottom sheet（従来通り）
 *   - PC (lg+): 画面中央の centered modal overlay
 *
 * 以前は DashboardLayout の aside サイドバーが PC 側の入力 UI を担っていたが、
 * aside を廃止し、このコンポーネント一本で PC/モバイル 両方を担うように変更。
 *
 * - backdrop クリック / Esc / × ボタン で閉じる
 * - sheet open 中は body スクロールを抑制する
 * - z-50 で MobileBottomNav (z-30) より上に重なる
 */

import { useState, useEffect } from "react";
import { PenLine, X, ChevronRight } from "lucide-react";
import { MealLogger } from "@/components/meal/MealLogger";

export function MobileMealLoggerSheet() {
  const [open, setOpen] = useState(false);

  // Escape キーで閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // sheet / modal open 中は body スクロールを抑制
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div>
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-slate-100 bg-white px-3.5 py-2.5 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:shadow-none dark:hover:bg-slate-800/60 lg:max-w-xs"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
          <PenLine size={15} className="text-blue-600 dark:text-blue-400" />
        </div>
        <span className="flex-1 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">
          食事・体重を記録する
        </span>
        <ChevronRight size={14} className="flex-shrink-0 text-slate-300 dark:text-slate-600" />
      </button>

      {/* ── Backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Panel ──
          モバイル: 画面下端から出現する bottom sheet
          PC (lg+): 画面中央に表示される centered modal
      */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="食事・体重ログ入力"
          className={[
            // 共通
            "fixed z-50 overflow-hidden bg-white shadow-2xl dark:bg-slate-900",
            // モバイル: bottom sheet（left-3 right-3 で両端に余白を確保）
            "bottom-0 left-3 right-3 max-h-[88svh] rounded-t-2xl",
            // PC (lg+): centered modal — bottom/right をリセットして中央配置
            "lg:bottom-auto lg:right-auto",
            "lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2",
            "lg:w-[520px] lg:max-h-[85vh] lg:rounded-2xl",
          ].join(" ")}
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {/* Panel ヘッダー */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50">
                <PenLine size={14} className="text-blue-600" />
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">食事ログ</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="食事ログを閉じる"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X size={18} />
            </button>
          </div>

          {/* Panel コンテンツ（スクロール可能） */}
          <div
            className="overflow-y-auto overflow-x-hidden px-5 py-4"
            style={{ maxHeight: "calc(min(88svh, 85vh) - 56px)" }}
          >
            <MealLogger sidebar showHeader={false} onSaveSuccess={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
