"use client";

import { useMemo, useState } from "react";
import { DaysOutChart } from "@/components/history/DaysOutChart";
import { SeasonComparisonAccordion } from "@/components/history/SeasonComparisonAccordion";
import { SeasonComparisonTable } from "@/components/history/SeasonComparisonTable";
import { SeasonLowChart } from "@/components/history/SeasonLowChart";
import { TodayWindowComparison } from "@/components/history/TodayWindowComparison";
import { CompletedSeasonEditor } from "@/components/history/CompletedSeasonEditor";
import type { SeasonHistoryDailyLog } from "@/lib/queries/dailyLogs";
import type {
  LegacySeasonHistoryRecord,
  SeasonHistoryRecord,
} from "@/lib/utils/seasonHistory";
import {
  buildDaysOutChartData,
  buildDaysOutSeries,
  buildMilestoneRows,
  buildTodayWindowEntries,
  calcSeasonMeta,
  calcTodayDaysOut,
} from "@/lib/utils/calcSeason";

const MILESTONES = [-180, -120, -90, -60, -30, -14];

interface SeasonHistoryExplorerProps {
  records: SeasonHistoryRecord[];
  legacyRecords: LegacySeasonHistoryRecord[];
  unassignedLogCount: number;
  today: string;
  dailyLogs: SeasonHistoryDailyLog[];
}

function formatWeight(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} kg`;
}

function goalStatusLabel(status: SeasonHistoryRecord["goalStatus"]): string {
  if (status === "achieved") return "目標達成";
  if (status === "not_achieved") return "未達成";
  return "判定不可";
}

function sourceLabel(source: SeasonHistoryRecord["source"]): string {
  if (source === "daily_logs") return "シーズン所属の日次ログ";
  if (source === "career_logs") return "移行済みキャリア履歴";
  return "体重ログなし";
}

export function SeasonHistoryExplorer({
  records,
  legacyRecords,
  unassignedLogCount,
  today,
  dailyLogs,
}: SeasonHistoryExplorerProps) {
  const [showOlderSeasons, setShowOlderSeasons] = useState(false);
  const defaultRecord =
    records.find((record) => record.season.status === "active") ?? records.at(-1) ?? null;
  const [selectedId, setSelectedId] = useState<number | null>(defaultRecord?.season.id ?? null);
  const selected = records.find((record) => record.season.id === selectedId) ?? defaultRecord;
  const sortedRecords = useMemo(
    () => [...records].sort((a, b) =>
      b.season.startDate.localeCompare(a.season.startDate) || b.season.id - a.season.id
    ),
    [records]
  );
  const recentRecords = sortedRecords.slice(0, 4);
  const olderRecords = sortedRecords.slice(4);
  const selectedOlderRecord = olderRecords.find(
    (record) => record.season.id === selected?.season.id
  ) ?? null;

  const comparison = useMemo(() => {
    if (!selected) return null;
    const samePhase = records.filter(
      (record) => record.season.phase === selected.season.phase
    );
    const rawMap = buildDaysOutSeries(samePhase.flatMap((record) => record.logs));
    const seriesMap = new Map(
      samePhase.map((record) => [
        record.seriesLabel,
        rawMap.get(record.seriesLabel) ?? [],
      ])
    );
    const seasonLabels = samePhase.map((record) => record.seriesLabel);
    const selectedDaysOut = selected.season.status === "active"
      ? calcTodayDaysOut(today, selected.season.targetDate)
      : null;

    return {
      samePhase,
      seriesMap,
      seasonLabels,
      selectedDaysOut,
      chartData: buildDaysOutChartData(seriesMap, -300, 0),
      milestoneRows: buildMilestoneRows(seriesMap, MILESTONES),
      todayEntries: selectedDaysOut === null
        ? []
        : buildTodayWindowEntries(seriesMap, selectedDaysOut, 7),
      seasonMeta: calcSeasonMeta(
        samePhase.flatMap((record) => record.logs),
        selected.season.phase
      ),
    };
  }, [records, selected, today]);

  const deadlineLabel = selected?.season.phase === "Bulk" ? "目標日" : "大会日";
  const nextSeasonStartDate = selected
    ? records
        .filter((record) => record.season.startDate > selected.season.startDate)
        .sort((a, b) => a.season.startDate.localeCompare(b.season.startDate))[0]
        ?.season.startDate ?? null
    : null;

  function renderSeasonCard(record: SeasonHistoryRecord) {
    const isSelected = record.season.id === selected?.season.id;
    const periodEnd = record.season.endDate ?? "進行中";
    return (
      <button
        key={record.season.id}
        type="button"
        aria-pressed={isSelected}
        onClick={() => setSelectedId(record.season.id)}
        className={`rounded-xl border p-4 text-left transition-colors ${
          isSelected
            ? "border-blue-400 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/30"
            : "border-slate-100 hover:border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-800 dark:text-slate-100">{record.season.name}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${record.season.phase === "Cut" ? "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
            {record.season.phase}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {record.season.status === "active" ? "進行中" : "終了"}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="col-span-2"><dt className="text-slate-400">期間</dt><dd className="text-slate-600 dark:text-slate-300">{record.season.startDate} 〜 {periodEnd}</dd></div>
          <div><dt className="text-slate-400">開始体重</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{formatWeight(record.season.startWeight)}</dd></div>
          <div><dt className="text-slate-400">終了・最新体重</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{formatWeight(record.season.endWeight ?? record.latestWeight)}</dd></div>
          <div><dt className="text-slate-400">{record.season.phase === "Cut" ? "大会日" : "目標日"}</dt><dd className="text-slate-600 dark:text-slate-300">{record.season.targetDate}</dd></div>
          <div><dt className="text-slate-400">目標</dt><dd className="text-slate-600 dark:text-slate-300">{formatWeight(record.season.targetWeight)}</dd></div>
        </dl>
        <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {goalStatusLabel(record.goalStatus)}
        </p>
      </button>
    );
  }

  return (
    <div className="space-y-6">
      {unassignedLogCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300">
          シーズン未所属の日次ログが {unassignedLogCount} 件あります。所属が確定するまでシーズン比較には含めていません。
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">シーズン一覧</h2>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            選択したシーズンと同じフェーズだけを比較します。
          </p>
        </div>
        {records.length === 0 ? (
          <p className="p-5 text-sm text-slate-400 dark:text-slate-500">
            シーズン履歴がありません。
          </p>
        ) : (
          <>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {recentRecords.map(renderSeasonCard)}
              {showOlderSeasons && olderRecords.map(renderSeasonCard)}
              {!showOlderSeasons && selectedOlderRecord && (
                <>
                  <p className="text-xs font-semibold text-slate-400 md:col-span-2">選択中の過去シーズン</p>
                  {renderSeasonCard(selectedOlderRecord)}
                </>
              )}
            </div>
            {olderRecords.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3 text-center dark:border-slate-700">
                <button
                  type="button"
                  aria-expanded={showOlderSeasons}
                  onClick={() => setShowOlderSeasons((current) => !current)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30"
                >
                  {showOlderSeasons
                    ? "過去のシーズンを閉じる"
                    : `過去のシーズンを表示（残り${olderRecords.length}件）`}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {selected && comparison && (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{selected.season.name} の詳細</h2>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">選択中</span>
              </div>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">データ源: {sourceLabel(selected.source)}</p>
            </div>
            <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-xs text-slate-400">フェーズ / 状態</dt><dd className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{selected.season.phase} / {selected.season.status === "active" ? "進行中" : "終了"}</dd></div>
              <div><dt className="text-xs text-slate-400">開始</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{selected.season.startDate} / {formatWeight(selected.season.startWeight)}</dd></div>
              <div><dt className="text-xs text-slate-400">終了</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{selected.season.endDate ?? "進行中"} / {formatWeight(selected.season.endWeight ?? selected.latestWeight)}</dd></div>
              <div><dt className="text-xs text-slate-400">{deadlineLabel} / 目標</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{selected.season.targetDate} / {formatWeight(selected.season.targetWeight)}</dd></div>
            </dl>

            {selected.season.status === "completed" && (
              <CompletedSeasonEditor
                key={selected.season.id}
                season={selected.season}
                dailyLogs={dailyLogs}
                nextSeasonStartDate={nextSeasonStartDate}
                today={today}
              />
            )}

            <div className="border-t border-slate-100 dark:border-slate-700">
              <div className="px-5 py-3">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">月次計画と実績</h3>
                {selected.season.status === "completed" && selected.season.monthlyPlanSnapshot === null && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">移行前の終了済みシーズンのため、固定済み月次計画 snapshot はありません。</p>
                )}
              </div>
              {selected.planEntries.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-slate-400 dark:text-slate-500">表示できる月次計画がありません。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="border-y border-slate-100 bg-slate-50 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                      <tr><th className="px-5 py-2 text-left">月</th><th className="px-3 py-2 text-right">目標</th><th className="px-3 py-2 text-right">前月比</th><th className="px-3 py-2 text-right">実績</th><th className="px-5 py-2 text-right">目標差</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                      {selected.planEntries.map((entry) => {
                        const diff = entry.actualWeight === null ? null : entry.actualWeight - entry.targetWeight;
                        const onTrack = diff === null ? null : selected.season.phase === "Cut" ? diff <= 0.05 : diff >= -0.05;
                        return (
                          <tr key={entry.month}>
                            <td className="px-5 py-2.5 font-medium text-slate-600 dark:text-slate-300">{entry.month}<span className="ml-2 text-[10px] font-normal text-slate-400">{entry.source === "manual" ? "手動" : entry.source === "actual_fixed" ? "実績固定" : "自動"}</span></td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{entry.targetWeight.toFixed(1)} kg</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{entry.requiredDeltaKg > 0 ? "+" : ""}{entry.requiredDeltaKg.toFixed(1)} kg</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{formatWeight(entry.actualWeight)}</td>
                            <td className={`px-5 py-2.5 text-right tabular-nums ${onTrack === null ? "text-slate-300 dark:text-slate-600" : onTrack ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-amber-600 dark:text-amber-400"}`}>{diff === null ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <div>
            <h2 className="mb-3 text-base font-bold text-slate-800 dark:text-slate-100">{selected.season.phase} シーズン比較</h2>
            {comparison.samePhase.length <= 1 ? (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 text-sm text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:shadow-none">
                比較できる同フェーズのシーズンがありません。Bulk と Cut は同じ差分列では比較しません。
              </div>
            ) : (
              <div className="space-y-6">
                {selected.season.status === "active" && comparison.selectedDaysOut !== null && comparison.selectedDaysOut <= 0 && (
                  <TodayWindowComparison entries={comparison.todayEntries} currentSeason={selected.seriesLabel} todayDaysOut={comparison.selectedDaysOut} windowDays={7} isCut={selected.season.phase === "Cut"} deadlineLabel={deadlineLabel} />
                )}
                {comparison.chartData.length > 0 && (
                  <DaysOutChart data={comparison.chartData} seasons={comparison.seasonLabels} currentSeason={selected.seriesLabel} todayDaysOut={comparison.selectedDaysOut} deadlineLabel={deadlineLabel} />
                )}
                <div className="md:hidden"><SeasonComparisonAccordion milestoneRows={comparison.milestoneRows} seasonMeta={comparison.seasonMeta} seasons={comparison.seasonLabels} currentSeason={selected.seriesLabel} isCut={selected.season.phase === "Cut"} showCurrentSeason deadlineLabel={deadlineLabel} /></div>
                <div className="hidden md:block"><SeasonComparisonTable milestoneRows={comparison.milestoneRows} seasonMeta={comparison.seasonMeta} seasons={comparison.seasonLabels} currentSeason={selected.seriesLabel} isCut={selected.season.phase === "Cut"} showCurrentSeason deadlineLabel={deadlineLabel} /></div>
                {comparison.seasonMeta.length > 0 && <SeasonLowChart seasons={comparison.seasonMeta} currentSeason={selected.seriesLabel} phase={selected.season.phase} />}
              </div>
            )}
          </div>
        </>
      )}

      {legacyRecords.length > 0 && (
        <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5 dark:border-amber-700/50 dark:bg-amber-900/20">
          <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300">移行前のキャリア履歴</h2>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">シーズンへ安全に対応付けできないデータです。フェーズを推測せず、Cut / Bulk 比較から除外しています。</p>
          <ul className="mt-3 space-y-2 text-sm text-amber-800 dark:text-amber-300">
            {legacyRecords.map((record) => <li key={record.key}>{record.name}: {record.startDate} 〜 {record.endDate} / {record.startWeight.toFixed(1)} → {record.endWeight.toFixed(1)} kg / {record.count}件</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
