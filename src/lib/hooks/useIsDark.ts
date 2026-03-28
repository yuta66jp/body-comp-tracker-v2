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
 *         - 手動テーマ (light / dark) および system モードの両方に対応
 *         - MutationObserver で classList 変化を検知する
 *
 * SSR では常に false を返す（初期ヒドレーションの不一致を防ぐ）。
 */
import { useState, useEffect } from "react";

export function useIsDark(): boolean {
  // SSR では false。クライアント初回レンダリング後に useEffect が MutationObserver を設定し
  // .dark クラスの変化があれば更新される。
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    // MutationObserver で classList の変化を検知する
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    // 購読開始時の現在値を返す (observer は変化のみ検知するため)
    // effect 内での同期 setState を避けるため setTimeout(fn, 0) で非同期化する
    const id = setTimeout(() => setIsDark(el.classList.contains("dark")), 0);
    return () => {
      clearTimeout(id);
      observer.disconnect();
    };
  }, []);

  return isDark;
}
