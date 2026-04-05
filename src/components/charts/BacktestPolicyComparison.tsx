"use client";

/**
 * BacktestPolicyComparison — 評価条件別比較: 全日 / イベント除外 / 長期イベント除外
 *
 * 同一 run の複数 eval_policy を モデル × ホライズン で並べて表示する。
 *
 * 表示ポリシー:
 *   1. all_days                    — 全日 (比較ベースライン)
 *   2. exclude_flagged_plus_recovery — 通常日 (チートデイ・旅行日+回復期間を除外)
 *   3. exclude_long_event_blocks   — 長期除外後 (連続5日以上のイベント区間を除外) [#480]
 *
 * 表示設計の判断理由:
 *   - n_predictions (評価使用サンプル数) を必須とし、精度指標だけを強調しすぎない
 *     (除外件数が少ない場合は改善幅を過大評価しやすいため)
 *   - n_predictions=0 / mae=NULL は「全件除外」バッジとして明示
 *   - policy 行が 1 件もない場合はそのポリシー列を「—」表示
 *
 * 非表示条件:
 *   - "exclude_flagged_plus_recovery" 行が 1 件もない場合は null を返す
 *     (旧 run または --eval-policies all_days のみ実行時)
 *
 * 詳細指標 (MAE/RMSE/Bias × 3ポリシー全比較) は BacktestLongEventDetails に分離。
 */

import { Fragment } from "react";
import { ShieldCheck } from "lucide-react";
import type { ForecastBacktestMetric } from "@/lib/supabase/types";

// ── 定数 ──────────────────────────────────────────────────────────────────────

const HORIZONS = [7, 14, 30] as const;
type Horizon = (typeof HORIZONS)[number];

const POLICY_ALL          = "all_days";
const POLICY_EXCLUDE      = "exclude_flagged_plus_recovery";
const POLICY_LONG_EVENT   = "exclude_long_event_blocks";

/** UI 表示名 */
const POLICY_LABELS: Record<string, string> = {
  [POLICY_ALL]:        "全日",
  [POLICY_EXCLUDE]:    "通常日（イベント除外）",
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
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function fmt3(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(3);
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

/** horizon × policy ごとに最良 MAE のモデルを返す */
function bestModelForPolicy(
  metrics: ForecastBacktestMetric[],
  policy: string,
  horizon: Horizon,
): { model: string; mae: number } | null {
  let best: { model: string; mae: number } | null = null;
  for (const model of MODEL_ORDER) {
    const m = findMetric(metrics, model, horizon, policy);
    if (!m || m.mae === null) continue;
    if (!best || m.mae < best.mae) best = { model, mae: m.mae };
  }
  return best;
}

/**
 * policy × horizon の組み合わせごとに最良 MAE 値を返す。
 * キー: "${policy}:${horizon_days}"
 */
function bestMaePerColumn(
  metrics: ForecastBacktestMetric[],
): Map<string, number> {
  const best = new Map<string, number>();
  for (const m of metrics) {
    if (m.mae === null) continue;
    const key = `${m.eval_policy}:${m.horizon_days}`;
    const cur = best.get(key);
    if (cur === undefined || m.mae < cur) best.set(key, m.mae);
  }
  return best;
}

/** 浮動小数点の誤差を考慮した「最良MAE」判定 */
function isBestMae(
  mae: number | null | undefined,
  best: number | undefined,
): boolean {
  if (mae == null || best == null) return false;
  return Math.abs(mae - best) < 1e-9;
}

// ── コンポーネント ────────────────────────────────────────────────────────────

export function BacktestPolicyComparison({ metrics }: Props) {
  const hasExcludePolicy    = metrics.some((m) => m.eval_policy === POLICY_EXCLUDE);
  const hasLongEventPolicy  = metrics.some((m) => m.eval_policy === POLICY_LONG_EVENT);

  if (!hasExcludePolicy) return null;

  // デスクトップテーブル用: 各 policy × horizon 列の最良 MAE
  const bestMaes = bestMaePerColumn(metrics);

  // 除外概要: h=7, NeuralProphet を代表値として使用
  const summaryRow =
    findMetric(metrics, "NeuralProphet", 7, POLICY_EXCLUDE) ??
    metrics.find((m) => m.eval_policy === POLICY_EXCLUDE && m.n_total > 0);

  const longEventSummary =
    findMetric(metrics, "NeuralProphet", 7, POLICY_LONG_EVENT) ??
    metrics.find((m) => m.eval_policy === POLICY_LONG_EVENT && m.n_total > 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      {/* ── ヘッダー ── */}
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-violet-500" />
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
              評価条件別比較
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />
              {POLICY_LABELS[POLICY_ALL]}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500" />
              {POLICY_LABELS[POLICY_EXCLUDE]}
            </span>
            {hasLongEventPolicy && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-500" />
                {POLICY_LABELS[POLICY_LONG_EVENT]}
              </span>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-600 dark:text-slate-300">全日</span>はイベント日を含む全サンプルで評価、
          <span className="font-medium text-violet-600">通常日</span>はチートデイ・旅行日と回復期間（2日）を除外して評価。
          {hasLongEventPolicy && (
            <>
              {" "}<span className="font-medium text-teal-600 dark:text-teal-400">長期除外後</span>は連続5日以上のイベント区間と回復期間（5日）のみを除外して評価。
            </>
          )}
          <strong className="text-slate-600 dark:text-slate-300">
            {" "}除外サンプルが少ない場合は精度差を過大評価しないでください。
          </strong>
        </p>
        {summaryRow && summaryRow.n_total > 0 && (
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            通常日除外（h=7, NP 代表）: {summaryRow.n_total} 件中{" "}
            {summaryRow.n_excluded} 件除外 → {summaryRow.n_predictions} 件使用
            {longEventSummary && longEventSummary.n_total > 0 && (
              <span className="ml-3">
                / 長期除外（h=7, NP 代表）: {longEventSummary.n_excluded} 件除外 → {longEventSummary.n_predictions} 件使用
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── モバイル: horizon 別カード (md 未満) ── */}
      <div className="md:hidden space-y-3 p-4">
        {HORIZONS.map((h) => {
          const allBest       = bestModelForPolicy(metrics, POLICY_ALL, h);
          const exBest        = bestModelForPolicy(metrics, POLICY_EXCLUDE, h);
          const longEventBest = hasLongEventPolicy ? bestModelForPolicy(metrics, POLICY_LONG_EVENT, h) : null;
          const exBestRow     = exBest ? findMetric(metrics, exBest.model, h, POLICY_EXCLUDE) : undefined;
          const leBestRow     = longEventBest ? findMetric(metrics, longEventBest.model, h, POLICY_LONG_EVENT) : undefined;
          const exAllExcluded = exBestRow ? exBestRow.n_predictions === 0
            : metrics.some((m) => m.horizon_days === h && m.eval_policy === POLICY_EXCLUDE && m.n_predictions === 0);
          const leAllExcluded = leBestRow ? leBestRow.n_predictions === 0
            : metrics.some((m) => m.horizon_days === h && m.eval_policy === POLICY_LONG_EVENT && m.n_predictions === 0);

          return (
            <div key={h} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">D+{h} 日先</p>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-xs">
                {/* 全日 */}
                {allBest && (
                  <div>
                    <p className="mb-0.5 font-medium text-slate-500 dark:text-slate-400">全日 ★</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">
                      {MODEL_LABELS[allBest.model] ?? allBest.model}
                    </p>
                    <p className="font-mono text-slate-500 dark:text-slate-400">MAE {fmt3(allBest.mae)}</p>
                  </div>
                )}
                {/* 通常日（イベント除外） */}
                <div>
                  <p className="mb-0.5 font-medium text-violet-600">通常日 ★</p>
                  {exAllExcluded ? (
                    <p className="text-slate-400 dark:text-slate-500">全件除外</p>
                  ) : exBest ? (
                    <>
                      <p className="font-semibold text-slate-700 dark:text-slate-200">
                        {MODEL_LABELS[exBest.model] ?? exBest.model}
                      </p>
                      <p className="font-mono text-slate-500 dark:text-slate-400">MAE {fmt3(exBest.mae)}</p>
                      {exBestRow && (
                        <p className="text-slate-400 dark:text-slate-500">n={exBestRow.n_predictions}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-slate-400 dark:text-slate-500">データなし</p>
                  )}
                </div>
                {/* 長期除外後 */}
                {hasLongEventPolicy && (
                  <div>
                    <p className="mb-0.5 font-medium text-teal-600 dark:text-teal-400">長期除外後 ★</p>
                    {leAllExcluded ? (
                      <p className="text-slate-400 dark:text-slate-500">全件除外</p>
                    ) : longEventBest ? (
                      <>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                          {MODEL_LABELS[longEventBest.model] ?? longEventBest.model}
                        </p>
                        <p className="font-mono text-slate-500 dark:text-slate-400">MAE {fmt3(longEventBest.mae)}</p>
                        {leBestRow && (
                          <p className="text-slate-400 dark:text-slate-500">n={leBestRow.n_predictions}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-slate-400 dark:text-slate-500">データなし</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          ★ = ホライズン別最良モデル / n = 評価使用サンプル数（予測点数）。実日数ではない。
          全件除外 = 除外条件により評価対象サンプルがゼロになった状態（データ欠損ではない）。
        </p>
      </div>

      {/* ── デスクトップ: 比較テーブル (md+) ── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm" style={{ minWidth: hasLongEventPolicy ? "760px" : "640px" }}>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
              <th className="px-4 py-2.5 text-left">モデル</th>
              {HORIZONS.map((h) => (
                <th
                  key={h}
                  colSpan={hasLongEventPolicy ? 3 : 3}
                  className="border-l border-slate-100 px-3 py-2.5 text-center dark:border-slate-700"
                >
                  D+{h}日先
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-200 text-[11px] font-medium text-slate-400 dark:border-slate-700 dark:text-slate-500">
              <th className="px-4 py-1.5 text-left">MAE (kg) / n</th>
              {HORIZONS.map((h) => (
                <Fragment key={h}>
                  <th className="border-l border-slate-100 px-3 py-1.5 text-center text-slate-500 dark:border-slate-700">
                    全日
                  </th>
                  <th className="px-3 py-1.5 text-center text-violet-500">通常日</th>
                  {hasLongEventPolicy && (
                    <th className="px-3 py-1.5 text-center text-teal-600 dark:text-teal-400">長期除外後</th>
                  )}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
            {MODEL_ORDER.map((model) => {
              const label = MODEL_LABELS[model] ?? model;
              return (
                <tr key={model} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800">
                  <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200">{label}</td>
                  {HORIZONS.map((h) => {
                    const allM   = findMetric(metrics, model, h, POLICY_ALL);
                    const exM    = findMetric(metrics, model, h, POLICY_EXCLUDE);
                    const leM    = hasLongEventPolicy ? findMetric(metrics, model, h, POLICY_LONG_EVENT) : undefined;
                    const exAllExcluded = exM ? exM.n_predictions === 0 : false;
                    const leAllExcluded = leM ? leM.n_predictions === 0 : false;
                    const isAllBest = isBestMae(allM?.mae, bestMaes.get(`${POLICY_ALL}:${h}`));
                    const isExBest  = isBestMae(exM?.mae,  bestMaes.get(`${POLICY_EXCLUDE}:${h}`));
                    const isLeBest  = isBestMae(leM?.mae,  bestMaes.get(`${POLICY_LONG_EVENT}:${h}`));
                    return (
                      <Fragment key={`${model}-${h}`}>
                        {/* 全日 MAE / n */}
                        <td
                          className={`border-l border-slate-100 px-3 py-2 text-center font-mono tabular-nums dark:border-slate-700 ${
                            isAllBest ? "font-bold text-blue-700 dark:text-blue-400" : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          <div>
                            {fmt3(allM?.mae)}
                            {isAllBest && (
                              <span className="ml-1 text-xs text-blue-400" aria-label="最良">★</span>
                            )}
                          </div>
                          {allM != null && (
                            <div className="text-[10px] text-slate-400 dark:text-slate-500">
                              n={allM.n_predictions}
                            </div>
                          )}
                        </td>
                        {/* 通常日 MAE / n */}
                        <td className="px-3 py-2 text-center font-mono tabular-nums">
                          {exAllExcluded ? (
                            <span
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-700 dark:text-slate-400"
                              title="除外条件により評価対象サンプルがゼロになった状態。データ欠損ではありません。"
                            >
                              全件除外
                            </span>
                          ) : (
                            <>
                              <div className={isExBest ? "font-bold text-violet-700 dark:text-violet-400" : "text-violet-600"}>
                                {fmt3(exM?.mae)}
                                {isExBest && (
                                  <span className="ml-1 text-xs text-violet-400" aria-label="最良">★</span>
                                )}
                              </div>
                              {exM != null && (
                                <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                  n={exM.n_predictions}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        {/* 長期除外後 MAE / n */}
                        {hasLongEventPolicy && (
                          <td className="px-3 py-2 text-center font-mono tabular-nums">
                            {leAllExcluded ? (
                              <span
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-700 dark:text-slate-400"
                                title="除外条件により評価対象サンプルがゼロになった状態。データ欠損ではありません。"
                              >
                                全件除外
                              </span>
                            ) : (
                              <>
                                <div className={isLeBest ? "font-bold text-teal-700 dark:text-teal-400" : "text-teal-600 dark:text-teal-500"}>
                                  {fmt3(leM?.mae)}
                                  {isLeBest && (
                                    <span className="ml-1 text-xs text-teal-400" aria-label="最良">★</span>
                                  )}
                                </div>
                                {leM != null && (
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                    n={leM.n_predictions}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                        )}
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── フッター注記 ── */}
      <div className="border-t border-slate-50 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
        ★ = 各 horizon 列の最良 MAE（同率の場合は複数）。
        全日 = イベントを含む全評価サンプル /
        通常日 = cheat_day · travel_day と回復 2 日を除外 /
        {hasLongEventPolicy && " 長期除外後 = 連続5日以上のイベント区間と回復 5 日を除外 / "}
        全件除外 = 除外条件により評価対象サンプルがゼロになった状態（データ欠損ではない）。
        n = 評価使用サンプル数（予測点数）。実日数ではない。
        {hasLongEventPolicy && " 詳細指標 (RMSE/Bias) は「長期イベント区間詳細」を参照。"}
      </div>
    </div>
  );
}
