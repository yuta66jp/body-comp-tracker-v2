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
import { PenLine, X } from "lucide-react";
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
    <div className="flex justify-center">
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 py-3.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 active:bg-blue-200 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30 lg:max-w-sm"
      >
        <PenLine size={16} />
        食事・体重を記録する
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
            "fixed z-50 bg-white shadow-2xl dark:bg-slate-900",
            // モバイル: bottom sheet
            "bottom-0 left-0 right-0 max-h-[88svh] rounded-t-2xl",
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
            className="overflow-y-auto px-5 py-4"
            style={{ maxHeight: "calc(min(88svh, 85vh) - 56px)" }}
          >
            <MealLogger sidebar showHeader={false} onSaveSuccess={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
