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

// ── 定数 ─────────────────────────────────────────────────────────────────────

const HORIZONS = [7, 14, 30] as const;

// UI 表示順・色
const MODEL_CONFIG: Record<string, { label: string; color: string; order: number }> = {
  NeuralProphet:  { label: "NeuralProphet",      color: "#3b82f6", order: 0 },
  Naive:          { label: "Naive",               color: "#94a3b8", order: 1 },
  MovingAverage7d:{ label: "MA 7d",               color: "#f59e0b", order: 2 },
  LinearTrend30d: { label: "Linear Trend 30d",    color: "#10b981", order: 3 },
  EWLinearTrend:  { label: "EW Linear Trend",     color: "#8b5cf6", order: 4 },
};

const MODEL_ORDER = Object.entries(MODEL_CONFIG)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([k]) => k);

// ── 型 ───────────────────────────────────────────────────────────────────────

interface Props {
  run: ForecastBacktestRun;
  metrics: ForecastBacktestMetric[];
}

// ── ヘルパー ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, digits = 3): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/** horizon ごとに MAE が最小のモデル名を返す */
function bestModels(metrics: ForecastBacktestMetric[]): Record<number, string> {
  const best: Record<number, { mae: number; model: string }> = {};
  for (const m of metrics) {
    const prev = best[m.horizon_days];
    if (!prev || m.mae < prev.mae) {
      best[m.horizon_days] = { mae: m.mae, model: m.model_name };
    }
  }
  return Object.fromEntries(
    Object.entries(best).map(([h, v]) => [h, v.model])
  );
}

/** バイアスの方向アイコン */
function BiasIcon({ bias }: { bias: number | null }) {
  if (bias == null) return <Minus size={14} className="text-slate-400" />;
  if (bias > 0.05)  return <TrendingUp   size={14} className="text-orange-500" aria-label="上振れ傾向" />;
  if (bias < -0.05) return <TrendingDown  size={14} className="text-blue-500"   aria-label="下振れ傾向" />;
  return <Minus size={14} className="text-slate-400" aria-label="ほぼ中立" />;
}

/** MAE のグラフ用データを生成 */
function buildChartData(metrics: ForecastBacktestMetric[]) {
  return HORIZONS.map((h) => {
    const row: Record<string, string | number> = { horizon: `${h}日先` };
    for (const model of MODEL_ORDER) {
      const m = metrics.find((x) => x.horizon_days === h && x.model_name === model);
      if (m) row[model] = Number(m.mae.toFixed(3));
    }
    return row;
  });
}

// ── コンポーネント ────────────────────────────────────────────────────────────

export function BacktestResults({ run, metrics }: Props) {
  const best = bestModels(metrics);
  const chartData = buildChartData(metrics);

  return (
    <div className="space-y-6">

      {/* 実行メタ情報 */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">バックテスト実行情報</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
          <div><span className="font-medium text-slate-600">実行日時:</span> {fmtDate(run.created_at)}</div>
          <div><span className="font-medium text-slate-600">データ期間:</span> {run.train_min_date ?? "—"} → {run.train_max_date ?? "—"}</div>
          <div><span className="font-medium text-slate-600">データ点数:</span> {run.n_source_rows} 件</div>
          <div><span className="font-medium text-slate-600">メモ:</span> {run.notes ?? "—"}</div>
        </div>
      </div>

      {/* Horizon 別 Best モデル */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {HORIZONS.map((h) => {
          const winner = best[h];
          const cfg = winner ? MODEL_CONFIG[winner] : null;
          const metric = metrics.find((m) => m.horizon_days === h && m.model_name === winner);
          return (
            <div
              key={h}
              className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <p className="text-xs text-slate-400 mb-1">{h} 日先 — 最良モデル</p>
              <p
                className="text-sm font-bold"
                style={{ color: cfg?.color ?? "#64748b" }}
              >
                {cfg?.label ?? "—"}
              </p>
              {metric && (
                <p className="text-xs text-slate-500 mt-1">
                  MAE <span className="font-mono font-semibold">{fmt(metric.mae)}</span> kg
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* MAE 比較チャート */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">
          MAE 比較（ホライズン別）
        </h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="horizon" tick={{ fontSize: 12 }} />
            <YAxis
              tickFormatter={(v: number) => `${v.toFixed(2)}`}
              label={{ value: "MAE (kg)", angle: -90, position: "insideLeft", fontSize: 11, dx: -4 }}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(v: unknown, name: unknown) => [
                `${Number(v).toFixed(3)} kg`,
                MODEL_CONFIG[String(name)]?.label ?? String(name),
              ]}
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
                fill={MODEL_CONFIG[model]?.color ?? "#94a3b8"}
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 詳細指標テーブル — モバイル: horizon 別ランクカード */}
      <div className="md:hidden space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">詳細指標（ホライズン別）</h2>
        {HORIZONS.map((h) => {
          const ranked = MODEL_ORDER
            .map((model) => ({
              model,
              metric: metrics.find((x) => x.horizon_days === h && x.model_name === model),
            }))
            .filter((x): x is { model: string; metric: typeof metrics[number] } => x.metric !== undefined)
            .sort((a, b) => a.metric.mae - b.metric.mae);
          return (
            <div key={h} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2.5 text-sm font-semibold text-slate-700">{h} 日先</h3>
              <div className="space-y-1.5">
                {ranked.map(({ model, metric }, rank) => {
                  const cfg = MODEL_CONFIG[model];
                  const isBest = rank === 0;
                  return (
                    <div
                      key={model}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${isBest ? "bg-blue-50" : "bg-slate-50"}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 flex-shrink-0 text-xs text-slate-400">{rank + 1}</span>
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: cfg?.color ?? "#94a3b8" }}
                        />
                        <span className={`truncate text-xs font-medium ${isBest ? "text-blue-700" : "text-slate-600"}`}>
                          {cfg?.label ?? model}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                        <span className={`font-mono tabular-nums ${isBest ? "font-bold text-blue-600" : "text-slate-600"}`}>
                          MAE {fmt(metric.mae)}
                        </span>
                        <span className="text-slate-400 tabular-nums font-mono">
                          <BiasIcon bias={metric.bias ?? null} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-slate-400">MAE (kg) 昇順 / Bias: 上振れ↑ 下振れ↓ 中立 —</p>
            </div>
          );
        })}
      </div>

      {/* 詳細指標テーブル — デスクトップ: フル指標テーブル */}
      <div className="hidden md:block rounded-xl border border-slate-100 bg-white p-4 shadow-sm overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">詳細指標テーブル</h2>
        <table className="w-full min-w-max text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-500">
              <th className="py-2 pr-4 font-medium">モデル</th>
              {HORIZONS.map((h) => (
                <th key={h} colSpan={5} className="py-2 pr-4 font-medium text-center">
                  {h} 日先
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-100 text-slate-400">
              <th className="py-1 pr-4" />
              {HORIZONS.map((h) => (
                <React.Fragment key={h}>
                  <th className="py-1 px-2 text-right font-normal">MAE↓</th>
                  <th className="py-1 px-2 text-right font-normal">RMSE↓</th>
                  <th className="py-1 px-2 text-right font-normal">MAPE↓</th>
                  <th className="py-1 px-2 text-right font-normal">Bias</th>
                  <th className="py-1 px-2 text-right font-normal">n</th>
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
                  className="border-b border-slate-50 hover:bg-slate-50"
                >
                  <td className="py-2 pr-4 font-medium" style={{ color: cfg?.color }}>
                    {cfg?.label ?? model}
                  </td>
                  {HORIZONS.map((h) => {
                    const m = metrics.find(
                      (x) => x.horizon_days === h && x.model_name === model
                    );
                    const isBest = best[h] === model;
                    return (
                      <React.Fragment key={h}>
                        <td
                          className={`py-2 px-2 text-right font-mono ${isBest ? "font-bold text-blue-600" : "text-slate-600"}`}
                        >
                          {fmt(m?.mae)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600">
                          {fmt(m?.rmse)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600">
                          {m?.mape != null ? `${fmt(m.mape, 2)}%` : "—"}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="flex items-center justify-end gap-1 font-mono text-slate-600">
                            {fmt(m?.bias)}
                            <BiasIcon bias={m?.bias ?? null} />
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-slate-400">
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
        <p className="mt-2 text-xs text-slate-400">
          MAE↓ / RMSE↓ = 小さいほど良い。<strong className="text-blue-600">太字</strong>はホライズン内最良モデル。
          Bias: 正=予測が実測より高め傾向、負=低め傾向。
        </p>
      </div>

      {/* 指標の読み方 */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <div className="space-y-1 text-xs text-amber-600">
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
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-slate-400" />
          <div className="space-y-1 text-xs text-slate-500">
            <p className="font-semibold text-slate-600">予測の信頼性について</p>
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
