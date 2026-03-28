"use client";
/**
 * useIsDark — prefers-color-scheme: dark の変化を監視するフック
 *
 * Recharts などの SVG プロパティ（stroke/fill）は CSS dark: クラスが効かないため、
 * このフックで動的に色を切り替える。
 *
 * SSR では常に false を返す（初期ヒドレーションの不一致を防ぐ）。
 */
import { useState, useEffect } from "react";

export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // jsdom (Jest) では window.matchMedia が存在しないためガードする
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isDark;
}
