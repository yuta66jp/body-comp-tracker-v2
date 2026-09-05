"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSeasonPlanOverrides } from "@/app/settings/seasonActions";
import type { SeasonLifecycleResult } from "@/app/settings/seasonActions";
import { MonthlyGoalPlanSection } from "@/components/settings/MonthlyGoalPlanSection";
import type { Season } from "@/lib/domain/season";
import type { MonthlyGoalOverride } from "@/lib/utils/monthlyGoalPlan";
import {
  MAX_BULK_MONTHLY_GAIN_KG,
  validateBulkMonthlyPlanLimit,
} from "@/lib/utils/bulkWeeklyPlanPace";

interface SeasonMonthlyGoalPlanSectionProps {
  initialSeason: Season | null;
  onEditingChange?: (editing: boolean) => void;
  today: string;
  readError?: boolean;
}

function overrideSignature(overrides: MonthlyGoalOverride[]): string {
  return JSON.stringify(
    [...overrides].sort((a, b) => a.month.localeCompare(b.month))
  );
}

export function SeasonMonthlyGoalPlanSection({
  initialSeason,
  onEditingChange,
  today,
  readError = false,
}: SeasonMonthlyGoalPlanSectionProps) {
  const router = useRouter();
  const initialOverrides = initialSeason?.monthlyPlanOverrides ?? [];
  const initialSignature = overrideSignature(initialOverrides);
  const [draft, setDraft] = useState(() => ({
    baseSignature: initialSignature,
    overrides: initialOverrides,
  }));
  const [busy, setBusy] = useState(false);
  const initialPlanStartDate = initialSeason?.monthlyPlanStartDate ?? initialSeason?.startDate ?? "";
  const [resetConfirming, setResetConfirming] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const overrides = draft.baseSignature === initialSignature
    ? draft.overrides
    : initialOverrides;
  const dirty = overrideSignature(overrides) !== initialSignature;
  useEffect(() => {
    onEditingChange?.(dirty || busy || resetConfirming);
  }, [dirty, busy, resetConfirming, onEditingChange]);
  const bulkLimitViolations = useMemo(() => {
    if (
      initialSeason?.phase !== "Bulk" ||
      initialSeason.targetWeight === null ||
      initialSeason.monthlyPlanStartMonth === null ||
      initialSeason.monthlyPlanStartWeight === null
    ) {
      return [];
    }
    return validateBulkMonthlyPlanLimit({
      phase: initialSeason.phase,
      startDate: initialSeason.startDate,
      startWeight: initialSeason.startWeight,
      planStartDate: initialSeason.monthlyPlanStartDate ?? initialSeason.startDate,
      targetDate: initialSeason.targetDate,
      targetWeight: initialSeason.targetWeight,
      planStartMonth: initialSeason.monthlyPlanStartMonth,
      planStartWeight: initialSeason.monthlyPlanStartWeight,
      overrides,
    });
  }, [initialSeason, overrides]);

  async function save(nextOverrides: MonthlyGoalOverride[], resetAll: boolean) {
    if (!initialSeason) return;
    setBusy(true);
    setMessage(null);
    let result: SeasonLifecycleResult;
    try {
      result = await saveSeasonPlanOverrides({
        expectedActiveSeasonId: initialSeason.id,
        expectedActiveSeasonUpdatedAt: initialSeason.updatedAt,
        overrides: nextOverrides,
        resetAll,
      });
    } catch {
      setMessage({ kind: "error", text: "保存に失敗しました。入力内容を確認し、再試行してください。" });
      return;
    } finally {
      setBusy(false);
    }
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      setResetConfirming(false);
      return;
    }
    setDraft({ baseSignature: initialSignature, overrides: nextOverrides });
    setResetConfirming(false);
    setMessage({
      kind: "success",
      text: resetAll ? "すべての手動設定を解除しました" : "月次計画を保存しました",
    });
    router.refresh();
  }

  return (
    <section aria-label="月別目標" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">月別目標</h2>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          シーズン設定をもとに、各月の目標体重を自動配分します。途中月は調整できます。
        </p>
      </div>

      <fieldset disabled={busy} className="min-w-0">
      {readError ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          シーズン情報を取得できません。再読み込みしてください。
        </p>
      ) : !initialSeason ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          月次計画を作成するには、先にシーズンを開始してください。
        </p>
      ) : initialSeason.targetWeight === null ||
        initialSeason.monthlyPlanStartMonth === null ||
        initialSeason.monthlyPlanStartWeight === null ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          月次計画の開始情報がありません。シーズン情報を確認してください。
        </p>
      ) : (
        <>
          <div className="mt-5">
            <MonthlyGoalPlanSection
              goalWeight={initialSeason.targetWeight}
              contestDate={initialSeason.targetDate}
              phase={initialSeason.phase}
              currentWeight={initialSeason.monthlyPlanStartWeight}
              today={today}
              planStartMonth={initialSeason.monthlyPlanStartMonth}
              planStartDate={initialPlanStartDate}
              planStartWeight={initialSeason.monthlyPlanStartWeight}
              overrides={overrides}
              onOverridesChange={(next) => {
                setDraft({ baseSignature: initialSignature, overrides: next });
                setMessage(null);
              }}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => {
                setDraft({ baseSignature: initialSignature, overrides: initialOverrides });
                setMessage(null);
              }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              未保存の変更を元に戻す
            </button>
            <button
              type="button"
              disabled={!dirty || busy || bulkLimitViolations.length > 0}
              onClick={() => void save(overrides, false)}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "保存中..." : "変更を保存"}
            </button>
            <button
              type="button"
              disabled={overrides.length === 0 || busy}
              onClick={() => setResetConfirming(true)}
              className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 disabled:opacity-40 dark:border-rose-800 dark:text-rose-300"
            >
              すべて自動に戻す
            </button>
          </div>

          {bulkLimitViolations.length > 0 && (
            <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">
              月+{MAX_BULK_MONTHLY_GAIN_KG.toFixed(1)} kg（端数月は日数按分）の上限を超えるため、変更を保存できません。
            </p>
          )}

          {resetConfirming && (
            <div className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
              <p>このシーズンの手動設定 {overrides.length} 件をすべて解除します。</p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy} onClick={() => void save([], true)} className="rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white disabled:opacity-50">リセットを確定</button>
                <button type="button" disabled={busy} onClick={() => setResetConfirming(false)} className="rounded-xl px-4 py-2 text-slate-500">キャンセル</button>
              </div>
            </div>
          )}
        </>
      )}

      </fieldset>

      {message && (
        <p role="status" className={`mt-4 text-sm ${message.kind === "error" ? "text-rose-600" : "text-emerald-600"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
