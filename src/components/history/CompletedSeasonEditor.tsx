"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCompletedSeason } from "@/app/history/actions";
import type { Season, SeasonPhase } from "@/lib/domain/season";
import type { SeasonHistoryDailyLog } from "@/lib/queries/dailyLogs";

interface CompletedSeasonEditorProps {
  season: Season;
  dailyLogs: SeasonHistoryDailyLog[];
  nextSeasonStartDate: string | null;
  today: string;
}

function formatWeight(value: number | null): string {
  return value === null ? "未記録" : `${value.toFixed(1)} kg`;
}

function previousDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function CompletedSeasonEditor({
  season,
  dailyLogs,
  nextSeasonStartDate,
  today,
}: CompletedSeasonEditorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [name, setName] = useState(season.name);
  const [phase, setPhase] = useState<SeasonPhase>(season.phase);
  const [endDate, setEndDate] = useState(season.endDate ?? season.startDate);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const maxEndDate = nextSeasonStartDate === null
    ? today
    : [today, previousDate(nextSeasonStartDate)].sort()[0]!;
  const trimmedName = name.trim();
  const validationMessage = trimmedName.length === 0 || trimmedName.length > 100
    ? "シーズン名は1〜100文字で入力してください。"
    : endDate < season.startDate || endDate > maxEndDate
      ? `終了日は ${season.startDate} 〜 ${maxEndDate} の範囲で入力してください。`
      : null;
  const hasChanges =
    trimmedName !== season.name || phase !== season.phase || endDate !== season.endDate;

  const preview = useMemo(() => {
    const oldEndDate = season.endDate ?? season.startDate;
    const removedCount = dailyLogs.filter(
      (log) => log.season_id === season.id && log.log_date > endDate
    ).length;
    const addedCount = dailyLogs.filter(
      (log) =>
        log.season_id === null &&
        log.log_date > oldEndDate &&
        log.log_date <= endDate
    ).length;
    const newEndWeight = [...dailyLogs]
      .reverse()
      .find((log) => log.log_date <= endDate && log.weight !== null)?.weight ?? null;
    const changedActualMonths = (season.monthlyPlanSnapshot ?? []).filter((entry) => {
      const actualWeight = [...dailyLogs]
        .reverse()
        .find(
          (log) =>
            log.weight !== null &&
            log.log_date >= season.startDate &&
            log.log_date <= endDate &&
            log.log_date.slice(0, 7) === entry.month
        )?.weight ?? null;
      return actualWeight !== entry.actualWeight;
    }).length;

    return { removedCount, addedCount, newEndWeight, changedActualMonths };
  }, [dailyLogs, endDate, season]);

  function closeEditor() {
    setIsOpen(false);
    setIsConfirming(false);
    setName(season.name);
    setPhase(season.phase);
    setEndDate(season.endDate ?? season.startDate);
    setMessage(null);
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateCompletedSeason({
        expectedCompletedSeasonId: season.id,
        expectedCompletedSeasonUpdatedAt: season.updatedAt,
        name,
        phase,
        endDate,
      });
      if (!result.ok) {
        setMessage(result.error);
        if (result.reason === "conflict") setIsConfirming(false);
        return;
      }
      setMessage("シーズン情報を更新しました。");
      setIsConfirming(false);
      setIsOpen(false);
      router.refresh();
    });
  }

  if (!isOpen) {
    return (
      <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-700">
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setMessage(null);
          }}
          className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/30"
        >
          シーズン情報を編集
        </button>
        {message && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400" role="status">{message}</p>}
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 px-5 py-5 dark:border-slate-700">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">シーズン情報を編集</h3>
      {!isConfirming ? (
        <div className="mt-4 space-y-4">
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            <span className="mb-1 block text-xs font-semibold text-slate-500">シーズン名</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            <span className="mb-1 block text-xs font-semibold text-slate-500">フェーズ</span>
            <select
              value={phase}
              onChange={(event) => setPhase(event.target.value as SeasonPhase)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="Cut">Cut</option>
              <option value="Bulk">Bulk</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              <span className="mb-1 block text-xs font-semibold text-slate-500">開始日（変更不可）</span>
              <input
                value={season.startDate}
                disabled
                className="w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-400 dark:border-slate-800 dark:bg-slate-800"
              />
            </label>
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              <span className="mb-1 block text-xs font-semibold text-slate-500">終了日</span>
              <input
                type="date"
                value={endDate}
                min={season.startDate}
                max={maxEndDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            変更後の終了時体重: <strong className="text-slate-700 dark:text-slate-200">{formatWeight(preview.newEndWeight)}</strong>
          </div>
          {validationMessage && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{validationMessage}</p>}
          {message && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{message}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              disabled={validationMessage !== null || !hasChanges}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              変更内容を確認
            </button>
            <button type="button" onClick={closeEditor} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">キャンセル</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-3 rounded-xl border border-slate-100 p-4 text-sm dark:border-slate-700 sm:grid-cols-3">
            <div><dt className="text-xs text-slate-400">シーズン名</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{season.name} → {trimmedName}</dd></div>
            <div><dt className="text-xs text-slate-400">フェーズ</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{season.phase} → {phase}</dd></div>
            <div><dt className="text-xs text-slate-400">終了日</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{season.endDate} → {endDate}</dd></div>
            <div><dt className="text-xs text-slate-400">所属になる日次ログ</dt><dd className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{preview.addedCount} 件</dd></div>
            <div><dt className="text-xs text-slate-400">未所属になる日次ログ</dt><dd className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{preview.removedCount} 件</dd></div>
            <div><dt className="text-xs text-slate-400">終了時体重</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{formatWeight(season.endWeight)} → {formatWeight(preview.newEndWeight)}</dd></div>
          </dl>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300">
            月次計画の目標値・前月比・設定元は維持し、実績を再計算します（変更対象 {preview.changedActualMonths} か月）。
            {phase !== season.phase && " フェーズ変更により、比較グループと目標達成判定も変わります。"}
          </div>
          {message && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{message}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
            >
              {isPending ? "保存中…" : "変更を確定"}
            </button>
            <button type="button" onClick={() => setIsConfirming(false)} disabled={isPending} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800">戻る</button>
          </div>
        </div>
      )}
    </div>
  );
}
