"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { DashboardDailyLog } from "@/lib/supabase/types";
import { DAY_TAGS, DAY_TAG_LABELS, DAY_TAG_BADGE_COLORS } from "@/lib/utils/dayTags";
import { formatConditionSummary } from "@/lib/utils/trainingType";
import { computeWeightDelta, buildRecentLogArrays } from "@/lib/utils/recentLogsUtils";

interface RecentLogsTableProps {
  logs: DashboardDailyLog[];
  embedded?: boolean;
  seasonMap?: Map<string, string>;   // log_date → season name
  currentSeason?: string | null;
}

export function RecentLogsTable({ logs, embedded = false, seasonMap, currentSeason }: RecentLogsTableProps) {
  const { sorted, ascending } = buildRecentLogArrays(logs);

  /** 直前ログとのカロリー差分。calories / 前回 calories いずれかが null なら null */
  function getCalDelta(log: DashboardDailyLog): number | null {
    if (log.calories === null) return null;
    const idx = ascending.findIndex((d) => d.log_date === log.log_date);
    if (idx <= 0) return null;
    const prev = ascending[idx - 1];
    if (prev.calories === null) return null;
    return log.calories - prev.calories;
  }

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-50 text-left">
            <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-400">日付</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">体重</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">変化</th>
            <th className="pb-2 pl-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">カロリー</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((log) => {
            const delta = computeWeightDelta(ascending, log);
            const DeltaIcon = delta === null ? null : delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
            const conditionSummary = formatConditionSummary({
              had_bowel_movement: log.had_bowel_movement as boolean | null,
              training_type: log.training_type,
              work_mode: log.work_mode,
            });
            const calDelta = getCalDelta(log);

            return (
              <tr key={log.log_date} className="transition-colors hover:bg-slate-50/70">
                <td className="py-2 pr-4">
                  <div className="font-mono text-xs font-medium text-slate-600">{log.log_date}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {(() => {
                      const season = seasonMap?.get(log.log_date) ?? currentSeason;
                      return season ? (
                        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-blue-500">
                          {season}
                        </span>
                      ) : null;
                    })()}
                    {DAY_TAGS.filter((tag) => log[tag]).map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${DAY_TAG_BADGE_COLORS[tag]}`}
                      >
                        {DAY_TAG_LABELS[tag]}
                      </span>
                    ))}
                  </div>
                  {(conditionSummary || log.sleep_hours !== null) && (
                    <div className="mt-1 text-xs leading-snug text-slate-500">
                      {[
                        conditionSummary,
                        log.sleep_hours !== null ? `${log.sleep_hours}h` : null,
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-4 text-right font-semibold text-slate-800">
                  {log.weight?.toFixed(1)}
                  <span className="ml-0.5 text-xs font-normal text-slate-400">kg</span>
                </td>
                <td className="py-2 pr-4 text-right">
                  {delta !== null && DeltaIcon ? (
                    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                      delta > 0 ? "text-rose-500" : delta < 0 ? "text-blue-500" : "text-slate-300"
                    }`}>
                      <DeltaIcon size={12} />
                      {Math.abs(delta).toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="py-2 pl-2 text-right text-xs">
                  {log.calories !== null ? (
                    <>
                      <span className="text-slate-700">{log.calories.toLocaleString()}</span>
                      <span className="ml-0.5 text-[10px] text-slate-400">kcal</span>
                      {calDelta !== null && (
                        <span
                          className={`ml-1 text-[10px] font-medium ${
                            calDelta > 0
                              ? "text-blue-500"
                              : calDelta < 0
                              ? "text-rose-500"
                              : "text-slate-400"
                          }`}
                        >
                          ({calDelta > 0 ? "+" : ""}{Math.round(calDelta)})
                        </span>
                      )}
                    </>
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
  );

  if (embedded) return table;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-700">直近ログ</h2>
      </div>
      <div className="p-5">{table}</div>
    </div>
  );
}
