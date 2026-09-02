"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveSeasonPlanOverrides,
  updateSeasonPlanStart,
} from "@/app/settings/seasonActions";
import { MonthlyGoalPlanSection } from "@/components/settings/MonthlyGoalPlanSection";
import type { Season } from "@/lib/domain/season";
import type { MonthlyGoalOverride } from "@/lib/utils/monthlyGoalPlan";
import {
  MAX_BULK_MONTHLY_GAIN_KG,
  validateBulkMonthlyPlanLimit,
} from "@/lib/utils/bulkWeeklyPlanPace";

interface SeasonMonthlyGoalPlanSectionProps {
  initialSeason: Season | null;
  weightLogs?: Array<{ log_date: string; weight: number | null }>;
  today: string;
  readError?: boolean;
}

function formatWeight(weight: number): string {
  return `${weight.toFixed(1)} kg`;
}

function overrideSignature(overrides: MonthlyGoalOverride[]): string {
  return JSON.stringify(
    [...overrides].sort((a, b) => a.month.localeCompare(b.month))
  );
}

export function SeasonMonthlyGoalPlanSection({
  initialSeason,
  weightLogs = [],
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
  const [planStartDate, setPlanStartDate] = useState(initialPlanStartDate);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const overrides = draft.baseSignature === initialSignature
    ? draft.overrides
    : initialOverrides;
  const dirty = overrideSignature(overrides) !== initialSignature;
  const selectedPlanStartWeight = useMemo(
    () => weightLogs.find((log) => log.log_date === planStartDate)?.weight ?? null,
    [planStartDate, weightLogs]
  );
  const planStartDirty = planStartDate !== initialPlanStartDate;
  const planStartLimitViolations = useMemo(() => {
    if (
      initialSeason?.phase !== "Bulk" ||
      initialSeason.targetWeight === null ||
      selectedPlanStartWeight === null ||
      !planStartDate
    ) {
      return [];
    }
    return validateBulkMonthlyPlanLimit({
      phase: initialSeason.phase,
      startDate: initialSeason.startDate,
      startWeight: initialSeason.startWeight,
      planStartDate,
      targetDate: initialSeason.targetDate,
      targetWeight: initialSeason.targetWeight,
      planStartMonth: planStartDate.slice(0, 7),
      planStartWeight: selectedPlanStartWeight,
      overrides,
    });
  }, [initialSeason, overrides, planStartDate, selectedPlanStartWeight]);
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

  async function savePlanStart() {
    if (!initialSeason || initialSeason.phase !== "Bulk") return;
    setBusy(true);
    setMessage(null);
    const result = await updateSeasonPlanStart({
      expectedActiveSeasonId: initialSeason.id,
      expectedActiveSeasonUpdatedAt: initialSeason.updatedAt,
      planStartDate,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setMessage({ kind: "success", text: "増量計画開始日を更新しました" });
    router.refresh();
  }

  async function save(nextOverrides: MonthlyGoalOverride[], resetAll: boolean) {
    if (!initialSeason) return;
    setBusy(true);
    setMessage(null);
    const result = await saveSeasonPlanOverrides({
      expectedActiveSeasonId: initialSeason.id,
      expectedActiveSeasonUpdatedAt: initialSeason.updatedAt,
      overrides: nextOverrides,
      resetAll,
    });
    setBusy(false);
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
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">月次目標計画</h2>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          進行中シーズンの月末目標体重を管理します
        </p>
      </div>

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
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4 lg:grid-cols-7">
            <div><dt className="text-xs text-slate-400">シーズン</dt><dd className="mt-1 font-semibold">{initialSeason.name}</dd></div>
            <div><dt className="text-xs text-slate-400">フェーズ</dt><dd className="mt-1 font-semibold">{initialSeason.phase}</dd></div>
            <div><dt className="text-xs text-slate-400">計画開始日</dt><dd className="mt-1 font-semibold">{initialPlanStartDate}</dd></div>
            <div><dt className="text-xs text-slate-400">開始月</dt><dd className="mt-1 font-semibold">{initialSeason.monthlyPlanStartMonth}</dd></div>
            <div><dt className="text-xs text-slate-400">開始体重</dt><dd className="mt-1 font-semibold">{formatWeight(initialSeason.monthlyPlanStartWeight)}</dd></div>
            <div><dt className="text-xs text-slate-400">目標日</dt><dd className="mt-1 font-semibold">{initialSeason.targetDate}</dd></div>
            <div><dt className="text-xs text-slate-400">目標体重</dt><dd className="mt-1 font-semibold">{formatWeight(initialSeason.targetWeight)}</dd></div>
          </dl>

          {initialSeason.phase === "Bulk" && (
            <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">増量計画の開始</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                シーズン開始後の体重調整期間を除外し、選択日の記録体重からBulk評価を開始します。
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="mb-1 block text-xs text-slate-400">増量計画開始日</span>
                  <input
                    aria-label="増量計画開始日"
                    type="date"
                    min={initialSeason.startDate}
                    max={today < initialSeason.targetDate ? today : initialSeason.targetDate}
                    value={planStartDate}
                    onChange={(event) => {
                      setPlanStartDate(event.target.value);
                      setMessage(null);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
                <div className="min-w-36 text-sm">
                  <span className="block text-xs text-slate-400">開始日の記録体重</span>
                  <strong className={selectedPlanStartWeight === null ? "text-rose-600" : "text-slate-700 dark:text-slate-200"}>
                    {selectedPlanStartWeight === null ? "記録なし" : formatWeight(selectedPlanStartWeight)}
                  </strong>
                </div>
                <button
                  type="button"
                  disabled={!planStartDirty || selectedPlanStartWeight === null || dirty || busy || planStartLimitViolations.length > 0}
                  onClick={() => void savePlanStart()}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy ? "保存中..." : "開始日を保存"}
                </button>
              </div>
              {selectedPlanStartWeight === null && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">体重を記録した日を選択してください。</p>
              )}
              {dirty && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">先に月次目標の手動設定を保存または元に戻してください。</p>
              )}
              {planStartLimitViolations.length > 0 && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">
                  この開始日では月+{MAX_BULK_MONTHLY_GAIN_KG.toFixed(1)} kg（端数月は日数按分）の上限を超える月があります。
                </p>
              )}
              {initialPlanStartDate > initialSeason.startDate && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {initialSeason.startDate}〜{initialPlanStartDate}の前日までは体重調整期間としてBulk評価から除外されます。
                </p>
              )}
            </div>
          )}

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
              disabled={!dirty || busy || bulkLimitViolations.length > 0}
              onClick={() => void save(overrides, false)}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "保存中..." : "手動設定を保存"}
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
              月+{MAX_BULK_MONTHLY_GAIN_KG.toFixed(1)} kg（端数月は日数按分）の上限を超えるため、手動設定を保存できません。
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

      {message && (
        <p role="status" className={`mt-4 text-sm ${message.kind === "error" ? "text-rose-600" : "text-emerald-600"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
