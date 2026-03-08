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
import type { DailyLog, Prediction } from "@/lib/supabase/types";

interface ForecastChartProps {
  logs: DailyLog[];
  predictions: Prediction[];
}

interface ChartPoint {
  date: string;
  actual?: number;
  forecast?: number;
}

export function ForecastChart({ logs, predictions }: ForecastChartProps) {
  // 実績データ
  const actualMap = new Map<string, number>(
    logs
      .filter((d) => d.weight !== null)
      .map((d) => [d.log_date, d.weight!])
  );

  // 予測データ (今日以降)
  const today = new Date().toISOString().slice(0, 10);
  const forecastMap = new Map<string, number>(
    predictions
      .filter((p) => p.ds >= today)
      .map((p) => [p.ds, p.yhat])
  );

  // 全日付を統合してソート
  const allDates = Array.from(
    new Set([...actualMap.keys(), ...forecastMap.keys()])
  ).sort();

  const data: ChartPoint[] = allDates.map((date) => ({
    date,
    actual: actualMap.get(date),
    forecast: forecastMap.get(date),
  }));

  const weights = logs.filter((d) => d.weight !== null).map((d) => d.weight!);
  const yMin = Math.floor(Math.min(...weights, ...predictions.map((p) => p.yhat)) - 1);
  const yMax = Math.ceil(Math.max(...weights, ...predictions.map((p) => p.yhat)) + 1);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">体重推移・予測</h2>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)} // MM-DD
            minTickGap={30}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v}kg`}
            width={48}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => [
              typeof value === "number" ? `${value.toFixed(2)} kg` : String(value),
              name === "actual" ? "実績" : "予測",
            ]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            labelFormatter={(label: any) => String(label)}
          />
          <Legend
            formatter={(value: string) => (value === "actual" ? "実績" : "予測")}
          />
          <ReferenceLine x={today} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "今日", fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="forecast"
            stroke="#f59e0b"
            fill="#fef9c3"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
