"use client";

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface TdeePoint {
  date: string;
  tdee: number | null;
  intake: number | null;
  theoretical: number | null;
}

interface TdeeDetailChartProps {
  data: TdeePoint[];
  avgTdee: number | null;
}

export function TdeeDetailChart({ data, avgTdee }: TdeeDetailChartProps) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">TDEE 推移</h2>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={56} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip formatter={(v: any, name: any) => [v !== null ? `${Math.round(v).toLocaleString()} kcal` : "—", name]} />
          <Legend />
          {avgTdee && <ReferenceLine y={avgTdee} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "平均", fontSize: 10 }} />}
          <Area
            type="monotone"
            dataKey="tdee"
            name="実測 TDEE"
            stroke="#f97316"
            fill="#fed7aa"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="intake"
            name="摂取カロリー MA"
            stroke="#10b981"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="theoretical"
            name="理論 TDEE"
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
