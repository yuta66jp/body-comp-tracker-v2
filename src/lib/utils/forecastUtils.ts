/**
 * forecastUtils.ts
 *
 * ForecastChart 向けの純粋関数ヘルパー。
 * Recharts / React に依存しないため単体テストが容易。
 */

import { addDaysStr } from "./date";

/**
 * buildForecastMap
 *
 * 予測系列（predictions）から「表示対象の日付 → yhat」Map を構築する。
 *
 * フィルタ条件: `p.ds > latestLogDate`
 *   最終実測日より後の予測のみを含める。
 *   - 実測のある日は actual ドットがあるため予測を重ねない
 *   - 最終実測日〜今日のギャップ期間の予測を含めることで、グラフ上で
 *     実測末端と予測線が視覚的に接続する（今日基準でフィルタすると
 *     このギャップが空白になり「予測が追随していない」と見える）
 *
 * @param predictions  predictions テーブルのレコード列
 * @param latestLogDate  体重あり最終ログ日 ("YYYY-MM-DD")。なければ今日の JST 日付
 */
/**
 * calcEwLinearForecast
 *
 * SMA7 平滑化系列に対して指数加重線形回帰を適用し、
 * latestLogDate 翌日から horizonDays 日先までの予測系列を返す。
 *
 * #155 の Python predict_ew_linear() と同一の設計方針:
 *   - 入力: SMA7 系列（生体重ではなく平滑化済み）→ 単日ノイズ (水分変動) を除去
 *   - 加重: alpha=0.9/日。直近ほど重み大 (最新=1.0, 1日前=0.9, ..., 29日前≈0.05)
 *   - 外挿: 加重最小二乗線形回帰の slope から horizon 日先を線形延長
 *
 * ForecastChart での用途: 短期補助線（14日先まで）
 *   - NeuralProphet (中期主線) とは役割が異なる
 *   - 直近の体重変化方向・加速度を直感的に可視化する
 *
 * @param sma7         SMA7 系列 (date: YYYY-MM-DD, value: kg)。順不同でよい
 * @param latestLogDate 実測値のある最終日 (YYYY-MM-DD)。翌日から予測を開始する
 * @param horizonDays  予測期間 (日数)。デフォルト 14
 * @returns            予測点の配列 (日付昇順)。SMA7 が 2 件未満の場合は空配列
 */
export function calcEwLinearForecast(
  sma7: Array<{ date: string; value: number }>,
  latestLogDate: string,
  horizonDays: number = 14
): Array<{ date: string; value: number }> {
  // SMA7 を日付昇順でソートし直近30件を使う (Python の train.tail(30) に相当)
  const sorted = [...sma7]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);
  const n = sorted.length;
  if (n < 2) return [];

  const alpha = 0.9;
  const ys = sorted.map((d) => d.value);

  // 加重最小二乗回帰 (正規方程式)
  // w_i = alpha^(n-1-i): i=0 (最古) が最小, i=n-1 (最新) = 1.0
  let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.pow(alpha, n - 1 - i);
    sw   += w;
    swx  += w * i;
    swy  += w * ys[i];
    swxx += w * i * i;
    swxy += w * i * ys[i];
  }

  const denom = sw * swxx - swx * swx;
  if (denom === 0) return [];

  const slope     = (sw * swxy - swx * swy) / denom;
  const intercept = (swy - slope * swx) / sw;

  // latestLogDate 翌日から horizonDays 日先まで外挿
  // x = n-1 が直近 SMA7 点に対応するため、h 日後は x = n-1+h
  const result: Array<{ date: string; value: number }> = [];
  for (let h = 1; h <= horizonDays; h++) {
    const date = addDaysStr(latestLogDate, h);
    if (!date) continue;
    result.push({ date, value: slope * (n - 1 + h) + intercept });
  }
  return result;
}

export type RangeTab = "default" | "7d" | "31d" | "60d";

/**
 * buildYAxisConfig
 *
 * rangeTab に応じた Y 軸 tick 配列とラベルフォーマッタを返す。
 *
 * - 7d:      0.5kg 刻み、全ラベル表示
 * - 31d:     1kg 刻み、全ラベル表示
 * - 60d:     1kg 刻み、全ラベル表示
 * - default: 1kg 刻み、5kg 倍数（主要目盛り）+ 3kg 倍数（補助目盛り）でラベル表示
 *            → ~3kg 間隔でラベルが並び「kg 表示が消える」レンジを防ぐ
 */
export function buildYAxisConfig(
  rangeTab: RangeTab,
  yMin: number,
  yMax: number
): { ticks: number[]; formatter: (v: number) => string } {
  const step = rangeTab === "7d" ? 0.5 : 1;

  const tickStart = Math.round(Math.ceil(yMin / step) * step * 10) / 10;
  const ticks: number[] = [];
  for (let v = tickStart; v <= yMax + 0.001; v = Math.round((v + step) * 10) / 10) {
    ticks.push(v);
  }

  const formatter = (v: number): string => {
    if (rangeTab === "default") {
      // 5kg 主要目盛り OR 3kg 補助目盛りのみラベル表示（~3kg 間隔を保証）
      const vi = Math.round(v);
      if (vi % 5 !== 0 && vi % 3 !== 0) return "";
    }
    return v % 1 === 0 ? `${v}kg` : `${v.toFixed(1)}kg`;
  };

  return { ticks, formatter };
}

export function buildForecastMap(
  predictions: Array<{ ds: string; yhat: number }>,
  latestLogDate: string
): Map<string, number> {
  return new Map(
    predictions
      .filter((p) => p.ds > latestLogDate)
      .map((p) => [p.ds, p.yhat])
  );
}
