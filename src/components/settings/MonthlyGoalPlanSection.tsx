"use client";

/**
 * MonthlyGoalPlanSection
 *
 * Settings 画面に埋め込む月次目標体重計画の表示・編集セクション。
 *
 * - buildMonthlyGoalPlan (#101 ロジック) でプランを表示
 * - 当月・将来月 (最終月以外) の目標体重をインライン編集可
 * - 編集時は override 配列を upsert し、buildMonthlyGoalPlan で全体を再構築する
 *   (UI 側で再配分ロジックを持たない。redistributeMonthlyGoals は使用しない)
 * - 複数月 override (anchor) を同時に持てる
 * - 手動月に「解除」ボタンを表示し、解除するとその月が auto に戻る
 * - 警告・エラーを表示
 *
 * 今日の日付は today プロップから受け取る (テスト容易性のため)。
 */

import { useState, useMemo, useEffect } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { buildMonthlyGoalPlan } from "@/lib/utils/monthlyGoalPlan";
import { parseStrictNumber } from "@/lib/utils/parseNumber";
import type {
  MonthlyGoalOverride,
  MonthlyGoalErrorCode,
  MonthlyGoalWarningCode,
  MonthlyGoalWarning,
} from "@/lib/utils/monthlyGoalPlan";

// ─── Props ───────────────────────────────────────────────────────────────────

interface MonthlyGoalPlanSectionProps {
  goalWeight: number | null;
  contestDate: string | null;
  currentWeight: number | null;
  today: string;
  overrides: MonthlyGoalOverride[];
  onOverridesChange: (overrides: MonthlyGoalOverride[]) => void;
}

// ─── 表示ラベル ───────────────────────────────────────────────────────────────

const ERROR_LABELS: Record<MonthlyGoalErrorCode, string> = {
  INVALID_DEADLINE:           "コンテスト日の形式が不正です",
  INVALID_CURRENT_WEIGHT:     "現在体重を取得できません。体重を記録してください",
  INVALID_GOAL_WEIGHT:        "目標体重を設定してください",
  INVALID_OVERRIDE_WEIGHT:    "手動設定の体重が不正です。計画をリセットします",
  DEADLINE_IN_PAST:           "コンテスト日が過去です",
  NO_MONTHS:                  "計画対象月がありません",
  OVERRIDE_MONTH_OUT_OF_RANGE: "計画期間外の月に手動設定が含まれています",
};

function warningLabel(w: MonthlyGoalWarning): string {
  switch (w.code) {
    case "ALREADY_AT_GOAL":
      return "現在体重が既に目標体重に達しています";
    case "DEADLINE_TOO_CLOSE":
      return "コンテスト日まで残り1ヶ月以下です";
    case "HIGH_MONTHLY_DELTA":
      return `${fmtMonth(w.month!)} の目標変化量 ${Math.abs(w.value!).toFixed(1)} kg が推奨上限 ${w.threshold} kg/月 を超えています`;
    case "WRONG_DIRECTION":
      return `${fmtMonth(w.month!)} の目標が最終目標と逆方向です`;
    case "MANUAL_GOAL_MISMATCH":
      return "手動設定値が最終目標に収束していません";
    default:
      return w.code satisfies never;
  }
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

/** "YYYY-MM" → "YYYY年M月" */
function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${parseInt(m!, 10)}月`;
}

/** delta 表示: +1.0 / -1.0 / ±0.0 形式 */
function fmtDelta(kg: number): string {
  if (kg > 0) return `+${kg.toFixed(1)}`;
  return kg.toFixed(1);
}

/**
 * overrides 配列に override を upsert する (同月があれば更新、なければ追加)。
 * 既存の他月の override はすべて保持する。
 */
function upsertOverride(
  overrides: MonthlyGoalOverride[],
  override: MonthlyGoalOverride
): MonthlyGoalOverride[] {
  const idx = overrides.findIndex((o) => o.month === override.month);
  if (idx === -1) return [...overrides, override];
  return overrides.map((o, i) => (i === idx ? override : o));
}

// ─── スタイル定数 ─────────────────────────────────────────────────────────────

const inputCls =
  "w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 text-right";

// ─── コンポーネント ───────────────────────────────────────────────────────────

export function MonthlyGoalPlanSection({
  goalWeight,
  contestDate,
  currentWeight,
  today,
  overrides,
  onOverridesChange,
}: MonthlyGoalPlanSectionProps) {
  // ── 欠損チェック (plan を構築する前提条件) ────────────────────────────────
  if (!contestDate) {
    return (
      <PrereqMessage icon="info">
        コンテスト日を設定してください（上の設定から）
      </PrereqMessage>
    );
  }
  if (goalWeight === null) {
    return (
      <PrereqMessage icon="info">
        目標体重を設定してください（上の設定から）
      </PrereqMessage>
    );
  }
  if (currentWeight === null) {
    return (
      <PrereqMessage icon="info">
        体重が記録されていません。まず体重を記録してください
      </PrereqMessage>
    );
  }

  return (
    <PlanContent
      goalWeight={goalWeight}
      contestDate={contestDate}
      currentWeight={currentWeight}
      today={today}
      overrides={overrides}
      onOverridesChange={onOverridesChange}
    />
  );
}

// ─── 前提条件メッセージ ───────────────────────────────────────────────────────

function PrereqMessage({
  icon,
  children,
}: {
  icon: "info" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500">
      {icon === "info" ? (
        <Info size={14} className="shrink-0 text-slate-400" />
      ) : (
        <AlertTriangle size={14} className="shrink-0 text-amber-600" />
      )}
      <span>{children}</span>
    </div>
  );
}

// ─── 本体 (前提条件がそろった場合) ──────────────────────────────────────────

interface PlanContentProps {
  goalWeight: number;
  contestDate: string;
  currentWeight: number;
  today: string;
  overrides: MonthlyGoalOverride[];
  onOverridesChange: (overrides: MonthlyGoalOverride[]) => void;
}

function PlanContent({
  goalWeight,
  contestDate,
  currentWeight,
  today,
  overrides,
  onOverridesChange,
}: PlanContentProps) {
  // プランを overrides + 他パラメータから算出
  // override 配列が source of truth。buildMonthlyGoalPlan が全体を再構築する。
  const plan = useMemo(
    () =>
      buildMonthlyGoalPlan({
        currentWeight,
        today,
        finalGoalWeight: goalWeight,
        goalDeadlineDate: contestDate,
        monthlyActuals: [],
        overrides,
      }),
    [currentWeight, today, goalWeight, contestDate, overrides]
  );

  // plan.entries の month + targetWeight の両方を含む signature を作成する。
  // 月構造が変わった場合だけでなく、goalWeight / contestDate / currentWeight の変更で
  // targetWeight が再計算された場合も inputValues を再同期する必要があるため。
  const planSignature = plan.entries
    .map((e) => `${e.month}:${e.targetWeight}`)
    .join(",");

  const [inputValues, setInputValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      plan.entries.map((e) => [e.month, e.targetWeight.toFixed(1)])
    )
  );

  useEffect(() => {
    setInputValues(
      Object.fromEntries(
        plan.entries.map((e) => [e.month, e.targetWeight.toFixed(1)])
      )
    );
    // planSignature が変わったとき (月構造変化 or targetWeight 変化) に再同期する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSignature]);

  // プランに errors がある場合はエラー表示
  if (!plan.isValid) {
    return (
      <div className="space-y-1.5">
        {plan.errors.map((e) => (
          <div
            key={e.code}
            className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600"
          >
            <AlertTriangle size={14} className="shrink-0" />
            <span>{ERROR_LABELS[e.code]}</span>
          </div>
        ))}
      </div>
    );
  }

  const today_month = today.slice(0, 7);

  function handleChange(month: string, val: string) {
    setInputValues((prev) => ({ ...prev, [month]: val }));
  }

  /**
   * 月の編集をコミットする。
   * override 配列に upsert し、親に通知する。
   * buildMonthlyGoalPlan が全体を再構築するため、他月の manual override は保持される。
   */
  function handleCommit(month: string) {
    const raw = inputValues[month] ?? "";
    const parsed = parseStrictNumber(raw);

    if (parsed === null || parsed <= 0 || parsed > 300) {
      // 不正値: 元の plan 値に戻す
      const entry = plan.entries.find((e) => e.month === month);
      if (entry) {
        setInputValues((prev) => ({
          ...prev,
          [month]: entry.targetWeight.toFixed(1),
        }));
      }
      return;
    }

    // override 配列に upsert する (他月の override はすべて保持)
    const newOverrides = upsertOverride(overrides, { month, targetWeight: parsed });
    onOverridesChange(newOverrides);
    // inputValues は planSignature 変化で useEffect により再同期される
  }

  /**
   * 月の手動 override を解除する。
   * override 配列からその月を削除し、buildMonthlyGoalPlan が auto に戻す。
   */
  function handleReset(month: string) {
    const newOverrides = overrides.filter((o) => o.month !== month);
    onOverridesChange(newOverrides);
  }

  return (
    <div>
      {/* テーブル */}
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">月</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">目標体重</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">前月比</th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">種別</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">実績</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {plan.entries.map((entry, idx) => {
              const isLast = idx === plan.entries.length - 1;
              const isCurrent = entry.month === today_month;
              const isManual = entry.source === "manual";

              return (
                <tr
                  key={entry.month}
                  className={`${isCurrent ? "bg-blue-50/40" : "bg-white"} hover:bg-slate-50/60`}
                >
                  {/* 月 */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-medium text-slate-700">{fmtMonth(entry.month)}</span>
                    {isCurrent && (
                      <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                        今月
                      </span>
                    )}
                    {isLast && (
                      <span className="ml-1.5 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-600">
                        目標
                      </span>
                    )}
                  </td>

                  {/* 目標体重 */}
                  <td className="px-3 py-2 text-right">
                    {isLast ? (
                      <span className="font-semibold text-teal-600">
                        {entry.targetWeight.toFixed(1)} kg
                      </span>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.1"
                          min="20"
                          max="200"
                          value={inputValues[entry.month] ?? ""}
                          onChange={(e) => handleChange(entry.month, e.target.value)}
                          onBlur={() => handleCommit(entry.month)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleCommit(entry.month);
                            }
                          }}
                          className={inputCls}
                          aria-label={`${fmtMonth(entry.month)} 目標体重`}
                        />
                        <span className="text-xs text-slate-400">kg</span>
                      </div>
                    )}
                  </td>

                  {/* 前月比 */}
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`font-medium ${
                        entry.requiredDeltaKg < 0
                          ? "text-emerald-600"
                          : entry.requiredDeltaKg > 0
                          ? "text-rose-500"
                          : "text-slate-400"
                      }`}
                    >
                      {fmtDelta(entry.requiredDeltaKg)} kg
                    </span>
                  </td>

                  {/* 種別バッジ */}
                  <td className="px-3 py-2 text-center">
                    {isLast ? (
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-600">
                        終点
                      </span>
                    ) : isManual ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                          手動
                        </span>
                        <button
                          type="button"
                          onClick={() => handleReset(entry.month)}
                          className="text-[9px] text-slate-400 underline hover:text-rose-500"
                          aria-label={`${fmtMonth(entry.month)} 手動設定を解除`}
                        >
                          解除
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                        自動
                      </span>
                    )}
                  </td>

                  {/* 実績 */}
                  <td className="px-3 py-2 text-right">
                    {entry.actualWeight !== null ? (
                      <span className="text-slate-600">{entry.actualWeight.toFixed(1)} kg</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 警告 */}
      {plan.warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {plan.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-700"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{warningLabel(w)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 補足説明 */}
      <p className="mt-2 text-xs text-slate-400">
        目標体重欄を編集して Enter / フォーカスアウトで確定。複数月を手動設定すると各月が anchor として扱われ、間の月が自動配分されます。「解除」で自動に戻せます。設定画面上部の「保存」で確定します。
      </p>
    </div>
  );
}
