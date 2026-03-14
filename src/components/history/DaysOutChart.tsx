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
import type { TooltipValueType } from "recharts";

interface DotRenderProps {
  cx?: number;
  cy?: number;
  payload: { daysOut: number };
}

interface DaysOutChartProps {
  data: Array<Record<string, number | null>>;
  seasons: string[];
  currentSeason?: string;
  /** 今日の daysOut (大会前は負値). 指定すると「今日」基準線を描画する */
  todayDaysOut?: number | null;
}

// 過去シーズン: 古→新 でグレー系（薄→濃）
const PAST_COLORS = ["#d1d5db", "#9ca3af", "#6b7280", "#4b5563", "#374151"];

/** シーズンの最後の非 null daysOut 値を返す */
function lastNonNullDaysOut(
  data: Array<Record<string, number | null>>,
  season: string
): number | null {
  let last: number | null = null;
  for (const row of data) {
    if (row[season] !== null && row[season] !== undefined) {
      last = row.daysOut as number;
    }
  }
  return last;
}

export function DaysOutChart({ data, seasons, currentSeason, todayDaysOut }: DaysOutChartProps) {
  const sortedSeasons = [...seasons].sort((a, b) => {
    if (a === currentSeason) return 1;
    if (b === currentSeason) return -1;
    return a.localeCompare(b);
  });

  const pastSeasons = sortedSeasons.filter((s) => s !== currentSeason);

  // 各シーズンの最終 daysOut を事前計算（レンダリング中の再計算を避ける）
  const lastDaysOutMap = new Map<string, number | null>();
  for (const season of sortedSeasons) {
    lastDaysOutMap.set(season, lastNonNullDaysOut(data, season));
  }

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
            formatter={(v: TooltipValueType | undefined, name: number | string | undefined) => [
              v != null ? `${Number(v).toFixed(1)} kg` : "—",
              name ?? "",
            ]}
            labelFormatter={(label: unknown) => `大会 ${Math.abs(Number(label))} 日前`}
          />
          <Legend />
          <ReferenceLine x={0} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "大会日", fontSize: 10 }} />
          {todayDaysOut != null && (
            <ReferenceLine
              x={todayDaysOut}
              stroke="#3b82f6"
              strokeDasharray="4 4"
              label={{ value: "今日", position: "top", fontSize: 10, fill: "#3b82f6" }}
            />
          )}

          {/* 過去シーズン（グレー系・末端ドット付き） */}
          {pastSeasons.map((season, i) => {
            const color = PAST_COLORS[i % PAST_COLORS.length];
            const endDaysOut = lastDaysOutMap.get(season);
            return (
              <Line
                key={season}
                type="monotone"
                dataKey={season}
                stroke={color}
                strokeWidth={1.5}
                dot={(props: DotRenderProps) => {
                  const { cx, cy, payload } = props;
                  if (payload.daysOut !== endDaysOut) return <g />;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  );
                }}
                connectNulls
              />
            );
          })}

          {/* 現在シーズン（赤・太線・大ドット） */}
          {currentSeason && (() => {
            const endDaysOut = lastDaysOutMap.get(currentSeason);
            return (
              <Line
                key={currentSeason}
                type="monotone"
                dataKey={currentSeason}
                stroke="#ef4444"
                strokeWidth={2.5}
                dot={(props: DotRenderProps) => {
                  const { cx, cy, payload } = props;
                  if (payload.daysOut !== endDaysOut) return <g />;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill="#ef4444"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  );
                }}
                connectNulls
              />
            );
          })()}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
