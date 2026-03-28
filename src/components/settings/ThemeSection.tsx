"use client";
/**
 * ThemeSection — 設定画面のテーマ切り替えセクション
 *
 * ライト / システム / ダーク の 3 択セグメントコントロール。
 * 選択状態は useTheme フックが localStorage に保存し、再訪時にも維持される。
 *
 * ## UI 仕様
 *   - ラジオグループ (role="radiogroup") で Light / System / Dark を排他選択
 *   - 切り替えは即時 UI に反映される
 *   - settings フォームの保存ボタンとは独立 (localStorage のみ)
 *
 * #382 で追加。
 */

import { Sun, Monitor, Moon } from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";
import type { Theme } from "@/lib/hooks/useTheme";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light",  label: "ライト",   icon: <Sun  size={14} /> },
  { value: "system", label: "システム", icon: <Monitor size={14} /> },
  { value: "dark",   label: "ダーク",   icon: <Moon size={14} /> },
];

export function ThemeSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">テーマ</h2>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          アプリの配色を選択します。「システム」は OS の設定に自動追従します。
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="テーマ選択"
        className="inline-flex gap-2"
      >
        {OPTIONS.map(({ value, label, icon }) => {
          const isSelected = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setTheme(value)}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                isSelected
                  ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
              ].join(" ")}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
