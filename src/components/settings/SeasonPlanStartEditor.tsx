"use client";

import { useMemo, useState } from "react";
import type { Season } from "@/lib/domain/season";
import { parseSeasonPlanStartInput } from "@/lib/schemas/seasonLifecycleSchema";
import { previewSeasonGoalChange } from "@/lib/utils/seasonMonthlyPlan";
import { MAX_BULK_MONTHLY_GAIN_KG, validateBulkMonthlyPlanLimit } from "@/lib/utils/bulkWeeklyPlanPace";

interface SeasonPlanStartEditorProps {
  season: Season;
  weightLogs: Array<{ log_date: string; weight: number | null }>;
  today: string;
  busy: boolean;
  onSave: (planStartDate: string) => Promise<void>;
  onCancel: () => void;
}

export function SeasonPlanStartEditor({ season, weightLogs, today, busy, onSave, onCancel }: SeasonPlanStartEditorProps) {
  const initialDate = season.monthlyPlanStartDate ?? season.startDate;
  const [planStartDate, setPlanStartDate] = useState(initialDate);
  const [confirming, setConfirming] = useState(false);
  const weight = weightLogs.find((log) => log.log_date === planStartDate)?.weight ?? null;
  const parsed = parseSeasonPlanStartInput({
    expectedActiveSeasonId: season.id,
    expectedActiveSeasonUpdatedAt: season.updatedAt,
    planStartDate,
  }, today);
  const validDate = parsed.ok && planStartDate >= season.startDate && planStartDate <= season.targetDate;
  const preview = useMemo(() => {
    if (!validDate || weight === null || season.targetWeight === null) return null;
    return previewSeasonGoalChange({
      phase: season.phase,
      startDate: season.startDate,
      startWeight: season.startWeight,
      planStartDate,
      planStartMonth: planStartDate.slice(0, 7),
      planStartWeight: weight,
      targetDate: season.targetDate,
      targetWeight: season.targetWeight,
      overrides: season.monthlyPlanOverrides,
    }, season.targetDate, season.targetWeight);
  }, [validDate, weight, season, planStartDate]);
  const violations = preview && weight !== null && season.targetWeight !== null
    ? validateBulkMonthlyPlanLimit({
        phase: season.phase,
        startDate: season.startDate,
        startWeight: season.startWeight,
        planStartDate,
        planStartMonth: planStartDate.slice(0, 7),
        planStartWeight: weight,
        targetDate: season.targetDate,
        targetWeight: season.targetWeight,
        overrides: preview.retainedOverrides,
      })
    : [];
  const canSave = planStartDate !== initialDate && preview !== null && violations.length === 0;

  return (
    <div className="mt-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        シーズン開始後の体重調整期間を除外し、選択日の記録体重からBulk評価を開始します。
      </p>
      {!confirming ? (
        <>
          <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              増量計画開始日
              <input aria-label="増量計画開始日" type="date" min={season.startDate} max={today < season.targetDate ? today : season.targetDate} value={planStartDate} onChange={(event) => setPlanStartDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
            </label>
            <div className="text-sm">
              <p className="text-xs text-slate-500 dark:text-slate-400">計画の基準体重（選択日の記録）</p>
              <p className="mt-2 font-semibold">{weight === null ? "記録なし" : `${weight.toFixed(1)} kg`}</p>
            </div>
          </div>
          {!validDate && <p className="mt-3 text-xs text-rose-600">シーズン開始日から今日・最終目標日までの範囲で選択してください。</p>}
          {weight === null && <p className="mt-3 text-xs text-rose-600">体重を記録した日を選択してください。</p>}
          {validDate && weight !== null && !preview && <p className="mt-3 text-xs text-rose-600">月別目標を再計算できません。シーズン設定を確認してください。</p>}
          {violations.length > 0 && <p className="mt-3 text-xs text-rose-600">月+{MAX_BULK_MONTHLY_GAIN_KG.toFixed(1)} kg（端数月は日数按分）の上限を超えています: {violations.map((item) => item.month).join("、")}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !canSave} onClick={() => setConfirming(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">変更内容を確認</button>
            <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl px-4 py-2 text-sm text-slate-500">キャンセル</button>
          </div>
        </>
      ) : preview && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
          <p>増量計画開始日: {planStartDate}・基準体重: {weight?.toFixed(1)} kg</p>
          {planStartDate > season.startDate && <p className="mt-2 text-xs text-slate-500">{season.startDate}から{planStartDate}の前日までを体重調整期間としてBulk評価から除外します。</p>}
          <p className="mt-4 font-semibold">再計算後の月別目標</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {preview.entries.map((entry) => <li key={entry.month}>{entry.month}: {entry.targetWeight.toFixed(1)} kg（{entry.source === "manual" ? "手動" : "自動"}）</li>)}
          </ul>
          {preview.removedOverrides.length > 0 && <p className="mt-3 text-amber-700 dark:text-amber-300">保存時に解除される手動設定: {preview.removedOverrides.map((item) => item.month).join("、")}</p>}
          <p className="mt-2 text-xs text-slate-500">範囲内に残る手動設定は保持されます。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !canSave} onClick={() => void onSave(planStartDate)} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-40">{busy ? "保存中..." : "開始日変更を確定"}</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-xl px-4 py-2 text-slate-500">戻る</button>
          </div>
        </div>
      )}
    </div>
  );
}
