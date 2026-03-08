"use client";

interface TdeeDailyRow {
  date: string;
  calories: number | null;
  tdee: number | null;
}

interface TdeeDailyTableProps {
  data: TdeeDailyRow[];
}

export function TdeeDailyTable({ data }: TdeeDailyTableProps) {
  const recent = [...data].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">日次 TDEE ログ（直近 14 日）</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="pb-2 pr-4 font-medium">日付</th>
              <th className="pb-2 pr-4 font-medium text-right">摂取カロリー</th>
              <th className="pb-2 pr-4 font-medium text-right">実測 TDEE</th>
              <th className="pb-2 font-medium">バランス</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((row) => {
              const balance = row.calories !== null && row.tdee !== null
                ? Math.round(row.calories - row.tdee)
                : null;
              const barPct = balance !== null ? Math.min(100, Math.abs(balance) / 10) : 0;
              const barColor = balance === null ? "bg-gray-200" : balance < 0 ? "bg-emerald-400" : "bg-rose-400";
              return (
                <tr key={row.date} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium text-gray-700">{row.date}</td>
                  <td className="py-2 pr-4 text-right text-gray-600">
                    {row.calories !== null ? row.calories.toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-600">
                    {row.tdee !== null ? Math.round(row.tdee).toLocaleString() : "—"}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${barPct}%` }} />
                      </div>
                      <span className={`text-xs ${balance === null ? "text-gray-300" : balance < 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        {balance !== null ? `${balance > 0 ? "+" : ""}${balance.toLocaleString()}` : "—"}
                      </span>
                    </div>
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
