"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface MonthlyPoint {
  week: string;
  [month: string]: string | number | null;
}

interface MonthlyChartProps {
  data: MonthlyPoint[];
  months: string[];
  title: string;
  unit: string;
  colors: string[];
}

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#f97316"];

export function MonthlyChart({ data, months, title, unit, colors }: MonthlyChartProps) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">{title}</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} label={{ value: "経過週", position: "insideBottomRight", fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={52} tickFormatter={(v: number) => `${v}${unit}`} />
          <Tooltip formatter={(v: any, name: any) => [v !== null ? `${v}${unit}` : "—", name]} />
          <Legend />
          {months.map((month, i) => (
            <Line
              key={month}
              type="monotone"
              dataKey={month}
              stroke={colors[i % colors.length]}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export { COLORS };
