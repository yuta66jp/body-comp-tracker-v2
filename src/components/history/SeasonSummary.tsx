"use client";

interface MonthStats {
  month: string;
  avgWeight: number | null;
  avgCalories: number | null;
  avgProtein: number | null;
  startWeight: number | null;
  endWeight: number | null;
  days: number;
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
          <tr className="border-b border-slate-100 text-left">
            <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-400">月</th>
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
