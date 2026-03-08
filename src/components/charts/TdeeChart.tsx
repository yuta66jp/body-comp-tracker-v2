"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DailyLog } from "@/lib/supabase/types";
import { calcTdeeFromChange } from "@/lib/utils/calcTdee";

interface TdeeChartProps {
  logs: DailyLog[];
  days?: number;
}

export function TdeeChart({ logs, days = 60 }: TdeeChartProps) {
  const sorted = [...logs]
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
    .filter((d) => d.weight !== null && d.calories !== null)
    .slice(-days);

  const data = sorted.slice(1).map((d, i) => {
    const prev = sorted[i];
    const tdee = calcTdeeFromChange({
      weightKgStart: prev.weight!,
      weightKgEnd: d.weight!,
      days: 1,
      avgCaloriesPerDay: d.calories!,
    });
    return {
      date: d.log_date.slice(5),
      TDEE: Math.round(tdee),
      摂取カロリー: d.calories!,
    };
  });

  // 7日移動平均 TDEE
  const smoothed = data.map((d, i) => {
    const window = data.slice(Math.max(0, i - 6), i + 1);
    const avg = window.reduce((s, x) => s + x.TDEE, 0) / window.length;
    return { ...d, "TDEE (7日平均)": Math.round(avg) };
  });

  const avgTdee =
    smoothed.length > 0
      ? Math.round(smoothed.reduce((s, d) => s + d.TDEE, 0) / smoothed.length)
      : 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-gray-700">TDEE トレンド</h2>
      <p className="mb-4 text-sm text-gray-400">平均 TDEE: {avgTdee.toLocaleString()} kcal</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={smoothed} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis tick={{ fontSize: 11 }} width={52} unit="kcal" />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Tooltip formatter={(v: any, name: any) => [typeof v === "number" ? `${v.toLocaleString()} kcal` : String(v), name]} />
          <Legend />
          <ReferenceLine y={avgTdee} stroke="#94a3b8" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="摂取カロリー" stroke="#10b981" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="TDEE (7日平均)" stroke="#ef4444" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
