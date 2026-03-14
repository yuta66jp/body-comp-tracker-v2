/**
 * カロリー差分表示ユーティリティ
 *
 * - formatCaloriesWithDiff : "2,183 (+200)" 形式の文字列を生成
 * - getNormalizedDiffWidth : diverging bar の幅比率 (0–1) を返す
 */

/**
 * 摂取カロリーと目標との差分を "actual (±diff)" 形式にフォーマットする。
 *
 * @example
 *   formatCaloriesWithDiff(2183, 200)   // "2,183 (+200)"
 *   formatCaloriesWithDiff(1900, -100)  // "1,900 (-100)"
 *   formatCaloriesWithDiff(2000, 0)     // "2,000 (0)"
 */
export function formatCaloriesWithDiff(actual: number, diff: number): string {
  const actualStr = Math.round(actual).toLocaleString();
  const sign = diff > 0 ? "+" : "";
  return `${actualStr} (${sign}${Math.round(diff)})`;
}

/**
 * diff の絶対値を maxAbs で正規化して 0–1 の比率を返す。
 * maxAbs === 0 のときは 0 を返す（ゼロ除算回避）。
 * 結果は 1 でクランプされる。
 *
 * @example
 *   getNormalizedDiffWidth(100, 200)  // 0.5
 *   getNormalizedDiffWidth(-150, 200) // 0.75
 *   getNormalizedDiffWidth(300, 200)  // 1
 *   getNormalizedDiffWidth(100, 0)    // 0
 */
export function getNormalizedDiffWidth(diff: number, maxAbs: number): number {
  if (maxAbs === 0) return 0;
  return Math.min(Math.abs(diff) / maxAbs, 1);
}
