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
import type { TooltipValueType } from "recharts";
import { useIsDark } from "@/lib/hooks/useIsDark";
import { buildTooltipStyle } from "@/lib/utils/rechartsFormatter";

interface TdeePoint {
  date: string;
  /** 日次推定 TDEE (enrich.py の tdee_estimated)。参考表示 */
  tdee: number | null;
  /** 7日ローリング平均 TDEE (enrich.py の avg_tdee_7d)。短期変化確認の補助表示。古いバッチ結果では null */
  tdee7d?: number | null;
  /** 14日ローリング平均 TDEE (enrich.py の avg_tdee_14d)。傾向判断用の主表示。古いバッチ結果では null */
  tdee14d?: number | null;
  intake: number | null;
  theoretical: number | null;
}

interface TdeeDetailChartProps {
  data: TdeePoint[];
  /** 基準線 (ReferenceLine) として表示する TDEE 平均。14日平均を想定 */
  avgTdee14d: number | null;
}

export function TdeeDetailChart({ data, avgTdee14d }: TdeeDetailChartProps) {
  const isDark = useIsDark();
  const gridColor = isDark ? "#334155" : "#f0f0f0";
  const tickColor = isDark ? "#94a3b8" : "#64748b";
  const tooltipStyle = buildTooltipStyle(isDark);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <h2 className="mb-1 text-base font-semibold text-gray-700 dark:text-slate-200">TDEE 推移</h2>
      <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
        14日平均を基準線として主表示。7日平均は短期変化確認、日次値は参考として薄く表示
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickColor }} minTickGap={20} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: tickColor }} width={56} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip
            {...tooltipStyle}
            formatter={(v: TooltipValueType | undefined, name: number | string | undefined) => [typeof v === "number" ? `${Math.round(v).toLocaleString()} kcal` : "—", name ?? ""]}
          />
          <Legend />
          {avgTdee14d && <ReferenceLine y={avgTdee14d} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "14日平均", fontSize: 10 }} />}
          {/* 主表示: 14日ローリング平均 TDEE (基準線) */}
          <Area
            type="monotone"
            dataKey="tdee14d"
            name="実測 TDEE（14日平均・基準線）"
            stroke="#f97316"
            fill="#fed7aa"
            fillOpacity={0.6}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          {/* 補助表示: 7日ローリング平均 TDEE (短期変化) */}
          <Line
            type="monotone"
            dataKey="tdee7d"
            name="実測 TDEE（7日平均・短期）"
            stroke="#f97316"
            strokeWidth={1.5}
            strokeOpacity={0.8}
            strokeDasharray="3 2"
            dot={false}
            connectNulls
          />
          {/* 参考表示: 日次 TDEE (最も薄く) */}
          <Line
            type="monotone"
            dataKey="tdee"
            name="TDEE（日次・参考）"
            stroke="#f97316"
            strokeWidth={1}
            strokeOpacity={0.25}
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
