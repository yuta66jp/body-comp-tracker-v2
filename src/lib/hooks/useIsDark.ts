"use client";
/**
 * useIsDark — html 要素の .dark クラスを監視するフック
 *
 * Recharts などの SVG プロパティ（stroke/fill）は CSS dark: クラスが効かないため、
 * このフックで動的に色を切り替える。
 *
 * ## 変更履歴
 *   #380: prefers-color-scheme: dark の変化を監視する実装で追加
 *   #382: テーマ切り替え追加に伴い、html.dark クラスの監視に切り替え
 *         - 初期値を lazy initializer で html.dark クラスから直接読む
 *         - MutationObserver で以降の変化を検知する
 *         - 手動テーマ (light / dark) および system モードの両方に対応
 *
 * SSR では document が存在しないため false を返す。
 * クライアントでは FOUC 防止スクリプトが hydration 前に .dark を設定済みのため、
 * lazy initializer が正しい初期値を返す。
 */
import { useState, useEffect } from "react";

export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
