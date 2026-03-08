"use client";

interface MonthStats {
  month: string;
  avgWeight: number | null;
  avgCalories: number | null;
  avgProtein: number | null;
  startWeight: number | null;
  endWeight: number | null;
  days: number;
  season?: string | null;
}

interface SeasonSummaryProps {
  stats: MonthStats[];
}

export function SeasonSummary({ stats }: SeasonSummaryProps) {
  if (stats.length === 0) return null;

  const hasSeasons = stats.some((s) => s.season);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-400">月</th>
            {hasSeasons && (
              <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-400">シーズン</th>
            )}
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">日数</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">開始</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">終了</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">変化</th>
            <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">平均 kcal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {stats.map((s) => {
            const delta =
              s.startWeight !== null && s.endWeight !== null
                ? s.endWeight - s.startWeight
                : null;
            return (
              <tr key={s.month} className="transition-colors hover:bg-slate-50/70">
                <td className="py-2 pr-4 font-mono text-xs font-medium text-slate-600">{s.month}</td>
                {hasSeasons && (
                  <td className="py-2 pr-4">
                    {s.season ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                        {s.season}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                )}
                <td className="py-2 pr-4 text-right text-xs text-slate-500">{s.days}</td>
                <td className="py-2 pr-4 text-right text-xs text-slate-500">
                  {s.startWeight?.toFixed(1) ?? "—"}
                </td>
                <td className="py-2 pr-4 text-right text-xs font-semibold text-slate-700">
                  {s.endWeight?.toFixed(1) ?? "—"}
                </td>
                <td className={`py-2 pr-4 text-right text-xs font-semibold ${
                  delta === null ? "text-slate-300" : delta < 0 ? "text-emerald-600" : "text-rose-500"
                }`}>
                  {delta !== null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}` : "—"}
                </td>
                <td className="py-2 text-right text-xs text-slate-500">
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

export type { MonthStats };
