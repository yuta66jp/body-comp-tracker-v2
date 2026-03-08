"use client";

import {
  ComposedChart,
  Line,
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
  sma7: Array<{ date: string; value: number }>;
  goalWeight?: number;
  monthlyTarget?: number;
}

interface ChartPoint {
  date: string;
  actual?: number;
  forecast?: number;
  sma7?: number;
}

export function ForecastChart({
  logs,
  predictions,
  sma7,
  goalWeight,
  monthlyTarget,
}: ForecastChartProps) {
  const today = new Date().toISOString().slice(0, 10);

  const actualMap = new Map(
    logs.filter((d) => d.weight !== null).map((d) => [d.log_date, d.weight!])
  );
  const sma7Map = new Map(sma7.map((d) => [d.date, d.value]));
  const forecastMap = new Map(
    predictions.filter((p) => p.ds >= today).map((p) => [p.ds, p.yhat])
  );

  const viewStart = new Date();
  viewStart.setDate(viewStart.getDate() - 45);
  const viewStartStr = viewStart.toISOString().slice(0, 10);

  const allDates = Array.from(
    new Set([...actualMap.keys(), ...forecastMap.keys()])
  )
    .filter((d) => d >= viewStartStr)
    .sort();

  const data: ChartPoint[] = allDates.map((date) => ({
    date,
    actual: actualMap.get(date),
    sma7: sma7Map.get(date),
    forecast: forecastMap.get(date),
  }));

  const rangeWeights = [
    ...logs.filter((d) => d.weight !== null).map((d) => d.weight!),
    ...predictions.map((p) => p.yhat),
    ...(goalWeight ? [goalWeight] : []),
  ];
  const yMin = Math.min(55, rangeWeights.length > 0 ? Math.floor(Math.min(...rangeWeights)) - 1 : 55);
  const yMax = rangeWeights.length > 0 ? Math.ceil(Math.max(...rangeWeights)) + 1 : 80;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">体重推移・予測</h2>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
            minTickGap={30}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v}kg`}
            width={48}
          />
          <Tooltip
            formatter={(value: any, name: any) => {
              const labels: Record<string, string> = {
                actual: "実測",
                sma7: "7日平均",
                forecast: "AI予測",
              };
              return [
                typeof value === "number" ? `${value.toFixed(1)} kg` : "—",
                labels[name as string] ?? name,
              ];
            }}
            labelFormatter={(label: any) => String(label)}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                actual: "実測",
                sma7: "7日平均",
                forecast: "AI予測 (NeuralProphet)",
              };
              return labels[value] ?? value;
            }}
          />

          {goalWeight && (
            <ReferenceLine
              y={goalWeight}
              stroke="#ef4444"
              strokeDasharray="4 2"
              label={{ value: "Goal", fontSize: 10, fill: "#ef4444" }}
            />
          )}
          {monthlyTarget && monthlyTarget > 0 && (
            <ReferenceLine
              y={monthlyTarget}
              stroke="#f97316"
              strokeDasharray="6 3"
              label={{ value: "Monthly", fontSize: 10, fill: "#f97316" }}
            />
          )}
          <ReferenceLine
            x={today}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            label={{ value: "今日", fontSize: 10, fill: "#94a3b8" }}
          />

          <Line
            type="monotone"
            dataKey="actual"
            stroke="rgba(0,191,255,0.5)"
            strokeWidth={0}
            dot={{ r: 3, fill: "rgba(0,191,255,0.5)", strokeWidth: 0 }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="sma7"
            stroke="#00BFFF"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="rgba(255,136,0,0.9)"
            strokeWidth={3}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
