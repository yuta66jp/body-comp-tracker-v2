/**
 * BacktestComparison — 単日 vs 7日平均 精度比較カード
 *
 * Server Component (状態・イベントなし)
 *
 * 表示内容:
 *   - 各モデル × 各ホライズン の MAE を単日/7日平均で並べて比較
 *   - ホライズン別「ノイズ除去率」= (1 - sma7_best_mae / daily_best_mae) × 100%
 *   - 最良モデルをホライズンごとにハイライト
 *
 * ノイズ除去率の解釈:
 *   単日評価の MAE には水分変動 (±0.5〜1.5 kg) 由来のノイズが含まれる。
 *   7日平均評価でこの成分が除去されるため、率が高いほど
 *   「現在の予測誤差のうち体重ノイズ由来の割合が大きい」ことを示す。
 *
 * リークなし保証:
 *   sma7 評価の実測ウィンドウは horizon >= 7 のため訓練データと重複しない。
 */

import { Fragment } from "react";
import { TrendingDown, AlertCircle } from "lucide-react";
import type { ForecastBacktestMetric } from "@/lib/supabase/types";

interface BacktestComparisonProps {
  dailyMetrics: ForecastBacktestMetric[];
  sma7Metrics: ForecastBacktestMetric[];
}

const HORIZONS = [7, 14, 30] as const;
type Horizon = (typeof HORIZONS)[number];

const MODEL_ORDER = ["NeuralProphet", "MovingAverage7d", "LinearTrend30d", "Naive"];
const MODEL_LABELS: Record<string, string> = {
  NeuralProphet:   "NeuralProphet",
  MovingAverage7d: "MA 7d",
  LinearTrend30d:  "Linear 30d",
  Naive:           "Naive",
};

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function fmt3(v: number | null): string {
  return v !== null ? v.toFixed(3) : "—";
}

/** metrics から (model, horizon) → mae の Map を構築 */
function buildMaeMap(
  metrics: ForecastBacktestMetric[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of metrics) {
    m.set(`${row.model_name}:${row.horizon_days}`, row.mae);
  }
  return m;
}

/** horizon ごとの最良 MAE を返す */
function bestMae(
  maeMap: Map<string, number>,
  horizon: Horizon
): { model: string; mae: number } | null {
  let best: { model: string; mae: number } | null = null;
  for (const model of MODEL_ORDER) {
    const mae = maeMap.get(`${model}:${horizon}`);
    if (mae === undefined) continue;
    if (!best || mae < best.mae) best = { model, mae };
  }
  return best;
}

/** ノイズ除去率 (%) = (1 - sma7 / daily) × 100 */
function noiseReductionPct(daily: number | null, sma7: number | null): number | null {
  if (daily === null || sma7 === null || daily <= 0) return null;
  return Math.round((1 - sma7 / daily) * 100);
}

function noiseReductionColor(pct: number | null): string {
  if (pct === null) return "text-slate-400";
  if (pct >= 50) return "text-emerald-600 font-bold";
  if (pct >= 30) return "text-amber-600 font-semibold";
  return "text-slate-500";
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function BacktestComparison({
  dailyMetrics,
  sma7Metrics,
}: BacktestComparisonProps) {
  const hasDailyData = dailyMetrics.length > 0;
  const hasSma7Data = sma7Metrics.length > 0;

  if (!hasDailyData && !hasSma7Data) return null;

  const dailyMap = buildMaeMap(dailyMetrics);
  const sma7Map = buildMaeMap(sma7Metrics);

  // ホライズン別ベスト MAE (ノイズ除去率計算用)
  const dailyBest: Record<Horizon, { model: string; mae: number } | null> = {
    7: bestMae(dailyMap, 7),
    14: bestMae(dailyMap, 14),
    30: bestMae(dailyMap, 30),
  };
  const sma7Best: Record<Horizon, { model: string; mae: number } | null> = {
    7: bestMae(sma7Map, 7),
    14: bestMae(sma7Map, 14),
    30: bestMae(sma7Map, 30),
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* ── ヘッダー ── */}
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingDown size={15} className="text-emerald-600" />
            <span className="text-sm font-bold text-slate-700">
              評価方式比較: 単日体重 vs 7日平均体重
            </span>
          </div>
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
              単日評価
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              7日平均評価
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          単日評価の MAE には水分変動 (±0.5〜1.5 kg) 由来のノイズが含まれます。
          7日平均評価でこのノイズを除いた精度を確認できます。
        </p>
      </div>

      {!hasSma7Data && (
        <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-xs text-amber-700">
          <AlertCircle size={13} />
          7日平均評価がまだ実行されていません。
          <code className="rounded bg-amber-100 px-1">
            python ml-pipeline/backtest.py --series-type sma7
          </code>
          を実行してください。
        </div>
      )}

      {/* ── 比較テーブル ── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 text-left">モデル</th>
              {HORIZONS.map((h) => (
                <th key={h} colSpan={2} className="border-l border-slate-100 px-3 py-2.5 text-center">
                  D+{h}日先
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-200 text-[11px] font-medium text-slate-400">
              <th className="px-4 py-1.5 text-left">MAE (kg)</th>
              {HORIZONS.map((h) => (
                <Fragment key={h}>
                  <th className="border-l border-slate-100 px-3 py-1.5 text-center text-blue-500">
                    単日
                  </th>
                  <th className="px-3 py-1.5 text-center text-emerald-600">
                    7日均
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {MODEL_ORDER.map((model) => {
              const label = MODEL_LABELS[model] ?? model;
              return (
                <tr key={model} className="transition-colors hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{label}</td>
                  {HORIZONS.map((h) => {
                    const dailyMae = dailyMap.get(`${model}:${h}`) ?? null;
                    const sma7Mae = sma7Map.get(`${model}:${h}`) ?? null;
                    const isDailyBest = dailyBest[h]?.model === model;
                    const isSma7Best = sma7Best[h]?.model === model;
                    return (
                      <Fragment key={`${model}-${h}`}>
                        <td
                          className={`border-l border-slate-100 px-3 py-2.5 text-center tabular-nums ${
                            isDailyBest && hasDailyData
                              ? "font-bold text-blue-600"
                              : "text-slate-600"
                          }`}
                        >
                          {fmt3(dailyMae)}
                          {isDailyBest && hasDailyData && (
                            <span className="ml-1 text-[9px] text-blue-400">★</span>
                          )}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-center tabular-nums ${
                            isSma7Best && hasSma7Data
                              ? "font-bold text-emerald-600"
                              : hasSma7Data
                              ? "text-slate-600"
                              : "text-slate-300"
                          }`}
                        >
                          {hasSma7Data ? fmt3(sma7Mae) : "—"}
                          {isSma7Best && hasSma7Data && (
                            <span className="ml-1 text-[9px] text-emerald-400">★</span>
                          )}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {/* ── ノイズ除去率行 ── */}
          {hasDailyData && hasSma7Data && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-4 py-2.5 text-xs font-semibold text-slate-500">
                  ノイズ除去率
                  <span className="ml-1 font-normal text-slate-400">(最良モデル)</span>
                </td>
                {HORIZONS.map((h) => {
                  const pct = noiseReductionPct(
                    dailyBest[h]?.mae ?? null,
                    sma7Best[h]?.mae ?? null
                  );
                  return (
                    <td
                      key={h}
                      colSpan={2}
                      className={`border-l border-slate-100 px-3 py-2.5 text-center text-sm ${noiseReductionColor(pct)}`}
                    >
                      {pct !== null ? `${pct}%` : "—"}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── フッター注記 ── */}
      <div className="border-t border-slate-50 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-400">
        <span>
          ★ = ホライズン別最良モデル / MAE: 平均絶対誤差 (kg) / ノイズ除去率 = (1 − 7日均MAE ÷ 単日MAE) × 100%
        </span>
        <span className="ml-3 text-slate-300">
          リークなし保証: horizon ≥ 7 のため SMA7 評価ウィンドウは訓練期間と重複しない
        </span>
      </div>
    </div>
  );
}
