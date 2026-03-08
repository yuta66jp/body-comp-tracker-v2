"use client";

import type { DailyLog } from "@/lib/supabase/types";

interface RecentLogsTableProps {
  logs: DailyLog[];
}

export function RecentLogsTable({ logs }: RecentLogsTableProps) {
  const sorted = [...logs]
    .filter((d) => d.weight !== null)
    .sort((a, b) => b.log_date.localeCompare(a.log_date))
    .slice(0, 14);

  // 前日差を計算するためにもとの昇順配列を参照
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

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">直近ログ（14 日）</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="pb-2 pr-4 font-medium">日付</th>
              <th className="pb-2 pr-4 font-medium text-right">体重</th>
              <th className="pb-2 pr-4 font-medium text-right">Δ</th>
              <th className="pb-2 font-medium text-right">摂取カロリー</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((log) => {
              const delta = getDelta(log);
              return (
                <tr key={log.log_date} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium text-gray-700">{log.log_date}</td>
                  <td className="py-2 pr-4 text-right text-gray-800">
                    {log.weight?.toFixed(1)} kg
                  </td>
                  <td className={`py-2 pr-4 text-right font-medium ${
                    delta === null
                      ? "text-gray-300"
                      : delta > 0
                      ? "text-rose-500"
                      : delta < 0
                      ? "text-blue-500"
                      : "text-gray-400"
                  }`}>
                    {delta !== null
                      ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`
                      : "—"}
                  </td>
                  <td className="py-2 text-right text-gray-500">
                    {log.calories !== null
                      ? `${log.calories.toLocaleString()} kcal`
                      : "—"}
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
