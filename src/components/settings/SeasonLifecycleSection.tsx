"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  endSeason,
  startOrSwitchSeason,
  updateSeasonGoal,
} from "@/app/settings/seasonActions";
import type { SeasonLifecycleResult } from "@/app/settings/seasonActions";
import type { Season, SeasonPhase } from "@/lib/domain/season";
import {
  parseSeasonEndInput,
  parseSeasonGoalInput,
  parseSeasonStartInput,
} from "@/lib/schemas/seasonLifecycleSchema";
import { addDaysStr } from "@/lib/utils/date";
import { previewSeasonGoalChange } from "@/lib/utils/seasonMonthlyPlan";
import {
  MAX_BULK_MONTHLY_GAIN_KG,
  validateBulkMonthlyPlanLimit,
} from "@/lib/utils/bulkWeeklyPlanPace";

interface WeightLog {
  log_date: string;
  weight: number | null;
}

interface SeasonLifecycleSectionProps {
  initialSeason: Season | null;
  weightLogs: WeightLog[];
  today: string;
  readError?: boolean;
}

type Mode = "start" | "switch" | "end" | "goal" | null;
type FieldErrors = Record<string, string>;

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-900/40";

function latestWeightOnOrBefore(logs: WeightLog[], date: string): number | null {
  return [...logs]
    .filter((log) => log.log_date <= date && log.weight !== null)
    .sort((a, b) => b.log_date.localeCompare(a.log_date))[0]?.weight ?? null;
}

function formatWeight(weight: number | null): string {
  return weight === null ? "記録なし" : `${weight.toFixed(1)} kg`;
}

function errorsToMap(result: SeasonLifecycleResult): FieldErrors {
  if (result.ok || !result.fieldErrors) return {};
  return Object.fromEntries(result.fieldErrors.map((error) => [error.field, error.message]));
}

function bulkLimitMessage(months: string[]): string {
  return `月+${MAX_BULK_MONTHLY_GAIN_KG.toFixed(1)} kg（端数月は日数按分）の上限を超えています: ${months.join("、")}`;
}

export function SeasonLifecycleSection({
  initialSeason,
  weightLogs,
  today,
  readError = false,
}: SeasonLifecycleSectionProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const defaultPhase: SeasonPhase = initialSeason?.phase === "Cut" ? "Bulk" : "Cut";
  const [startInput, setStartInput] = useState({
    expectedActiveSeasonId: initialSeason?.id ?? null,
    expectedActiveSeasonUpdatedAt: initialSeason?.updatedAt ?? null,
    name: "",
    phase: defaultPhase as string,
    startDate: today,
    targetDate: "",
    targetWeight: "",
  });
  const [endDate, setEndDate] = useState(today);
  const [goalInput, setGoalInput] = useState({
    expectedActiveSeasonId: initialSeason?.id ?? 0,
    expectedActiveSeasonUpdatedAt: initialSeason?.updatedAt ?? "",
    targetDate: initialSeason?.targetDate ?? "",
    targetWeight: initialSeason?.targetWeight?.toString() ?? "",
  });

  const startWeight = useMemo(
    () => latestWeightOnOrBefore(weightLogs, startInput.startDate),
    [weightLogs, startInput.startDate]
  );
  const switchEndDate = initialSeason ? addDaysStr(startInput.startDate, -1) : null;
  const endWeight = useMemo(
    () => latestWeightOnOrBefore(weightLogs, endDate),
    [weightLogs, endDate]
  );
  const deadlineEnded = initialSeason !== null && initialSeason.targetDate < today;
  const heading = initialSeason?.phase === "Bulk" ? "シーズン・目標" : "シーズン・コンテスト";
  const goalPreview = useMemo(() => {
    if (
      !initialSeason ||
      initialSeason.targetWeight === null ||
      initialSeason.monthlyPlanStartMonth === null ||
      initialSeason.monthlyPlanStartWeight === null
    ) {
      return null;
    }
    const targetWeight = Number(goalInput.targetWeight);
    if (!Number.isFinite(targetWeight)) return null;
    return previewSeasonGoalChange(
      {
        phase: initialSeason.phase,
        startDate: initialSeason.startDate,
        startWeight: initialSeason.startWeight,
        targetDate: initialSeason.targetDate,
        targetWeight: initialSeason.targetWeight,
        planStartMonth: initialSeason.monthlyPlanStartMonth,
        planStartWeight: initialSeason.monthlyPlanStartWeight,
        overrides: initialSeason.monthlyPlanOverrides,
      },
      goalInput.targetDate,
      targetWeight
    );
  }, [goalInput.targetDate, goalInput.targetWeight, initialSeason]);
  const startBulkViolations = useMemo(() => {
    const targetWeight = Number(startInput.targetWeight);
    if (
      startInput.phase !== "Bulk" ||
      startWeight === null ||
      !startInput.targetDate ||
      !Number.isFinite(targetWeight)
    ) {
      return [];
    }
    return validateBulkMonthlyPlanLimit({
      phase: startInput.phase,
      startDate: startInput.startDate,
      startWeight,
      targetDate: startInput.targetDate,
      targetWeight,
    });
  }, [startInput, startWeight]);
  const goalBulkViolations = useMemo(() => {
    const targetWeight = Number(goalInput.targetWeight);
    if (
      initialSeason?.phase !== "Bulk" ||
      goalPreview === null ||
      !Number.isFinite(targetWeight)
    ) {
      return [];
    }
    return validateBulkMonthlyPlanLimit({
      phase: initialSeason.phase,
      startDate: initialSeason.startDate,
      startWeight: initialSeason.startWeight,
      targetDate: goalInput.targetDate,
      targetWeight,
      planStartMonth: initialSeason.monthlyPlanStartMonth,
      planStartWeight: initialSeason.monthlyPlanStartWeight,
      overrides: goalPreview.retainedOverrides,
    });
  }, [goalInput.targetDate, goalInput.targetWeight, goalPreview, initialSeason]);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setConfirming(false);
    setMessage(null);
    setFieldErrors({});
    if (nextMode === "switch" || nextMode === "start") {
      setStartInput({
        expectedActiveSeasonId: initialSeason?.id ?? null,
        expectedActiveSeasonUpdatedAt: initialSeason?.updatedAt ?? null,
        name: "",
        phase: initialSeason?.phase === "Cut" ? "Bulk" : "Cut",
        startDate: today,
        targetDate: "",
        targetWeight: "",
      });
    }
    if (nextMode === "end") setEndDate(today);
    if (nextMode === "goal" && initialSeason) {
      setGoalInput({
        expectedActiveSeasonId: initialSeason.id,
        expectedActiveSeasonUpdatedAt: initialSeason.updatedAt,
        targetDate: initialSeason.targetDate,
        targetWeight: initialSeason.targetWeight?.toString() ?? "",
      });
    }
  }

  async function completeAction(action: () => Promise<SeasonLifecycleResult>, success: string) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setFieldErrors(errorsToMap(result));
      setMessage({ kind: "error", text: result.error });
      setConfirming(false);
      return;
    }
    setMode(null);
    setConfirming(false);
    setMessage({ kind: "success", text: success });
    router.refresh();
  }

  function confirmStart() {
    const parsed = parseSeasonStartInput(startInput, today);
    if (!parsed.ok) {
      setFieldErrors(Object.fromEntries(parsed.errors.map((error) => [error.field, error.message])));
      return;
    }
    if (initialSeason && startInput.startDate <= initialSeason.startDate) {
      setFieldErrors({ startDate: "現在のシーズン開始日より後にしてください" });
      return;
    }
    if (startWeight === null) {
      setMessage({ kind: "error", text: "開始日時点の体重記録がありません。先に体重を記録してください。" });
      return;
    }
    if (startBulkViolations.length > 0) {
      setFieldErrors({
        targetWeight: bulkLimitMessage(startBulkViolations.map((violation) => violation.month)),
      });
      return;
    }
    setFieldErrors({});
    setMessage(null);
    setConfirming(true);
  }

  function confirmEnd() {
    const parsed = parseSeasonEndInput(
      {
        expectedActiveSeasonId: initialSeason?.id ?? 0,
        expectedActiveSeasonUpdatedAt: initialSeason?.updatedAt ?? "",
        endDate,
      },
      today
    );
    if (!parsed.ok) {
      setFieldErrors(Object.fromEntries(parsed.errors.map((error) => [error.field, error.message])));
      return;
    }
    if (initialSeason && endDate < initialSeason.startDate) {
      setFieldErrors({ endDate: "シーズン開始日以降にしてください" });
      return;
    }
    setFieldErrors({});
    setConfirming(true);
  }

  function confirmGoal() {
    const parsed = parseSeasonGoalInput(goalInput);
    if (!parsed.ok) {
      setFieldErrors(Object.fromEntries(parsed.errors.map((error) => [error.field, error.message])));
      return;
    }
    if (initialSeason && goalInput.targetDate < initialSeason.startDate) {
      setFieldErrors({ targetDate: "シーズン開始日以降にしてください" });
      return;
    }
    if (goalPreview === null) {
      setMessage({ kind: "error", text: "月次計画を再計算できません。画面を再読み込みしてください。" });
      return;
    }
    if (goalBulkViolations.length > 0) {
      setFieldErrors({
        targetWeight: bulkLimitMessage(goalBulkViolations.map((violation) => violation.month)),
      });
      return;
    }
    setFieldErrors({});
    setMessage(null);
    setConfirming(true);
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{heading}</h2>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            BulkとCutを独立したシーズンとして管理します
          </p>
        </div>
        {initialSeason && !readError && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            進行中
          </span>
        )}
      </div>

      {readError ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          シーズン情報を取得できません。再読み込みしてから操作してください。
        </p>
      ) : initialSeason ? (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div><dt className="text-xs text-slate-400">シーズン名</dt><dd className="mt-1 font-semibold">{initialSeason.name}</dd></div>
            <div><dt className="text-xs text-slate-400">フェーズ</dt><dd className="mt-1 font-semibold">{initialSeason.phase}</dd></div>
            <div><dt className="text-xs text-slate-400">開始日</dt><dd className="mt-1 font-semibold">{initialSeason.startDate}</dd></div>
            <div><dt className="text-xs text-slate-400">開始体重</dt><dd className="mt-1 font-semibold">{formatWeight(initialSeason.startWeight)}</dd></div>
            <div><dt className="text-xs text-slate-400">目標日</dt><dd className="mt-1 font-semibold">{initialSeason.targetDate}</dd></div>
            <div><dt className="text-xs text-slate-400">目標体重</dt><dd className="mt-1 font-semibold">{formatWeight(initialSeason.targetWeight)}</dd></div>
          </dl>

          {deadlineEnded && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300">
              目標日を過ぎています。自動終了はしません。次のシーズン開始、終了、または目標変更を選択してください。
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => changeMode("switch")} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              次のシーズンを開始
            </button>
            <button type="button" onClick={() => changeMode("goal")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
              目標を変更
            </button>
            <button type="button" onClick={() => changeMode("end")} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20">
              シーズンを終了
            </button>
          </div>
        </>
      ) : (
        <div className="mt-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">進行中のシーズンはありません。</p>
          <button type="button" onClick={() => changeMode("start")} className="mt-3 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            シーズンを開始
          </button>
        </div>
      )}

      {(mode === "start" || mode === "switch") && (
        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-700">
          <h3 className="text-sm font-semibold">{mode === "switch" ? "次のシーズン" : "新しいシーズン"}</h3>
          {!confirming ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <LifecycleField label="シーズン名" error={fieldErrors.name}>
                <input aria-label="新しいシーズン名" className={inputClass} value={startInput.name} onChange={(event) => setStartInput({ ...startInput, name: event.target.value })} />
              </LifecycleField>
              <LifecycleField label="フェーズ" error={fieldErrors.phase}>
                <select aria-label="新しいフェーズ" className={inputClass} value={startInput.phase} onChange={(event) => setStartInput({ ...startInput, phase: event.target.value })}>
                  <option value="Cut">Cut</option><option value="Bulk">Bulk</option>
                </select>
              </LifecycleField>
              <LifecycleField label="開始日" error={fieldErrors.startDate}>
                <input aria-label="新しい開始日" type="date" max={today} className={inputClass} value={startInput.startDate} onChange={(event) => { setStartInput({ ...startInput, startDate: event.target.value }); setConfirming(false); }} />
              </LifecycleField>
              <LifecycleField label="目標日" error={fieldErrors.targetDate}>
                <input aria-label="新しい目標日" type="date" className={inputClass} value={startInput.targetDate} onChange={(event) => setStartInput({ ...startInput, targetDate: event.target.value })} />
              </LifecycleField>
              <LifecycleField label="目標体重 (kg)" error={fieldErrors.targetWeight}>
                <input aria-label="新しい目標体重" type="number" min="20" max="200" step="0.1" className={inputClass} value={startInput.targetWeight} onChange={(event) => setStartInput({ ...startInput, targetWeight: event.target.value })} />
              </LifecycleField>
              <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-5">開始体重: <strong>{formatWeight(startWeight)}</strong>（開始日時点の最新記録）</p>
              {startBulkViolations.length > 0 && (
                <p className="text-xs text-rose-600 sm:col-span-2 lg:col-span-5">
                  {bulkLimitMessage(startBulkViolations.map((violation) => violation.month))}
                </p>
              )}
              <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
                <button type="button" onClick={confirmStart} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">内容を確認</button>
                <button type="button" onClick={() => changeMode(null)} className="rounded-xl px-4 py-2 text-sm text-slate-500">キャンセル</button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
              <p className="font-semibold">保存前の確認</p>
              <ul className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                <li>{startInput.name} / {startInput.phase}</li>
                <li>開始日 {startInput.startDate}・開始体重 {formatWeight(startWeight)}</li>
                <li>目標日 {startInput.targetDate}・目標体重 {startInput.targetWeight} kg</li>
                {initialSeason && <li>現在のシーズンは {switchEndDate} で終了します</li>}
              </ul>
              <div className="mt-4 flex gap-2">
                <button type="button" disabled={busy} onClick={() => void completeAction(() => startOrSwitchSeason(startInput), initialSeason ? "次のシーズンを開始しました" : "シーズンを開始しました")} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? "保存中..." : initialSeason ? "切り替えを確定" : "開始を確定"}
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-xl px-4 py-2 text-sm text-slate-500">戻る</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "end" && initialSeason && (
        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-700">
          <h3 className="text-sm font-semibold">シーズンを終了</h3>
          {!confirming ? (
            <div className="mt-4 max-w-sm">
              <LifecycleField label="終了日" error={fieldErrors.endDate}>
                <input aria-label="終了日" type="date" min={initialSeason.startDate} max={today} className={inputClass} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </LifecycleField>
              <p className="mt-2 text-xs text-slate-500">終了時体重: <strong>{formatWeight(endWeight)}</strong></p>
              {endWeight === null && <p className="mt-2 text-xs text-amber-600">終了日以前の体重がないため、終了時体重は未記録になります。</p>}
              <div className="mt-4 flex gap-2"><button type="button" onClick={confirmEnd} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white">終了内容を確認</button><button type="button" onClick={() => changeMode(null)} className="rounded-xl px-4 py-2 text-sm text-slate-500">キャンセル</button></div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-rose-50 p-4 text-sm dark:bg-rose-900/20">
              <p>{initialSeason.name}を{endDate}で終了します。終了時体重は{formatWeight(endWeight)}です。</p>
              <div className="mt-4 flex gap-2"><button type="button" disabled={busy} onClick={() => void completeAction(() => endSeason({ expectedActiveSeasonId: initialSeason.id, expectedActiveSeasonUpdatedAt: initialSeason.updatedAt, endDate }), "シーズンを終了しました")} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "保存中..." : "終了を確定"}</button><button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-xl px-4 py-2 text-sm text-slate-500">戻る</button></div>
            </div>
          )}
        </div>
      )}

      {mode === "goal" && initialSeason && (
        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-700">
          <h3 className="text-sm font-semibold">目標を変更</h3>
          {!confirming ? (
            <>
              <div className="mt-4 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
                <LifecycleField label="目標日" error={fieldErrors.targetDate}><input aria-label="変更後の目標日" type="date" min={initialSeason.startDate} className={inputClass} value={goalInput.targetDate} onChange={(event) => setGoalInput({ ...goalInput, targetDate: event.target.value })} /></LifecycleField>
                <LifecycleField label="目標体重 (kg)" error={fieldErrors.targetWeight}><input aria-label="変更後の目標体重" type="number" min="20" max="200" step="0.1" className={inputClass} value={goalInput.targetWeight} onChange={(event) => setGoalInput({ ...goalInput, targetWeight: event.target.value })} /></LifecycleField>
              </div>
              {goalBulkViolations.length > 0 && (
                <p className="mt-3 text-xs text-rose-600">
                  {bulkLimitMessage(goalBulkViolations.map((violation) => violation.month))}
                </p>
              )}
              <div className="mt-4 flex gap-2"><button type="button" disabled={busy} onClick={confirmGoal} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">変更内容を確認</button><button type="button" onClick={() => changeMode(null)} className="rounded-xl px-4 py-2 text-sm text-slate-500">キャンセル</button></div>
            </>
          ) : (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
              <p className="font-semibold">再計算後の月次計画</p>
              {goalPreview ? (
                <>
                  <ul className="mt-2 grid gap-1 text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                    {goalPreview.entries.map((entry) => (
                      <li key={entry.month}>{entry.month}: {entry.targetWeight.toFixed(1)} kg（{entry.source === "manual" ? "手動" : "自動"}）</li>
                    ))}
                  </ul>
                  {goalPreview.removedOverrides.length > 0 && (
                    <p className="mt-3 text-amber-700 dark:text-amber-300">
                      保存時に解除される手動設定: {goalPreview.removedOverrides.map((override) => override.month).join("、")}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">範囲内に残る手動設定は保持されます。</p>
                </>
              ) : (
                <p className="mt-2 text-rose-600">月次計画を再計算できません。入力内容を確認してください。</p>
              )}
              <div className="mt-4 flex gap-2"><button type="button" disabled={busy || goalPreview === null} onClick={() => void completeAction(() => updateSeasonGoal(goalInput), "目標を更新しました")} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "保存中..." : "目標変更を確定"}</button><button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-xl px-4 py-2 text-sm text-slate-500">戻る</button></div>
            </div>
          )}
        </div>
      )}

      {message && <p role="status" className={`mt-4 text-sm ${message.kind === "error" ? "text-rose-600" : "text-emerald-600"}`}>{message.text}</p>}
    </section>
  );
}

function LifecycleField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
      <span className="mb-1.5 block">{label}</span>
      {children}
      {error && <span className="mt-1 block font-normal text-rose-500">{error}</span>}
    </label>
  );
}
