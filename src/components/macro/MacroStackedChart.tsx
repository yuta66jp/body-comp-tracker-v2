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

interface MacroPoint {
  date: string;
  protein: number;
  fat: number;
  carbs: number;
}

interface MacroStackedChartProps {
  data: MacroPoint[];
}

export function MacroStackedChart({ data }: MacroStackedChartProps) {
  // 各日の合計を出して % に変換
  const normalized = data.map((d) => {
    const total = d.protein + d.fat + d.carbs || 1;
    return {
      date: d.date,
      タンパク質: Math.round((d.protein / total) * 100),
      脂質: Math.round((d.fat / total) * 100),
      炭水化物: 100 - Math.round((d.protein / total) * 100) - Math.round((d.fat / total) * 100),
    };
  });

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">PFC 構成比推移（直近 60 日）</h2>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={normalized} stackOffset="expand" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
          <Tooltip
            formatter={(v: TooltipValueType | undefined, name: number | string | undefined) => [`${v ?? ""}%`, name ?? ""]}
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
