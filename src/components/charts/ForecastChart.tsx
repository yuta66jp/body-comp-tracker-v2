"use client";

import { useState } from "react";
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
import type { TooltipValueType } from "recharts";
import type { DailyLog, Prediction } from "@/lib/supabase/types";
import { toJstDateStr, addDaysStr, dateRangeStr } from "@/lib/utils/date";
import type { MonthlyGoalEntry } from "@/lib/utils/monthlyGoalPlan";
import { buildMonthlyGoalDateMap } from "@/lib/utils/monthlyGoalVisualization";
import { buildForecastMap, calcEwLinearForecast } from "@/lib/utils/forecastUtils";

interface ForecastChartProps {
  logs: DailyLog[];
  predictions: Prediction[];
  sma7: Array<{ date: string; value: number }>;
  goalWeight?: number;
  contestDate?: string;
  /** #101 の plan entries。渡すと月次目標ステップラインを描画し monthlyTarget は非表示になる */
  monthlyGoalEntries?: MonthlyGoalEntry[];
}

interface ChartPoint {
  date: string;
  actual?: number;
  forecast?: number;
  sma7?: number;
  ewTrend?: number;
  monthlyGoalTarget?: number;
}

type RangeTab = "default" | "7d" | "31d" | "90d";

const RANGE_TABS: { key: RangeTab; label: string }[] = [
  { key: "default", label: "全体" },
  { key: "7d",      label: "7日" },
  { key: "31d",     label: "31日" },
  { key: "90d",     label: "90日" },
];

export function ForecastChart({
  logs,
  predictions,
  sma7,
  goalWeight,
  contestDate,
  monthlyGoalEntries,
}: ForecastChartProps) {
  const [rangeTab, setRangeTab] = useState<RangeTab>("default");

  const today = toJstDateStr();

  // 最新測定日（体重あり）
  const latestLogDate = logs
    .filter((d) => d.weight !== null)
    .sort((a, b) => b.log_date.localeCompare(a.log_date))[0]?.log_date ?? today;

  const actualMap = new Map(
    logs.filter((d) => d.weight !== null).map((d) => [d.log_date, d.weight!])
  );
  const sma7Map = new Map(sma7.map((d) => [d.date, d.value]));
  const forecastMap = buildForecastMap(predictions, latestLogDate);

  // EW Linear Trend: SMA7 ベース指数加重線形回帰の短期補助線 (最終実測日翌日〜14日先)
  // #155 の predict_ew_linear() と同一設計 (SMA7入力 + alpha=0.9)
  const ewForecastPoints = calcEwLinearForecast(sma7, latestLogDate, 14);
  const ewTrendMap = new Map(ewForecastPoints.map((p) => [p.date, p.value]));

  // タブごとの表示範囲
  const lastForecastDate = predictions.length > 0
    ? [...predictions].sort((a, b) => b.ds.localeCompare(a.ds))[0].ds
    : today;
  // EW 補助線の最終日 (latestLogDate + 14 日、点がなければ今日)
  const lastEwDate = ewForecastPoints.at(-1)?.date ?? today;

  let viewStartStr: string;
  let viewEndStr: string;

  if (rangeTab === "7d") {
    viewStartStr = addDaysStr(latestLogDate, -6) ?? today;  // 最新測定日を含む7日間
    viewEndStr = latestLogDate;
  } else if (rangeTab === "31d") {
    viewStartStr = addDaysStr(latestLogDate, -30) ?? today; // 最新測定日を含む31日間
    viewEndStr = latestLogDate;
  } else if (rangeTab === "90d") {
    viewStartStr = addDaysStr(latestLogDate, -89) ?? today; // 最新測定日を含む90日間
    viewEndStr = latestLogDate;
  } else {
    // default: 45日前〜 contestDate / lastForecastDate / lastEwDate の最大
    viewStartStr = addDaysStr(today, -45) ?? today;
    viewEndStr = [lastForecastDate, lastEwDate, contestDate ?? ""]
      .filter(Boolean)
      .reduce((a, b) => (a > b ? a : b));
  }

  const allDates = dateRangeStr(viewStartStr, viewEndStr);

  // 月次目標ステップ系列 (plan entries がある場合のみ)
  const monthlyGoalDateMap =
    monthlyGoalEntries && monthlyGoalEntries.length > 0
      ? buildMonthlyGoalDateMap(monthlyGoalEntries, allDates)
      : new Map<string, number>();

  const data: ChartPoint[] = allDates.map((date) => ({
    date,
    actual: actualMap.get(date),
    sma7: sma7Map.get(date),
    forecast: rangeTab === "default" ? forecastMap.get(date) : undefined,
    // EW補助線は全体ビューのみ (14日先まで) — 7d/31d は latestLogDate 以前しか表示しないため自然に非表示
    ewTrend: rangeTab === "default" ? ewTrendMap.get(date) : undefined,
    monthlyGoalTarget: monthlyGoalDateMap.get(date),
  }));

  // Y 軸範囲
  const visibleActual = allDates
    .map((d) => actualMap.get(d))
    .filter((v): v is number => v !== undefined);
  const visibleForecast = rangeTab === "default"
    ? allDates.map((d) => forecastMap.get(d)).filter((v): v is number => v !== undefined)
    : [];
  const visibleEwTrend = rangeTab === "default"
    ? allDates.map((d) => ewTrendMap.get(d)).filter((v): v is number => v !== undefined)
    : [];
  // 月次目標ステップの Y 軸範囲への反映 (plan がある場合)
  const visibleMonthlyGoalTargets = [...monthlyGoalDateMap.values()];
  const rangeWeights = [
    ...visibleActual,
    ...visibleForecast,
    ...visibleEwTrend,
    ...visibleMonthlyGoalTargets,
    ...(goalWeight && rangeTab === "default" ? [goalWeight] : []),
  ];

  // タブごとのパディング（7日は±1.5kg、31日/90日は±2.5kg、全体は広め）
  const yPad = rangeTab === "7d" ? 1.5 : rangeTab === "31d" || rangeTab === "90d" ? 2.5 : 1;
  const dataMin = rangeWeights.length > 0 ? Math.min(...rangeWeights) : 55;
  const dataMax = rangeWeights.length > 0 ? Math.max(...rangeWeights) : 80;
  const yMin = rangeTab === "default"
    ? Math.min(55, Math.floor(dataMin - yPad))
    : Math.floor((dataMin - yPad) * 10) / 10;
  const yMax = Math.ceil((dataMax + yPad) * 10) / 10;

  // Y軸 tick 配列（7日: 1kg刻み、31日/90日: 2kg刻み、全体: Recharts 自動）
  const yTicks: number[] | undefined = (() => {
    if (rangeTab === "default") return undefined;
    const step = rangeTab === "7d" ? 1 : 2;
    const start = Math.ceil(yMin / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= yMax; v += step) ticks.push(v);
    return ticks;
  })();

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {/* ヘッダー + タブ */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">体重推移・予測</h2>
        <div role="group" aria-label="表示期間" className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {RANGE_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRangeTab(key)}
              aria-pressed={rangeTab === key}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                rangeTab === key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
            minTickGap={rangeTab === "7d" ? 0 : rangeTab === "90d" ? 20 : 30}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${Math.floor(v)}kg`}
            ticks={yTicks}
            width={52}
          />
          <Tooltip
            formatter={(value: TooltipValueType | undefined, name: number | string | undefined) => {
              const labels: Record<string, string> = {
                actual:             "実測",
                sma7:               "7日平均",
                forecast:           "AI予測",
                ewTrend:            "直近トレンド",
                monthlyGoalTarget:  "月次目標",
              };
              const nameStr = String(name ?? "");
              return [
                typeof value === "number" ? `${value.toFixed(1)} kg` : "—",
                labels[nameStr] ?? nameStr,
              ];
            }}
            labelFormatter={(label: unknown) => String(label)}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                actual:             "実測",
                sma7:               "7日平均",
                forecast:           "AI予測 (NeuralProphet)",
                ewTrend:            "直近トレンド予測",
                monthlyGoalTarget:  "月次目標",
              };
              return labels[value] ?? value;
            }}
          />

          {/* 参照線（全体ビューのみ） */}
          {rangeTab === "default" && goalWeight && (
            <ReferenceLine
              y={goalWeight}
              stroke="#ef4444"
              strokeDasharray="4 2"
              label={{ value: "Goal", fontSize: 10, fill: "#ef4444" }}
            />
          )}
          <ReferenceLine
            x={today}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            label={{ value: "今日", fontSize: 10, fill: "#94a3b8" }}
          />
          {rangeTab === "default" && contestDate && (
            <ReferenceLine
              x={contestDate}
              stroke="#ef4444"
              strokeWidth={2}
              label={{ value: "大会", fontSize: 10, fill: "#ef4444", position: "top" }}
            />
          )}

          {/* 実測（青ドット） */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke="rgba(0,191,255,0.5)"
            strokeWidth={0}
            dot={{ r: rangeTab === "7d" ? 5 : 3, fill: "rgba(0,191,255,0.6)", strokeWidth: 0 }}
            connectNulls={false}
          />
          {/* 7日平均（シアン実線） */}
          <Line
            type="monotone"
            dataKey="sma7"
            stroke="#00BFFF"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          {/* AI予測（全体ビューのみ） */}
          {rangeTab === "default" && (
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="rgba(255,136,0,0.9)"
              strokeWidth={3}
              dot={false}
              connectNulls
            />
          )}
          {/* EW Linear Trend 補助線（全体ビューのみ・最終実測日翌日〜14日先）
              SMA7入力 + 指数加重線形回帰。直近変化の短期参考線。
              主線 (NeuralProphet) より細く破線で補助線として扱う。 */}
          {rangeTab === "default" && ewForecastPoints.length > 0 && (
            <Line
              type="monotone"
              dataKey="ewTrend"
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              connectNulls
            />
          )}
          {/* 月次目標ステップライン (plan entries がある場合のみ)
              type="stepAfter": 現在点の値を次点の x まで保持し、月境界で垂直に段差が生じる。
              月内フラット・月ごとに変わるステップ表現を実現する。 */}
          {monthlyGoalDateMap.size > 0 && (
            <Line
              type="stepAfter"
              dataKey="monthlyGoalTarget"
              stroke="#8b5cf6"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              connectNulls={false}
              legendType="line"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
