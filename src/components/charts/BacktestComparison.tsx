"use client";

/**
 * BacktestComparison — 単日 vs 7日平均 精度比較カード
 *
 * Client Component (ModelInfoTooltip を使用するため)
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
import { MODEL_DESCRIPTIONS, ModelInfoTooltip } from "./ModelInfoTooltip";

interface BacktestComparisonProps {
  dailyMetrics: ForecastBacktestMetric[];
  sma7Metrics: ForecastBacktestMetric[];
  prevDailyMetrics?: ForecastBacktestMetric[];
  prevSma7Metrics?: ForecastBacktestMetric[];
  /**
   * false のとき: 前回 daily run と実行条件 (horizons / feature_set / origin_step_days) が異なるため
   * 前回比バッジを表示しない。デフォルト true。
   */
  prevDailyComparable?: boolean;
  /**
   * false のとき: 前回 sma7 run と実行条件が異なるため前回比バッジを表示しない。デフォルト true。
   */
  prevSma7Comparable?: boolean;
}

const HORIZONS = [7, 14, 30] as const;
type Horizon = (typeof HORIZONS)[number];

const MODEL_ORDER = ["NeuralProphet", "MovingAverage7d", "LinearTrend30d", "EWLinearTrend", "Naive"];
const MODEL_LABELS: Record<string, string> = {
  NeuralProphet:   "NeuralProphet",
  MovingAverage7d: "MA 7d",
  LinearTrend30d:  "Linear 30d",
  EWLinearTrend:   "EW Linear",
  Naive:           "Naive",
};

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function fmt3(v: number | null): string {
  return v !== null ? v.toFixed(3) : "—";
}

/** 前回比バッジ要素を返す。prev が null のときは null */
function MaeDeltaBadge({ current, prev }: { current: number | null; prev: number | null }) {
  if (current === null || prev === null) return null;
  const delta = current - prev;
  if (delta < -0.005) {
    return (
      <span className="ml-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
        ▼{Math.abs(delta).toFixed(2)}
      </span>
    );
  }
  if (delta > 0.005) {
    return (
      <span className="ml-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
        ▲{Math.abs(delta).toFixed(2)}
      </span>
    );
  }
  return (
    <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">±0</span>
  );
}

/** metrics から (model, horizon) → mae の Map を構築 */
function buildMaeMap(
  metrics: ForecastBacktestMetric[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of metrics) {
    if (row.mae === null) continue; // n_used=0 の policy 行をスキップ
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
  prevDailyMetrics   = [],
  prevSma7Metrics    = [],
  prevDailyComparable = true,
  prevSma7Comparable  = true,
}: BacktestComparisonProps) {
  // #363 以降の run は複数 policy の行を含む。
  // BacktestComparison は評価軸（単日 vs 7日均）の比較が目的のため、
  // ベースラインである all_days policy のみを使用する。
  const dailyAll = dailyMetrics.filter((m) => m.eval_policy === "all_days");
  const sma7All  = sma7Metrics.filter((m) => m.eval_policy === "all_days");

  const hasDailyData = dailyAll.length > 0;
  const hasSma7Data = sma7All.length > 0;

  if (!hasDailyData && !hasSma7Data) return null;

  const dailyMap = buildMaeMap(dailyAll);
  const sma7Map  = buildMaeMap(sma7All);

  // 前回比バッジ用 MAE マップ (all_days のみ)
  // 条件不一致の場合は空 Map にして全バッジを抑止する
  const prevDailyMap = prevDailyComparable
    ? buildMaeMap(prevDailyMetrics.filter((m) => m.eval_policy === "all_days"))
    : new Map<string, number>();
  const prevSma7Map = prevSma7Comparable
    ? buildMaeMap(prevSma7Metrics.filter((m) => m.eval_policy === "all_days"))
    : new Map<string, number>();

  // 条件不一致注記を表示するか (前回 run が存在する場合のみ注記が意味を持つ)
  const showDailyConditionNote  = !prevDailyComparable && prevDailyMetrics.length  > 0;
  const showSma7ConditionNote   = !prevSma7Comparable  && prevSma7Metrics.length   > 0;
  const showAnyConditionNote    = showDailyConditionNote || showSma7ConditionNote;

  // ホライズン別ベスト MAE (ノイズ除去率計算用)
  const dailyBest: Record<Horizon, { model: string; mae: number } | null> = {
    7:  bestMae(dailyMap, 7),
    14: bestMae(dailyMap, 14),
    30: bestMae(dailyMap, 30),
  };
  const sma7Best: Record<Horizon, { model: string; mae: number } | null> = {
    7:  bestMae(sma7Map, 7),
    14: bestMae(sma7Map, 14),
    30: bestMae(sma7Map, 30),
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      {/* ── ヘッダー ── */}
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingDown size={15} className="text-emerald-600" />
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
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
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          単日評価の MAE には水分変動 (±0.5〜1.5 kg) 由来のノイズが含まれます。
          7日平均評価でこのノイズを除いた精度を確認できます。
        </p>
      </div>

      {!hasSma7Data && (
        <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-xs text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertCircle size={13} />
          7日平均評価がまだ実行されていません。
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-800/50">
            python ml-pipeline/backtest.py --series-type sma7
          </code>
          を実行してください。
        </div>
      )}

      {/* ── モバイル: horizon 別サマリーカード (md 未満) ── */}
      <div className="md:hidden p-4 space-y-3">
        {HORIZONS.map((h) => {
          const dBest = dailyBest[h];
          const sBest = sma7Best[h];
          const nrPct = noiseReductionPct(dBest?.mae ?? null, sBest?.mae ?? null);
          const prevDailyMaeBest = dBest ? (prevDailyMap.get(`${dBest.model}:${h}`) ?? null) : null;
          const prevSma7MaeBest  = sBest ? (prevSma7Map.get(`${sBest.model}:${h}`) ?? null) : null;
          return (
            <div key={h} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">D+{h} 日先</p>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-xs">
                {hasDailyData && dBest && (
                  <div>
                    <p className="mb-0.5 font-medium text-blue-500">単日評価 ★</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{MODEL_LABELS[dBest.model] ?? dBest.model}</p>
                    <p className="font-mono text-slate-500 dark:text-slate-400">
                      MAE {fmt3(dBest.mae)}
                      <MaeDeltaBadge current={dBest.mae} prev={prevDailyMaeBest} />
                    </p>
                  </div>
                )}
                {hasSma7Data && sBest && (
                  <div>
                    <p className="mb-0.5 font-medium text-emerald-600">7日平均評価 ★</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{MODEL_LABELS[sBest.model] ?? sBest.model}</p>
                    <p className="font-mono text-slate-500 dark:text-slate-400">
                      MAE {fmt3(sBest.mae)}
                      <MaeDeltaBadge current={sBest.mae} prev={prevSma7MaeBest} />
                    </p>
                  </div>
                )}
                {hasDailyData && hasSma7Data && nrPct !== null && (
                  <div className="ml-auto text-right">
                    <p className="mb-0.5 text-slate-400">ノイズ除去率</p>
                    <p className={`text-base font-bold tabular-nums ${noiseReductionColor(nrPct)}`}>{nrPct}%</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          ★ = ホライズン別最良モデル / ▲▼ = 今回のホライズン別最良モデルの自己前回比 / ノイズ除去率 = (1 − 7日均MAE ÷ 単日MAE) × 100%
        </p>
        {showAnyConditionNote && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            ※ 前回と実行条件 (horizons / feature_set / origin_step_days) が異なるため前回比は表示していません。
          </p>
        )}
      </div>

      {/* ── デスクトップ: 比較テーブル (md+) ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
              <th className="w-44 px-4 py-2.5 text-left">モデル</th>
              {HORIZONS.map((h) => (
                <th key={h} colSpan={2} className="border-l border-slate-100 px-3 py-2.5 text-center dark:border-slate-700">
                  D+{h}日先
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-200 text-[11px] font-medium text-slate-400 dark:border-slate-700 dark:text-slate-500">
              <th className="px-4 py-1.5 text-left">MAE (kg)</th>
              {HORIZONS.map((h) => (
                <Fragment key={h}>
                  <th className="border-l border-slate-100 px-3 py-1.5 text-center text-blue-500 dark:border-slate-700">
                    単日
                  </th>
                  <th className="px-3 py-1.5 text-center text-emerald-600">
                    7日均
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
            {MODEL_ORDER.map((model) => {
              const label = MODEL_LABELS[model] ?? model;
              return (
                <tr key={model} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800">
                  <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200">
                    <span className="inline-flex items-center">
                      {label}
                      {MODEL_DESCRIPTIONS[model] && (
                        <ModelInfoTooltip description={MODEL_DESCRIPTIONS[model]!} />
                      )}
                    </span>
                  </td>
                  {HORIZONS.map((h) => {
                    const dailyMae     = dailyMap.get(`${model}:${h}`) ?? null;
                    const sma7Mae      = sma7Map.get(`${model}:${h}`) ?? null;
                    const prevDailyMae = prevDailyMap.get(`${model}:${h}`) ?? null;
                    const prevSma7Mae  = prevSma7Map.get(`${model}:${h}`) ?? null;
                    const isDailyBest  = dailyBest[h]?.model === model;
                    const isSma7Best   = sma7Best[h]?.model === model;
                    return (
                      <Fragment key={`${model}-${h}`}>
                        <td
                          className={`border-l border-slate-100 px-3 py-2.5 text-center tabular-nums dark:border-slate-700 ${
                            isDailyBest && hasDailyData
                              ? "font-bold text-blue-600 dark:text-blue-400"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {fmt3(dailyMae)}
                          {isDailyBest && hasDailyData && (
                            <span className="ml-1 text-[9px] text-blue-400">★</span>
                          )}
                          <MaeDeltaBadge current={dailyMae} prev={prevDailyMae} />
                        </td>
                        <td
                          className={`px-3 py-2.5 text-center tabular-nums ${
                            isSma7Best && hasSma7Data
                              ? "font-bold text-emerald-600"
                              : hasSma7Data
                              ? "text-slate-600 dark:text-slate-300"
                              : "text-slate-300 dark:text-slate-600"
                          }`}
                        >
                          {hasSma7Data ? fmt3(sma7Mae) : "—"}
                          {isSma7Best && hasSma7Data && (
                            <span className="ml-1 text-[9px] text-emerald-600">★</span>
                          )}
                          {hasSma7Data && (
                            <MaeDeltaBadge current={sma7Mae} prev={prevSma7Mae} />
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
              <tr className="border-t-2 border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">
                <td className="px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  ノイズ除去率
                  <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">(最良モデル)</span>
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
                      className={`border-l border-slate-100 px-3 py-2.5 text-center text-sm dark:border-slate-700 ${noiseReductionColor(pct)}`}
                    >
                      {pct !== null ? `${pct}%` : "—"}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>{/* end hidden md:block */}

      {/* ── フッター注記（デスクトップのみ）── */}
      <div className="hidden md:block border-t border-slate-50 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
        <span>
          ★ = ホライズン別最良モデル / ▲▼ = モデル別自己前回比 / MAE: 平均絶対誤差 (kg) / ノイズ除去率 = (1 − 7日均MAE ÷ 単日MAE) × 100%
        </span>
        <span className="ml-3 text-slate-300 dark:text-slate-600">
          リークなし保証: horizon ≥ 7 のため SMA7 評価ウィンドウは訓練期間と重複しない
        </span>
        {showAnyConditionNote && (
          <span className="ml-3 text-amber-500 dark:text-amber-400">
            ※ 前回と実行条件が異なるため▲▼は非表示
          </span>
        )}
      </div>
    </div>
  );
}
