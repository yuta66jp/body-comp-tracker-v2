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
  const [isDark, setIsDark] = useState<boolean>(() => {
    // SSR / jsdom (Jest) では false を返す（初期ヒドレーションの不一致を防ぐ）
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    // jsdom (Jest) では window.matchMedia が存在しないためガードする
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isDark;
}
