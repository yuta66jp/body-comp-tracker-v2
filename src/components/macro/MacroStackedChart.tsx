"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TooltipValueType } from "recharts";
import { useIsDark } from "@/lib/hooks/useIsDark";
import { buildTooltipStyle } from "@/lib/utils/rechartsFormatter";

interface MacroPoint {
  date: string;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

interface MacroStackedChartProps {
  data: MacroPoint[];
}

export function normalizeMacroPoint(d: MacroPoint) {
  if (d.protein === null || d.fat === null || d.carbs === null) {
    return { date: d.date, タンパク質: null, 脂質: null, 炭水化物: null };
  }
  const total = d.protein + d.fat + d.carbs;
  if (total <= 0) {
    return { date: d.date, タンパク質: null, 脂質: null, 炭水化物: null };
  }
  const proteinPct = Math.round((d.protein / total) * 100);
  const fatPct = Math.round((d.fat / total) * 100);
  return {
    date: d.date,
    タンパク質: proteinPct,
    脂質: fatPct,
    炭水化物: 100 - proteinPct - fatPct,
  };
}

export function MacroStackedChart({ data }: MacroStackedChartProps) {
  const isDark = useIsDark();
  const gridColor = isDark ? "#334155" : "#f0f0f0";
  const tickColor = isDark ? "#94a3b8" : "#64748b";
  const tooltipStyle = buildTooltipStyle(isDark);

  // 各日の合計を出して % に変換
  const normalized = data.map(normalizeMacroPoint);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <h2 className="mb-4 text-base font-semibold text-gray-700 dark:text-slate-200">PFC 構成比推移（直近 60 日）</h2>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={normalized} stackOffset="expand" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickColor }} minTickGap={20} />
          <YAxis tick={{ fontSize: 11, fill: tickColor }} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
          <Tooltip
            {...tooltipStyle}
            formatter={(v: TooltipValueType | undefined, name: number | string | undefined) => [v == null ? "未記録" : `${v}%`, name ?? ""]}
          />
          <Legend />
          <Area type="monotone" dataKey="タンパク質" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.7} />
          <Area type="monotone" dataKey="脂質" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.7} />
          <Area type="monotone" dataKey="炭水化物" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.7} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
