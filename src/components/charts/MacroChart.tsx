"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { DailyLog } from "@/lib/supabase/types";
import { makeTooltipFormatter } from "@/lib/utils/rechartsFormatter";
import { lastNEntries } from "@/lib/utils/timeWindow";
import { useIsDark } from "@/lib/hooks/useIsDark";

interface MacroChartProps {
  logs: DailyLog[];
  days?: number;
}

export function MacroChart({ logs, days = 30 }: MacroChartProps) {
  const isDark = useIsDark();
  const chartColors = {
    axis:     isDark ? "#94a3b8" : "#64748b",
    grid:     isDark ? "#334155" : "#f0f0f0",
    tickText: isDark ? "#94a3b8" : "#64748b",
  };

  // 記録日ベース: グラフ表示目的なので直近 N 件の記録を使う。
  // 暦日ベースにすると欠損日がグラフに空白として現れるため表示には不向き。
  const sorted = lastNEntries(
    [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date)),
    days
  );

  const data = sorted.map((d) => ({
    date: d.log_date.slice(5), // MM-DD
    タンパク質: d.protein ?? 0,
    脂質: d.fat ?? 0,
    炭水化物: d.carbs ?? 0,
  }));

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <h2 className="mb-4 text-base font-semibold text-gray-700 dark:text-slate-200">
        マクロ栄養素 (直近 {days} 日)
      </h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartColors.tickText }} stroke={chartColors.axis} minTickGap={20} />
          <YAxis tick={{ fontSize: 11, fill: chartColors.tickText }} stroke={chartColors.axis} width={36} unit="g" />
          <Tooltip formatter={makeTooltipFormatter((v) => `${v} g`)} />
          <Legend />
          <Bar dataKey="タンパク質" stackId="macro" fill="#3b82f6" />
          <Bar dataKey="脂質" stackId="macro" fill="#f59e0b" />
          <Bar dataKey="炭水化物" stackId="macro" fill="#10b981" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
