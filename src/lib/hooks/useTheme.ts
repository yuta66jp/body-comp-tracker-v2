"use client";
/**
 * useTheme — ライト / ダーク / システム テーマの状態管理フック
 *
 * - 選択状態を localStorage に保存し、再訪時にも維持する
 * - "system" 選択時は prefers-color-scheme に追従する
 * - "light" / "dark" 選択時は html.dark クラスを直接制御する
 * - FOUC 防止スクリプト (layout.tsx) と同じ STORAGE_KEY / ロジックを使用する
 *
 * ## 優先順位
 *   手動設定 (light / dark) > localStorage なし → system (OS 追従)
 *
 * ## html.dark クラスとの分離
 *   このフックはテーマ状態の管理責務のみを持つ。
 *   useIsDark フックが html.dark クラスを読んでグラフ等に伝える。
 */

import { useState, useEffect } from "react";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";

function applyTheme(theme: Theme): void {
  const isDark =
    theme === "dark" ||
    (theme !== "light" &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) ?? "system";
  });

  // system モード時: prefers-color-scheme の変化を監視して html.dark を更新する
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  function setTheme(t: Theme): void {
    localStorage.setItem(THEME_STORAGE_KEY, t);
    setThemeState(t);
    applyTheme(t);
  }

  return { theme, setTheme };
}
