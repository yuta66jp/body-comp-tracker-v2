/**
 * BacktestLongEventDetails — 長期イベント区間除外ポリシーの詳細表示 (#480)
 *
 * 表示内容:
 *   1. 検出された長期イベントブロック一覧 (日付範囲 / 日数)
 *   2. 除外対象日数と回復期間設定の確認
 *   3. 全ポリシー (all_days / exclude_flagged_plus_recovery / exclude_long_event_blocks) の
 *      詳細指標 (MAE / RMSE / Bias / n) 比較テーブル
 *
 * 目的:
 *   - 長期イベント区間が精度劣化要因かを定量確認する (#480)
 *   - 改善幅とサンプル数減少の両方を確認できるようにする
 *   - 次段階 Issue への判断材料を提供する
 *
 * 非表示条件:
 *   - exclude_long_event_blocks policy が metrics に存在しない場合は null を返す
 */

import { TrendingDown } from "lucide-react";
import type { ForecastBacktestMetric } from "@/lib/supabase/types";
import type { LongEventBlock } from "@/lib/utils/backtestExclusion";

// ── 定数 ──────────────────────────────────────────────────────────────────────

const HORIZONS = [7, 14, 30] as const;

const POLICY_ALL        = "all_days";
const POLICY_EXCLUDE    = "exclude_flagged_plus_recovery";
const POLICY_LONG_EVENT = "exclude_long_event_blocks";

const POLICY_SHORT_LABELS: Record<string, string> = {
  [POLICY_ALL]:        "全日",
  [POLICY_EXCLUDE]:    "通常日",
  [POLICY_LONG_EVENT]: "長期除外後",
};

const MODEL_ORDER = ["NeuralProphet", "MovingAverage7d", "LinearTrend30d", "EWLinearTrend", "Naive"];
const MODEL_LABELS: Record<string, string> = {
  NeuralProphet:   "NeuralProphet",
  MovingAverage7d: "MA 7d",
  LinearTrend30d:  "Linear 30d",
  EWLinearTrend:   "EW Linear",
  Naive:           "Naive",
};

// ── 型 ────────────────────────────────────────────────────────────────────────

interface Props {
  metrics: ForecastBacktestMetric[];
  longEventBlocks: LongEventBlock[];
  longEventThreshold: number;
  longEventRecoveryDays: number;
  /** 長期イベント除外ポリシーの除外対象日数 (カレンダー日数) */
  excludedCalendarDays: number;
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function fmt3(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(3);
}

function fmtBias(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(3)}`;
}

function findMetric(
  metrics: ForecastBacktestMetric[],
  model: string,
  horizon: number,
  policy: string,
): ForecastBacktestMetric | undefined {
  return metrics.find(
    (m) => m.model_name === model && m.horizon_days === horizon && m.eval_policy === policy,
  );
}

// ── コンポーネント ────────────────────────────────────────────────────────────

export function BacktestLongEventDetails({
  metrics,
  longEventBlocks,
  longEventThreshold,
  longEventRecoveryDays,
  excludedCalendarDays,
}: Props) {
  const hasLongEventPolicy = metrics.some((m) => m.eval_policy === POLICY_LONG_EVENT);
  if (!hasLongEventPolicy) return null;

  // 表示するポリシー (存在するものだけ)
  const visiblePolicies = [POLICY_ALL, POLICY_EXCLUDE, POLICY_LONG_EVENT].filter(
    (p) => metrics.some((m) => m.eval_policy === p),
  );

  return (
    <details className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      {/* ── サマリー行（クリックで展開） ── */}
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <TrendingDown size={15} className="flex-shrink-0 text-teal-500" />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
            長期イベント区間詳細
          </span>
          {longEventBlocks.length > 0 ? (
            <span className="rounded-full bg-teal-100 dark:bg-teal-900/30 px-2 py-0.5 text-[11px] font-semibold text-teal-600 dark:text-teal-400">
              {longEventBlocks.length} ブロック検出
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              長期ブロックなし
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-slate-400 dark:text-slate-500 sm:inline">
            閾値 {longEventThreshold} 日 / 回復 {longEventRecoveryDays} 日 / 除外 {excludedCalendarDays} 日
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 group-open:hidden">▼ 展開</span>
          <span className="hidden text-xs text-slate-400 dark:text-slate-500 group-open:inline">▲ 閉じる</span>
        </div>
      </summary>

      {/* ── 展開コンテンツ ── */}
      <div className="divide-y divide-slate-50 dark:divide-slate-700/60">

        {/* 検出ブロック一覧 */}
        <div className="px-5 py-3">
          <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            検出された長期イベントブロック
            <span className="ml-2 text-[11px] font-normal text-slate-400 dark:text-slate-500">
              （連続 {longEventThreshold} 日以上のイベント区間）
            </span>
          </p>
          {longEventBlocks.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              長期イベントブロックは検出されませんでした。
              DB フラグ (cheat_day / travel_day) の連続期間が {longEventThreshold} 日未満のため、
              exclude_long_event_blocks ポリシーは全日と同じ結果になります。
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {longEventBlocks.map((block) => (
                <div
                  key={block.start}
                  className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs dark:border-teal-800/50 dark:bg-teal-900/20"
                >
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {block.start} 〜 {block.end}
                  </span>
                  <span className="ml-2 text-teal-600 dark:text-teal-400 font-medium">
                    {block.days} 日間
                  </span>
                </div>
              ))}
            </div>
          )}
          {longEventBlocks.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              除外対象: ブロック本体 + ブロック終了後 {longEventRecoveryDays} 日の回復期間。
              合計 {excludedCalendarDays} カレンダー日 が除外対象になります。
            </p>
          )}
        </div>

        {/* 詳細指標比較テーブル */}
        <div>
          <div className="px-5 py-2.5 bg-slate-50/60 dark:bg-slate-800/60">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              詳細指標比較（MAE / RMSE / Bias / n）
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              各ポリシーの精度指標を全 horizon × 全モデルで確認できます。
              Bias が正 = 予測が実測より高い傾向（上振れ）、負 = 低い傾向（下振れ）。
            </p>
          </div>

          {/* モバイル: horizon × policy カード */}
          <div className="md:hidden space-y-4 p-4">
            {HORIZONS.map((h) => (
              <div key={h}>
                <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">D+{h} 日先</p>
                <div className="space-y-2">
                  {MODEL_ORDER.map((model) => {
                    const cells = visiblePolicies.map((p) => findMetric(metrics, model, h, p));
                    if (cells.every((c) => c === undefined)) return null;
                    return (
                      <div key={model} className="rounded-lg border border-slate-100 dark:border-slate-700 p-3">
                        <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {MODEL_LABELS[model] ?? model}
                        </p>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                          {visiblePolicies.map((p) => {
                            const m = findMetric(metrics, model, h, p);
                            const colorClass =
                              p === POLICY_LONG_EVENT ? "text-teal-600 dark:text-teal-400"
                              : p === POLICY_EXCLUDE  ? "text-violet-600"
                              : "text-slate-500 dark:text-slate-400";
                            return (
                              <div key={p}>
                                <p className={`font-medium ${colorClass}`}>{POLICY_SHORT_LABELS[p]}</p>
                                <p className="font-mono text-slate-700 dark:text-slate-300">
                                  MAE {fmt3(m?.mae)}
                                </p>
                                <p className="text-slate-400 dark:text-slate-500">
                                  RMSE {fmt3(m?.rmse)}
                                </p>
                                <p className="text-slate-400 dark:text-slate-500">
                                  Bias {fmtBias(m?.bias)}
                                </p>
                                <p className="text-slate-400 dark:text-slate-500">
                                  n={m != null ? m.n_predictions : "—"}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* デスクトップ: テーブル */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[700px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                  <th className="px-4 py-2 text-left">モデル</th>
                  {HORIZONS.map((h) => (
                    <th
                      key={h}
                      colSpan={visiblePolicies.length * 4}
                      className="border-l border-slate-100 px-3 py-2 text-center dark:border-slate-700"
                    >
                      D+{h}日先
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500">
                  <th className="px-4 py-1.5 text-left"></th>
                  {HORIZONS.map((h) => (
                    visiblePolicies.map((p) => {
                      const colorClass =
                        p === POLICY_LONG_EVENT ? "text-teal-600 dark:text-teal-400"
                        : p === POLICY_EXCLUDE  ? "text-violet-500"
                        : "text-slate-500";
                      return (
                        <th
                          key={`${h}-${p}`}
                          colSpan={4}
                          className={`border-l border-slate-100 px-2 py-1.5 text-center dark:border-slate-700 ${colorClass}`}
                        >
                          {POLICY_SHORT_LABELS[p]}
                        </th>
                      );
                    })
                  ))}
                </tr>
                <tr className="border-b border-slate-200 text-[10px] font-medium text-slate-400 dark:border-slate-700 dark:text-slate-500">
                  <th className="px-4 py-1"></th>
                  {HORIZONS.map((h) => (
                    visiblePolicies.map((p) => (
                      <>
                        <th key={`${h}-${p}-mae`}  className="border-l border-slate-100 px-2 py-1 text-center dark:border-slate-700">MAE</th>
                        <th key={`${h}-${p}-rmse`} className="px-2 py-1 text-center">RMSE</th>
                        <th key={`${h}-${p}-bias`} className="px-2 py-1 text-center">Bias</th>
                        <th key={`${h}-${p}-n`}    className="px-2 py-1 text-center">n</th>
                      </>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                {MODEL_ORDER.map((model) => {
                  // モデルのデータが全 horizon × policy で存在しない場合はスキップ
                  const hasData = HORIZONS.some((h) =>
                    visiblePolicies.some((p) => findMetric(metrics, model, h, p) !== undefined)
                  );
                  if (!hasData) return null;

                  return (
                    <tr key={model} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-200">
                        {MODEL_LABELS[model] ?? model}
                      </td>
                      {HORIZONS.map((h) => (
                        visiblePolicies.map((p) => {
                          const m = findMetric(metrics, model, h, p);
                          const colorClass =
                            p === POLICY_LONG_EVENT ? "text-teal-700 dark:text-teal-400"
                            : p === POLICY_EXCLUDE  ? "text-violet-700 dark:text-violet-400"
                            : "text-slate-600 dark:text-slate-300";
                          return (
                            <>
                              <td key={`${h}-${p}-mae`}  className={`border-l border-slate-100 px-2 py-2 text-center font-mono tabular-nums dark:border-slate-700 ${colorClass}`}>
                                {m?.n_predictions === 0 ? (
                                  <span className="text-[10px] text-slate-400">全除外</span>
                                ) : fmt3(m?.mae)}
                              </td>
                              <td key={`${h}-${p}-rmse`} className={`px-2 py-2 text-center font-mono tabular-nums ${colorClass}`}>
                                {m?.n_predictions === 0 ? "—" : fmt3(m?.rmse)}
                              </td>
                              <td key={`${h}-${p}-bias`} className={`px-2 py-2 text-center font-mono tabular-nums ${colorClass}`}>
                                {m?.n_predictions === 0 ? "—" : fmtBias(m?.bias)}
                              </td>
                              <td key={`${h}-${p}-n`}    className="px-2 py-2 text-center text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                                {m != null ? m.n_predictions : "—"}
                              </td>
                            </>
                          );
                        })
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 補足注記 */}
        <div className="bg-slate-50/60 dark:bg-slate-800/60 px-5 py-2.5 text-[11px] text-slate-400 dark:text-slate-500">
          閾値 {longEventThreshold} 日 / 回復 {longEventRecoveryDays} 日 はいずれも仮説値（#480 初期設定）。
          改善幅が小さい・サンプル数が大きく減る場合は、閾値変更や長期区間除外そのものの採否を再検討すること。
          この評価は NeuralProphet の学習系列変更を含まない（評価フェーズのみ）。
          学習系列変更は別 Issue で判断する。
        </div>
      </div>
    </details>
  );
}
