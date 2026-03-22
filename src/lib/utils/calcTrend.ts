/**
 * 単純線形回帰ユーティリティ (logic.py の run_linear_model() を移植)
 */

import { parseLocalDateStr } from "./date";

export interface TrendResult {
  slope: number; // kg/day
  intercept: number;
  rSquared: number;
}

/**
 * 日付文字列 (YYYY-MM-DD) と体重の配列から線形トレンドを計算する。
 *
 * x 軸は最初の記録日からの実経過日数 (0, 1, 3, 7, ...) を使う。
 * インデックス (0, 1, 2, ...) を使うと記録が飛び飛びの場合に
 * slope が過大・過小推定されるため。
 */
export function calcWeightTrend(
  data: Array<{ date: string; weight: number }>
): TrendResult {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: data[0]?.weight ?? 0, rSquared: 0 };

  const firstMs = parseLocalDateStr(data[0].date)?.getTime() ?? 0;
  const xs = data.map((d) => {
    const ms = parseLocalDateStr(d.date)?.getTime() ?? firstMs;
    return (ms - firstMs) / 86_400_000; // 実経過日数
  });
  const ys = data.map((d) => d.weight);

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  const ssXX = xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0);
  const ssXY = xs.reduce((acc, x, i) => acc + (x - meanX) * (ys[i] - meanY), 0);
  const ssYY = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);

  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const rSquared = ssYY === 0 ? 1 : (ssXY ** 2) / (ssXX * ssYY);

  return { slope, intercept, rSquared };
}

/**
 * トレンドラインから n 日後の予測体重を返す。
 */
export function predictWeight(trend: TrendResult, daysAhead: number): number {
  const currentIndex = 0; // 基準点は最終データ点
  return trend.intercept + trend.slope * (currentIndex + daysAhead);
}
