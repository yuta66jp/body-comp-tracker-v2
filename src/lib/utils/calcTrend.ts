/**
 * 単純線形回帰ユーティリティ (logic.py の run_linear_model() を移植)
 */

export interface TrendResult {
  slope: number; // kg/day
  intercept: number;
  rSquared: number;
}

/**
 * 日付文字列 (YYYY-MM-DD) と体重の配列から線形トレンドを計算する。
 */
export function calcWeightTrend(
  data: Array<{ date: string; weight: number }>
): TrendResult {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: data[0]?.weight ?? 0, rSquared: 0 };

  const xs = data.map((_, i) => i);
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
