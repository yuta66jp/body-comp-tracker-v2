"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";

interface ToastProps {
  type: "success" | "error";
  message: string;
  visible: boolean;
}

/**
 * Toast — 非モーダルの一時通知コンポーネント
 *
 * fixed 配置で画面右上に表示する。z-[60] で MobileMealLoggerSheet (z-50) より上に重なる。
 * 表示タイミング・自動消去は呼び元の state 管理に委ねる（visible prop で制御）。
 * スクリーンリーダー向け: 成功は aria-live="polite"、エラーは aria-live="assertive"。
 */
export function Toast({ type, message, visible }: ToastProps) {
  if (!visible) return null;

  const isSuccess = type === "success";
  return (
    <div
      role="status"
      aria-live={isSuccess ? "polite" : "assertive"}
      className={`fixed top-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-80 z-[60] flex items-center gap-2.5 rounded-2xl border px-4 py-3 shadow-lg text-sm font-medium ${
        isSuccess
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 size={16} className="shrink-0" />
      ) : (
        <AlertCircle size={16} className="shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
}
