"use client";

/**
 * BacktestPolicyComparison — 評価条件別比較: 全日 vs イベント除外
 *
 * 同一 run の "all_days" / "exclude_flagged_plus_recovery" の 2 policy を
 * モデル × ホライズン で並べて表示する。
 *
 * #363 で実装された evaluation policy 基盤を前提とし、
 * #364 の要求「通常日の予測精度とイベント込み精度を同一画面で比較できる」を満たす。
 *
 * 表示設計の判断理由:
 *   - 件数列 (除外数) を必須とし、精度指標だけを強調しすぎない
 *     (除外件数が少ない場合は改善幅を過大評価しやすいため)
 *   - n_predictions=0 / mae=NULL は「全件除外」バッジとして明示
 *     (#363 でこの行も保存するよう修正済みのため、行欠損との区別が可能)
 *   - eval_policy の表示名はこのファイルで管理する (UI 固有文言)
 *
 * 非表示条件:
 *   - "exclude_flagged_plus_recovery" 行が 1 件もない場合は null を返す
 *     (旧 run または --eval-policies all_days のみ実行時)
 */

import { Fragment } from "react";
import { ShieldCheck } from "lucide-react";
import type { ForecastBacktestMetric } from "@/lib/supabase/types";

// ── 定数 ──────────────────────────────────────────────────────────────────────

const HORIZONS = [7, 14, 30] as const;
type Horizon = (typeof HORIZONS)[number];

const POLICY_ALL     = "all_days";
const POLICY_EXCLUDE = "exclude_flagged_plus_recovery";

/** UI 表示名 */
const POLICY_LABELS: Record<string, string> = {
  [POLICY_ALL]:     "全日",
  [POLICY_EXCLUDE]: "通常日（イベント除外）",
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
 * null MAE（全件除外行）は比較対象外。同率最良は複数セルにマーキングされる。
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
  const hasExcludePolicy = metrics.some((m) => m.eval_policy === POLICY_EXCLUDE);
  if (!hasExcludePolicy) return null;

  // デスクトップテーブル用: 各 policy × horizon 列の最良 MAE
  const bestMaes = bestMaePerColumn(metrics);

  // 除外概要: すべての exclude 行のうち n_total > 0 の代表値として h=7, NeuralProphet を優先
  const summaryRow =
    findMetric(metrics, "NeuralProphet", 7, POLICY_EXCLUDE) ??
    metrics.find((m) => m.eval_policy === POLICY_EXCLUDE && m.n_total > 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* ── ヘッダー ── */}
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-violet-500" />
            <span className="text-sm font-bold text-slate-700">
              評価条件別比較: 全日 vs イベント除外
            </span>
          </div>
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />
              {POLICY_LABELS[POLICY_ALL]}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500" />
              {POLICY_LABELS[POLICY_EXCLUDE]}
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-medium text-slate-600">全日</span>はイベント日を含む全サンプルで評価、
          <span className="font-medium text-violet-600">通常日</span>はチートデイ・旅行日と回復期間（2日）を除外したサンプルで評価します。
          <strong className="text-slate-600">
            {" "}除外サンプルが少ない場合は精度差を過大評価しないでください。
          </strong>
        </p>
        {summaryRow && summaryRow.n_total > 0 && (
          <p className="mt-1 text-[11px] text-slate-400">
            除外状況（h=7, NP 代表）: 評価サンプル計 {summaryRow.n_total} 件中{" "}
            {summaryRow.n_excluded} 件除外 → 評価使用 {summaryRow.n_predictions} 件
            {summaryRow.n_excluded === 0 && (
              <span className="ml-1 text-slate-400">
                ※ 手動イベント期間未設定。自動タグ (cheat/travel) のみが除外対象です。
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── モバイル: horizon 別カード (md 未満) ── */}
      <div className="md:hidden space-y-3 p-4">
        {HORIZONS.map((h) => {
          const allBest = bestModelForPolicy(metrics, POLICY_ALL, h);
          const exBest  = bestModelForPolicy(metrics, POLICY_EXCLUDE, h);
          // 最良モデルの exclude 行 (n_excluded を取るため)
          const exBestRow = exBest
            ? findMetric(metrics, exBest.model, h, POLICY_EXCLUDE)
            : undefined;
          const allExcluded = exBestRow
            ? exBestRow.n_predictions === 0
            : metrics.some(
                (m) => m.horizon_days === h && m.eval_policy === POLICY_EXCLUDE && m.n_predictions === 0,
              );

          return (
            <div key={h} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="mb-2 text-xs font-bold text-slate-600">D+{h} 日先</p>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-xs">
                {/* 全日 */}
                {allBest && (
                  <div>
                    <p className="mb-0.5 font-medium text-slate-500">全日 ★</p>
                    <p className="font-semibold text-slate-700">
                      {MODEL_LABELS[allBest.model] ?? allBest.model}
                    </p>
                    <p className="font-mono text-slate-500">MAE {fmt3(allBest.mae)}</p>
                  </div>
                )}
                {/* 通常日（イベント除外） */}
                <div>
                  <p className="mb-0.5 font-medium text-violet-600">通常日 ★</p>
                  {allExcluded ? (
                    <p className="text-slate-400">全件除外（除外条件により評価対象なし）</p>
                  ) : exBest ? (
                    <>
                      <p className="font-semibold text-slate-700">
                        {MODEL_LABELS[exBest.model] ?? exBest.model}
                      </p>
                      <p className="font-mono text-slate-500">MAE {fmt3(exBest.mae)}</p>
                      {exBestRow && exBestRow.n_excluded > 0 && (
                        <p className="text-slate-400">除外 {exBestRow.n_excluded} 件</p>
                      )}
                    </>
                  ) : (
                    <p className="text-slate-400">データなし</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-slate-400">
          ★ = ホライズン別最良モデル / 件数はホライズンごとの評価サンプル数（予測点数）。実日数ではない。
          全件除外 = 除外条件により評価対象サンプルがゼロになった状態（データ欠損ではない）。
        </p>
      </div>

      {/* ── デスクトップ: 比較テーブル (md+) ── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 text-left">モデル</th>
              {HORIZONS.map((h) => (
                <th
                  key={h}
                  colSpan={3}
                  className="border-l border-slate-100 px-3 py-2.5 text-center"
                >
                  D+{h}日先
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-200 text-[11px] font-medium text-slate-400">
              <th className="px-4 py-1.5 text-left">MAE (kg)</th>
              {HORIZONS.map((h) => (
                <Fragment key={h}>
                  <th className="border-l border-slate-100 px-3 py-1.5 text-center text-slate-500">
                    全日
                  </th>
                  <th className="px-3 py-1.5 text-center text-violet-500">通常日</th>
                  <th className="px-2 py-1.5 text-center text-slate-400">除外†</th>
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
                    const allM = findMetric(metrics, model, h, POLICY_ALL);
                    const exM  = findMetric(metrics, model, h, POLICY_EXCLUDE);
                    const allExcluded = exM ? exM.n_predictions === 0 : false;
                    const isAllBest = isBestMae(allM?.mae, bestMaes.get(`${POLICY_ALL}:${h}`));
                    const isExBest  = isBestMae(exM?.mae,  bestMaes.get(`${POLICY_EXCLUDE}:${h}`));
                    return (
                      <Fragment key={`${model}-${h}`}>
                        {/* 全日 MAE */}
                        <td
                          className={`border-l border-slate-100 px-3 py-2.5 text-center font-mono tabular-nums ${
                            isAllBest ? "font-bold text-blue-700" : "text-slate-600"
                          }`}
                        >
                          {fmt3(allM?.mae)}
                          {isAllBest && (
                            <span className="ml-0.5 text-[9px] text-blue-400" aria-label="最良">★</span>
                          )}
                        </td>
                        {/* 通常日 MAE / 全件除外バッジ */}
                        <td className="px-3 py-2.5 text-center font-mono tabular-nums">
                          {allExcluded ? (
                            <span
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400"
                              title="除外条件により評価対象サンプルがゼロになった状態。データ欠損ではありません。"
                            >
                              全件除外
                            </span>
                          ) : (
                            <>
                              <span className={isExBest ? "font-bold text-violet-700" : "text-violet-600"}>
                                {fmt3(exM?.mae)}
                              </span>
                              {isExBest && (
                                <span className="ml-0.5 text-[9px] text-violet-400" aria-label="最良">★</span>
                              )}
                            </>
                          )}
                        </td>
                        {/* 除外数 */}
                        <td className="px-2 py-2.5 text-center text-[11px] tabular-nums text-slate-400">
                          {exM != null ? exM.n_excluded : "—"}
                        </td>
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
      <div className="border-t border-slate-50 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-400">
        ★ = 各 horizon 列の最良 MAE（同率の場合は複数）。
        全日 = イベントを含む全評価サンプルで評価 / 通常日 = cheat_day · travel_day と回復 2 日を除外して評価。
        全件除外 = 除外条件により評価対象サンプルがゼロになった状態（データ欠損ではない）。
        † 除外数は実日数ではなくホライズンごとの評価サンプル数（予測点数）。除外数が少ないほど精度差は参考程度。
      </div>
    </div>
  );
}
