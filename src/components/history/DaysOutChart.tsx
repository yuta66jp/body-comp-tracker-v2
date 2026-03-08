"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface DaysOutChartProps {
  data: Array<Record<string, number | null>>;
  seasons: string[];
  currentSeason?: string;
}

// 過去シーズンはグレー系、現在シーズンは赤
const PAST_COLORS = ["#c8c8c8", "#b0b0b0", "#989898", "#808080", "#686868"];

export function DaysOutChart({ data, seasons, currentSeason }: DaysOutChartProps) {
  // シーズンを時系列順にソート（現在シーズンを最後に）
  const sortedSeasons = [...seasons].sort((a, b) => {
    if (a === currentSeason) return 1;
    if (b === currentSeason) return -1;
    return a.localeCompare(b);
  });

  const pastSeasons = sortedSeasons.filter((s) => s !== currentSeason);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-gray-700">シーズン比較（大会日基準）</h2>
      <p className="mb-4 text-xs text-gray-400">
        X 軸: 大会日を 0 として遡った日数 | Y 軸: 体重 7 日移動平均 (kg)
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="daysOut"
            type="number"
            domain={["dataMin", 0]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v}日`}
            label={{ value: "大会まで", position: "insideBottomRight", fontSize: 10, offset: -4 }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 11 }}
            width={48}
            tickFormatter={(v: number) => `${v}kg`}
          />
          <Tooltip
            formatter={(v: any, name: any) => [
              v !== null ? `${Number(v).toFixed(1)} kg` : "—",
              name,
            ]}
            labelFormatter={(label: any) => `大会 ${Math.abs(Number(label))} 日前`}
          />
          <Legend />
          <ReferenceLine x={0} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "大会日", fontSize: 10 }} />

          {/* 過去シーズン（グレー系） */}
          {pastSeasons.map((season, i) => (
            <Line
              key={season}
              type="monotone"
              dataKey={season}
              stroke={PAST_COLORS[i % PAST_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}

          {/* 現在シーズン（赤・太線） */}
          {currentSeason && (
            <Line
              key={currentSeason}
              type="monotone"
              dataKey={currentSeason}
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
