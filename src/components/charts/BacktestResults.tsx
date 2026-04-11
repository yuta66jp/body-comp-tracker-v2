"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import type { ForecastBacktestRun, ForecastBacktestMetric } from "@/lib/supabase/types";
import { makeTooltipFormatter, buildTooltipStyle } from "@/lib/utils/rechartsFormatter";
import { MODEL_DESCRIPTIONS, ModelInfoTooltip } from "./ModelInfoTooltip";
import { useIsDark } from "@/lib/hooks/useIsDark";

// UI 表示順・色
const MODEL_CONFIG: Record<string, { label: string; color: string; darkColor: string; order: number }> = {
  NeuralProphet:   { label: "NeuralProphet",    color: "#3b82f6", darkColor: "rgba(59,130,246,0.75)",   order: 0 },
  Naive:           { label: "Naive",             color: "#94a3b8", darkColor: "rgba(148,163,184,0.75)",  order: 1 },
  MovingAverage7d: { label: "MA 7d",             color: "#f59e0b", darkColor: "rgba(245,158,11,0.75)",   order: 2 },
  LinearTrend30d:  { label: "Linear Trend 30d",  color: "#10b981", darkColor: "rgba(16,185,129,0.75)",   order: 3 },
  EWLinearTrend:   { label: "EW Linear Trend",   color: "#8b5cf6", darkColor: "rgba(139,92,246,0.75)",   order: 4 },
};

const MODEL_ORDER = Object.entries(MODEL_CONFIG)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([k]) => k);

// ── 型 ───────────────────────────────────────────────────────────────────────

interface Props {
  run: ForecastBacktestRun;
  metrics: ForecastBacktestMetric[];
  /** DB から取得した horizon 一覧 (数値昇順)。0 件時は空表示。 */
  horizons: number[];
}

// ── ヘルパー ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, digits = 3): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * horizon ごとに MAE が最小のモデルと MAE 値を返す。
 *
 * 戻り値に mae を含めることで、呼び出し側が再度 find() でメトリクスを
 * 引き直す必要をなくす。find() を使うと重複行がある場合に最小 MAE とは
 * 別の行の値を参照してしまい、BacktestComparison との値不一致が生じる (#545)。
 */
function bestModels(
  metrics: ForecastBacktestMetric[]
): Record<number, { model: string; mae: number }> {
  const best: Record<number, { model: string; mae: number }> = {};
  for (const m of metrics) {
    if (m.mae === null) continue; // n_used=0 の policy 行をスキップ
    const prev = best[m.horizon_days];
    if (!prev || m.mae < prev.mae) {
      best[m.horizon_days] = { model: m.model_name, mae: m.mae };
    }
  }
  return best;
}

/** バイアスの方向アイコン */
function BiasIcon({ bias }: { bias: number | null }) {
  if (bias == null) return <Minus size={14} className="text-slate-400" />;
  if (bias > 0.05)  return <TrendingUp   size={14} className="text-orange-500" aria-label="上振れ傾向" />;
  if (bias < -0.05) return <TrendingDown  size={14} className="text-blue-500"   aria-label="下振れ傾向" />;
  return <Minus size={14} className="text-slate-400" aria-label="ほぼ中立" />;
}

/** MAE のグラフ用データを生成 */
function buildChartData(metrics: ForecastBacktestMetric[], horizons: number[]) {
  return horizons.map((h) => {
    const row: Record<string, string | number> = { horizon: `${h}日先` };
    for (const model of MODEL_ORDER) {
      const m = metrics.find((x) => x.horizon_days === h && x.model_name === model);
      if (m && m.mae !== null) row[model] = Number(m.mae.toFixed(3));
    }
    return row;
  });
}

// ── コンポーネント ────────────────────────────────────────────────────────────

export function BacktestResults({ run, metrics, horizons }: Props) {
  const isDark = useIsDark();
  const chartColors = {
    axis:     isDark ? "#94a3b8" : "#64748b",
    grid:     isDark ? "#334155" : "#f1f5f9",
    tickText: isDark ? "#94a3b8" : "#64748b",
  };
  const tooltipStyle = buildTooltipStyle(isDark);

  // #363 以降の run は複数 policy の行を含む。
  // BacktestResults は all_days policy（全日ベースライン）のみを表示対象にする。
  const allDaysMetrics = metrics.filter((m) => m.eval_policy === "all_days");

  const best = bestModels(allDaysMetrics);
  const chartData = buildChartData(allDaysMetrics, horizons);

  return (
    <div className="space-y-6">

      {/* 実行メタ情報 */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">バックテスト実行情報</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-4">
          <div><span className="font-medium text-slate-600 dark:text-slate-300">実行日時:</span> {fmtDate(run.created_at)}</div>
          <div><span className="font-medium text-slate-600 dark:text-slate-300">データ期間:</span> {run.train_min_date ?? "—"} → {run.train_max_date ?? "—"}</div>
          <div><span className="font-medium text-slate-600 dark:text-slate-300">ログ日数:</span> {run.n_source_rows} 日（訓練データの実日数）</div>
          <div><span className="font-medium text-slate-600 dark:text-slate-300">メモ:</span> {run.notes ?? "—"}</div>
        </div>
      </div>

      {/* Horizon 別 Best モデル */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {horizons.map((h) => {
          const bestEntry = best[h]; // { model, mae } | undefined — MAE は最小値 (#545)
          const cfg = bestEntry ? MODEL_CONFIG[bestEntry.model] : null;
          return (
            <div
              key={h}
              className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
            >
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{h} 日先 — 最良モデル</p>
              <p
                className="text-sm font-bold"
                style={{ color: cfg?.color ?? "#64748b" }}
              >
                {cfg?.label ?? "—"}
              </p>
              {bestEntry && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  MAE <span className="font-mono font-semibold">{fmt(bestEntry.mae)}</span> kg
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* MAE 比較チャート */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
          MAE 比較（ホライズン別）
        </h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis dataKey="horizon" tick={{ fontSize: 12, fill: chartColors.tickText }} stroke={chartColors.axis} />
            <YAxis
              tickFormatter={(v: number) => `${v.toFixed(2)}`}
              label={{ value: "MAE (kg)", angle: -90, position: "insideLeft", fontSize: 11, dx: -4, fill: chartColors.tickText }}
              tick={{ fontSize: 11, fill: chartColors.tickText }}
              stroke={chartColors.axis}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={makeTooltipFormatter(
                (v) => `${v.toFixed(3)} kg`,
                (name) => MODEL_CONFIG[name]?.label ?? name,
              )}
            />
            <Legend
              formatter={(name: string) => MODEL_CONFIG[name]?.label ?? name}
              wrapperStyle={{ fontSize: 11 }}
              iconSize={10}
            />
            {MODEL_ORDER.map((model) => (
              <Bar
                key={model}
                dataKey={model}
                fill={isDark ? (MODEL_CONFIG[model]?.darkColor ?? MODEL_CONFIG[model]?.color ?? "#94a3b8") : (MODEL_CONFIG[model]?.color ?? "#94a3b8")}
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 詳細指標テーブル — モバイル: horizon 別ランクカード */}
      <div className="md:hidden space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">詳細指標（ホライズン別）</h2>
        {horizons.map((h) => {
          const ranked = MODEL_ORDER
            .map((model) => ({
              model,
              metric: allDaysMetrics.find((x) => x.horizon_days === h && x.model_name === model),
            }))
            .filter((x): x is { model: string; metric: typeof allDaysMetrics[number] } => x.metric !== undefined)
            .sort((a, b) => (a.metric.mae ?? Infinity) - (b.metric.mae ?? Infinity));
          return (
            <div key={h} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
              <h3 className="mb-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">{h} 日先</h3>
              <div className="space-y-1.5">
                {ranked.map(({ model, metric }, rank) => {
                  const cfg = MODEL_CONFIG[model];
                  const isBest = rank === 0;
                  return (
                    <div
                      key={model}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${isBest ? "bg-blue-50 dark:bg-blue-900/30" : "bg-slate-50 dark:bg-slate-800"}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 flex-shrink-0 text-xs text-slate-400 dark:text-slate-500">{rank + 1}</span>
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: cfg?.color ?? "#94a3b8" }}
                        />
                        <span className={`truncate text-xs font-medium ${isBest ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-300"}`}>
                          {cfg?.label ?? model}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                        <span className={`font-mono tabular-nums ${isBest ? "font-bold text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-300"}`}>
                          MAE {fmt(metric.mae)}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 tabular-nums font-mono">
                          <BiasIcon bias={metric.bias ?? null} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">MAE (kg) 昇順 / Bias: 上振れ↑ 下振れ↓ 中立 —</p>
            </div>
          );
        })}
      </div>

      {/* 詳細指標テーブル — デスクトップ: フル指標テーブル */}
      <div className="hidden md:block rounded-xl border border-slate-100 bg-white p-4 shadow-sm overflow-x-auto dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">詳細指標テーブル</h2>
        <table className="w-full min-w-max text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">モデル</th>
              {horizons.map((h) => (
                <th key={h} colSpan={5} className="py-2 pr-4 font-medium text-center">
                  {h} 日先
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-700 dark:text-slate-500">
              <th className="py-1 pr-4" />
              {horizons.map((h) => (
                <React.Fragment key={h}>
                  <th className="py-1 px-2 text-right font-normal">MAE↓</th>
                  <th className="py-1 px-2 text-right font-normal">RMSE↓</th>
                  <th className="py-1 px-2 text-right font-normal">MAPE↓</th>
                  <th className="py-1 px-2 text-right font-normal">Bias</th>
                  <th className="py-1 px-2 text-right font-normal" title="評価サンプル数（予測点数、実日数ではない）">n†</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODEL_ORDER.map((model) => {
              const cfg = MODEL_CONFIG[model];
              return (
                <tr
                  key={model}
                  className="border-b border-slate-50 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-800"
                >
                  <td className="py-2 pr-4 font-medium" style={{ color: cfg?.color }}>
                    <span className="inline-flex items-center">
                      {cfg?.label ?? model}
                      {MODEL_DESCRIPTIONS[model] && (
                        <ModelInfoTooltip description={MODEL_DESCRIPTIONS[model]!} />
                      )}
                    </span>
                  </td>
                  {horizons.map((h) => {
                    const m = allDaysMetrics.find(
                      (x) => x.horizon_days === h && x.model_name === model
                    );
                    const isBest = best[h]?.model === model;
                    return (
                      <React.Fragment key={h}>
                        <td
                          className={`py-2 px-2 text-right font-mono ${isBest ? "font-bold text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-300"}`}
                        >
                          {fmt(m?.mae)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600 dark:text-slate-300">
                          {fmt(m?.rmse)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600 dark:text-slate-300">
                          {m?.mape != null ? `${fmt(m.mape, 2)}%` : "—"}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="flex items-center justify-end gap-1 font-mono text-slate-600 dark:text-slate-300">
                            {fmt(m?.bias)}
                            <BiasIcon bias={m?.bias ?? null} />
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-slate-400 dark:text-slate-500">
                          {m?.n_predictions ?? "—"}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          MAE↓ / RMSE↓ = 小さいほど良い。<strong className="text-blue-600 dark:text-blue-400">太字</strong>はホライズン内最良モデル。
          Bias: 正=予測が実測より高め傾向、負=低め傾向。
          † n = 評価サンプル数（ホライズンごとの予測点数）。上記ログ日数とは異なる。
        </p>
      </div>

      {/* 指標の読み方 */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-700/50 dark:bg-amber-900/30">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <div className="space-y-1 text-xs text-amber-600 dark:text-amber-400">
            <p className="font-semibold">指標の読み方</p>
            <p>
              <strong>MAE</strong> = 予測と実測の平均絶対誤差 (kg)。例えば MAE=0.5 なら平均 ±0.5 kg の誤差。
            </p>
            <p>
              <strong>RMSE</strong> = 大きな誤差にペナルティがかかる指標。MAE より大きければ、外れ値的な予測ミスが存在する。
            </p>
            <p>
              <strong>MAPE</strong> = 誤差の体重比 (%)。体重が低いほど同じ kg 誤差でも % は大きくなる。
            </p>
            <p>
              <strong>Bias</strong> = 平均誤差 (予測 − 実測)。正なら「常に高め」、負なら「常に低め」に予測する傾向。
            </p>
          </div>
        </div>
      </div>

      {/* 予測の限界注記 */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
          <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <p className="font-semibold text-slate-600 dark:text-slate-300">予測の信頼性について</p>
            <p>
              短期予測（7日先）は比較的参考になりますが、14日・30日先になるほど誤差は増加します。
            </p>
            <p>
              体重は水分変動・チートデイ・塩分摂取量・炭水化物充填・便通周期など、このモデルが考慮していない要因に大きく左右されます。
            </p>
            <p>
              予測グラフは意思決定の唯一の根拠にせず、実測トレンドと合わせて参考程度に利用してください。
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
