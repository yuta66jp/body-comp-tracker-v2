"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { DailyLog } from "@/lib/supabase/types";

interface RecentLogsTableProps {
  logs: DailyLog[];
  embedded?: boolean;
  seasonMap?: Map<string, string>;   // log_date → season name
  currentSeason?: string | null;
}

export function RecentLogsTable({ logs, embedded = false, seasonMap, currentSeason }: RecentLogsTableProps) {
  const sorted = [...logs]
    .filter((d) => d.weight !== null)
    .sort((a, b) => b.log_date.localeCompare(a.log_date))
    .slice(0, 14);

  const ascending = [...logs]
    .filter((d) => d.weight !== null)
    .sort((a, b) => a.log_date.localeCompare(b.log_date));

  function getDelta(log: DailyLog): number | null {
    const idx = ascending.findIndex((d) => d.log_date === log.log_date);
    if (idx <= 0) return null;
    const prev = ascending[idx - 1];
    if (prev.weight === null || log.weight === null) return null;
    return log.weight - prev.weight;
  }

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-50 text-left">
            <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-400">日付</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">体重</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">変化</th>
            <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">カロリー</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((log) => {
            const delta = getDelta(log);
            const DeltaIcon = delta === null ? null : delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
            return (
              <tr key={log.log_date} className="transition-colors hover:bg-slate-50/70">
                <td className="py-2 pr-4">
                  <div className="font-mono text-xs font-medium text-slate-600">{log.log_date}</div>
                  {(() => {
                    const season = seasonMap?.get(log.log_date) ?? currentSeason;
                    return season ? (
                      <span className="mt-0.5 inline-block rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-blue-500">
                        {season}
                      </span>
                    ) : null;
                  })()}
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
                <td className="py-2 text-right text-xs text-slate-500">
                  {log.calories !== null
                    ? <>{log.calories.toLocaleString()}<span className="ml-0.5 text-slate-400">kcal</span></>
                    : <span className="text-slate-300">—</span>}
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
