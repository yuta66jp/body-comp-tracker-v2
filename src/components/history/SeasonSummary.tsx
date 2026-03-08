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
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">月別サマリー</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="pb-2 pr-4 font-medium">月</th>
              <th className="pb-2 pr-4 font-medium text-right">ログ日数</th>
              <th className="pb-2 pr-4 font-medium text-right">開始体重</th>
              <th className="pb-2 pr-4 font-medium text-right">終了体重</th>
              <th className="pb-2 pr-4 font-medium text-right">変化</th>
              <th className="pb-2 pr-4 font-medium text-right">平均kcal</th>
              <th className="pb-2 font-medium text-right">平均P</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const delta =
                s.startWeight !== null && s.endWeight !== null
                  ? s.endWeight - s.startWeight
                  : null;
              return (
                <tr key={s.month} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium text-gray-800">{s.month}</td>
                  <td className="py-2 pr-4 text-right text-gray-600">{s.days}</td>
                  <td className="py-2 pr-4 text-right text-gray-600">
                    {s.startWeight?.toFixed(1) ?? "—"} kg
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-600">
                    {s.endWeight?.toFixed(1) ?? "—"} kg
                  </td>
                  <td className={`py-2 pr-4 text-right font-medium ${delta === null ? "text-gray-400" : delta < 0 ? "text-emerald-600" : "text-rose-500"}`}>
                    {delta !== null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-600">
                    {s.avgCalories !== null ? Math.round(s.avgCalories).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 text-right text-gray-600">
                    {s.avgProtein !== null ? Math.round(s.avgProtein) + "g" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { MonthStats };
