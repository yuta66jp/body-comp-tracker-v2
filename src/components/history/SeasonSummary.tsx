"use client";

import type { MonthlySeasonSummary } from "@/lib/utils/monthlySeasonSummary";

interface MonthStats {
  month: string;
  avgWeight: number | null;
  avgCalories: number | null;
  avgProtein: number | null;
  startWeight: number | null;
  endWeight: number | null;
  days: number;
  seasonSummary: MonthlySeasonSummary;
}

interface SeasonSummaryProps {
  stats: MonthStats[];
}

export function SeasonSummary({ stats }: SeasonSummaryProps) {
  if (stats.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left dark:border-slate-700">
            <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-400">月</th>
            <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-400">シーズン</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">日数</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">開始</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">終了</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">変化</th>
            <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">平均 kcal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
          {stats.map((s) => {
            const delta =
              s.startWeight !== null && s.endWeight !== null
                ? s.endWeight - s.startWeight
                : null;
            return (
              <tr key={s.month} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800">
                <td className="py-2 pr-4 font-mono text-xs font-medium text-slate-600 dark:text-slate-300">{s.month}</td>
                <td className="min-w-40 py-2 pr-4">
                  <SeasonBadges summary={s.seasonSummary} />
                </td>
                <td className="py-2 pr-4 text-right text-xs text-slate-500 dark:text-slate-400">{s.days}</td>
                <td className="py-2 pr-4 text-right text-xs text-slate-500 dark:text-slate-400">
                  {s.startWeight?.toFixed(1) ?? "—"}
                </td>
                <td className="py-2 pr-4 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {s.endWeight?.toFixed(1) ?? "—"}
                </td>
                <td className={`py-2 pr-4 text-right text-xs font-semibold ${
                  delta === null ? "text-slate-300 dark:text-slate-600" : delta < 0 ? "text-emerald-600" : "text-rose-500"
                }`}>
                  {delta !== null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}` : "—"}
                </td>
                <td className="py-2 text-right text-xs text-slate-500 dark:text-slate-400">
                  {s.avgCalories !== null ? Math.round(s.avgCalories).toLocaleString() : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SeasonBadges({ summary }: { summary: MonthlySeasonSummary }) {
  if (summary.status === "unavailable") {
    return <span className="text-xs text-amber-600 dark:text-amber-400">取得失敗</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {summary.seasons.map((season) => (
        <span key={season.id} className="break-all rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
          {season.name}
          {summary.seasons.filter((other) => other.name === season.name).length > 1 && ` (${season.startDate})`}
        </span>
      ))}
      {summary.unassignedDays > 0 && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {summary.seasons.length === 0 && summary.unknownDays === 0 ? "未所属" : `未所属（${summary.unassignedDays}日）`}
        </span>
      )}
      {summary.unknownDays > 0 && (
        <span className="text-xs text-amber-600 dark:text-amber-400">所属不明（{summary.unknownDays}日）</span>
      )}
    </div>
  );
}

export type { MonthStats };
