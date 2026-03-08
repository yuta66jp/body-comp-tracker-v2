"use client";

interface DailyRow {
  fullDate: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface MacroDailyTableProps {
  data: DailyRow[];
  calTarget?: number;
}

function pct(macro_g: number, total_kcal: number, multiplier: number) {
  if (!total_kcal) return "—";
  return `${Math.round((macro_g * multiplier / total_kcal) * 100)}%`;
}

export function MacroDailyTable({ data, calTarget = 2000 }: MacroDailyTableProps) {
  const recent = [...data].sort((a, b) => b.fullDate.localeCompare(a.fullDate)).slice(0, 14);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">日次栄養内訳（直近 14 日）</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="pb-2 pr-4 font-medium">日付</th>
              <th className="pb-2 pr-4 font-medium">カロリー</th>
              <th className="pb-2 pr-4 font-medium text-right">P (g / %)</th>
              <th className="pb-2 pr-4 font-medium text-right">F (g / %)</th>
              <th className="pb-2 font-medium text-right">C (g / %)</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((row) => {
              const barPct = Math.min(100, Math.round((row.calories / calTarget) * 100));
              const barColor = row.calories > calTarget ? "bg-rose-400" : "bg-blue-400";
              return (
                <tr key={row.fullDate} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium text-gray-700">{row.fullDate}</td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="text-xs text-gray-600">{row.calories.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right text-xs text-gray-600">
                    {row.protein}g <span className="text-gray-400">({pct(row.protein, row.calories, 4)})</span>
                  </td>
                  <td className="py-2 pr-4 text-right text-xs text-gray-600">
                    {row.fat}g <span className="text-gray-400">({pct(row.fat, row.calories, 9)})</span>
                  </td>
                  <td className="py-2 text-right text-xs text-gray-600">
                    {row.carbs}g <span className="text-gray-400">({pct(row.carbs, row.calories, 4)})</span>
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
