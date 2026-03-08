"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import type { SeasonMeta } from "@/lib/utils/calcSeason";

interface SeasonLowChartProps {
  seasons: SeasonMeta[];       // 過去シーズン（career_logs）
  currentSeason?: string;      // 現在シーズンのラベル
}

// 過去シーズン: 古→新 でグレー系（薄→濃）、現在シーズン: 青
const PAST_COLORS = ["#d1d5db", "#9ca3af", "#6b7280", "#4b5563", "#334155"];
const CURRENT_COLOR = "#3b82f6";

export function SeasonLowChart({ seasons, currentSeason }: SeasonLowChartProps) {
  const data = seasons.map((s, i) => {
    const prev = seasons[i - 1];
    const delta = prev ? s.peakWeight - prev.peakWeight : null;
    const isCurrent = s.season === currentSeason;
    return {
      season: s.season.replace(/_/g, " "),
      rawSeason: s.season,
      weight: s.peakWeight,
      peakDate: s.peakDate,
      targetDate: s.targetDate,
      delta,
      isCurrent,
    };
  });

  const allWeights = data.map((d) => d.weight);
  const minW = Math.min(...allWeights);
  const maxW = Math.max(...allWeights);

  // 過去シーズンのインデックス（色の割り当てに使う）
  let pastIdx = 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-gray-700">年別 仕上がり体重（Season Low）</h2>
      <p className="mb-4 text-xs text-gray-400">各シーズンの最小体重 = 仕上がり体重</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="season" tick={{ fontSize: 10 }} />
          <YAxis
            domain={[Math.floor(minW) - 1, Math.ceil(maxW) + 1]}
            tick={{ fontSize: 11 }}
            width={44}
            tickFormatter={(v: number) => `${v}kg`}
          />
          <Tooltip
            formatter={(v: any, _: any, entry: any) => {
              const { delta, isCurrent, peakDate } = entry?.payload ?? {};
              const deltaStr = delta !== null && delta !== undefined
                ? ` (前年比 ${delta > 0 ? "+" : ""}${delta.toFixed(1)}kg)`
                : "";
              const tag = isCurrent ? " [今季]" : "";
              const dateStr = peakDate ? ` / ${peakDate}` : "";
              return [`${Number(v).toFixed(1)} kg${deltaStr}${dateStr}${tag}`, "仕上がり体重"];
            }}
          />
          <Bar dataKey="weight" radius={[6, 6, 0, 0]}>
            {data.map((entry, i) => {
              let color: string;
              if (entry.isCurrent) {
                color = CURRENT_COLOR;
              } else {
                color = PAST_COLORS[pastIdx % PAST_COLORS.length];
                pastIdx++;
              }
              return <Cell key={i} fill={color} />;
            })}
            <LabelList
              dataKey="weight"
              position="top"
              fontSize={12}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => typeof v === "number" ? `${v.toFixed(1)}kg` : ""}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* 前年差分テーブル */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="pb-2 pr-4 font-medium">シーズン</th>
              <th className="pb-2 pr-4 font-medium text-right">大会日</th>
              <th className="pb-2 pr-4 font-medium text-right">仕上がり体重</th>
              <th className="pb-2 font-medium text-right">前年差</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={row.season}
                className={`border-b border-gray-50 hover:bg-gray-50 ${row.isCurrent ? "font-semibold" : ""}`}
              >
                <td className="py-2 pr-4 text-gray-800">
                  {row.season}
                  {row.isCurrent && (
                    <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                      今季
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right text-gray-500">{row.targetDate}</td>
                <td className="py-2 pr-4 text-right font-semibold text-gray-800">
                  {row.weight.toFixed(1)} kg
                </td>
                <td className={`py-2 text-right text-sm font-medium ${
                  row.delta === null
                    ? "text-gray-300"
                    : row.delta < 0
                    ? "text-emerald-600"
                    : "text-rose-500"
                }`}>
                  {row.delta !== null
                    ? `${row.delta > 0 ? "+" : ""}${row.delta.toFixed(1)} kg`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
