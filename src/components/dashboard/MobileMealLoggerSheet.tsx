"use client";

/**
 * MobileMealLoggerSheet — モバイル専用の食事ログ入力 bottom sheet
 *
 * デスクトップ (lg+) では何も描画しない（aside の MealLogger を使う）。
 * モバイルでは trigger ボタンを表示し、タップで bottom sheet を開く。
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

  // sheet 開閉中は body スクロールを抑制
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 py-3.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 active:bg-blue-200"
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

      {/* ── Bottom Sheet ── */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="食事・体重ログ入力"
          className="fixed bottom-0 left-0 right-0 z-50 max-h-[88svh] rounded-t-2xl bg-white shadow-2xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {/* Sheet ヘッダー */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50">
                <PenLine size={14} className="text-blue-600" />
              </div>
              <span className="text-sm font-semibold text-slate-700">食事ログ</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="食事ログを閉じる"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          </div>

          {/* Sheet コンテンツ（スクロール可能） */}
          <div
            className="overflow-y-auto px-5 py-4"
            style={{ maxHeight: "calc(88svh - 56px)" }}
          >
            <MealLogger sidebar showHeader={false} />
          </div>
        </div>
      )}
    </div>
  );
}
