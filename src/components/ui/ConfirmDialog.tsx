"use client";

import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // オープン時: キャンセルボタンにフォーカス（破壊的操作のデフォルトとして安全側）
  // クローズ時: 呼び出し元の要素にフォーカスを戻す
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  // Escape キーでキャンセル + ダイアログ内フォーカストラップ
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        const focusable = [cancelRef.current, confirmRef.current].filter(
          (el): el is HTMLButtonElement => el !== null
        );
        if (focusable.length === 0) return;
        const currentIdx = focusable.indexOf(document.activeElement as HTMLButtonElement);
        const nextIdx = e.shiftKey
          ? (currentIdx <= 0 ? focusable.length - 1 : currentIdx - 1)
          : (currentIdx >= focusable.length - 1 ? 0 : currentIdx + 1);
        focusable[nextIdx]?.focus();
        e.preventDefault();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="削除の確認"
        className="mx-4 w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-slate-700 dark:text-slate-200">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 px-4 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            キャンセル
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="rounded-lg bg-rose-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-600"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
