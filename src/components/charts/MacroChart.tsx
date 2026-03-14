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
import { lastNEntries } from "@/lib/utils/timeWindow";

interface MacroChartProps {
  logs: DailyLog[];
  days?: number;
}

export function MacroChart({ logs, days = 30 }: MacroChartProps) {
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
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">
        マクロ栄養素 (直近 {days} 日)
      </h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis tick={{ fontSize: 11 }} width={36} unit="g" />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Tooltip formatter={(v: any, name: any) => [`${v} g`, name]} />
          <Legend />
          <Bar dataKey="タンパク質" stackId="macro" fill="#3b82f6" />
          <Bar dataKey="脂質" stackId="macro" fill="#f59e0b" />
          <Bar dataKey="炭水化物" stackId="macro" fill="#10b981" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
