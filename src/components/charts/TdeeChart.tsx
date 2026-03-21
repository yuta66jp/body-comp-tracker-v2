// TDEE は enrich.py (batch) を canonical source とする。
// このコンポーネントは canonical 値の表示・fallback・整形のみを担う。
// TDEE の再計算・再集約・再平滑化はここでは行わない。
//
// 平滑化仕様: enrich.py の tdee_estimated は weight_sma7.diff() + rolling median (window=7, min_periods=3)
// 係数: KCAL_PER_KG_FAT = 7200 kcal/kg (Hall et al., 2012)
// 前 7 日平均 TDEE: avg_tdee_7d (enrich.py で事前計算済み)
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TooltipValueType } from "recharts";
import type { EnrichedLogPayloadRow } from "@/lib/supabase/types";

// Re-export for convenience so other modules can import from here
export type { EnrichedLogPayloadRow as EnrichedLogRow };

interface TdeeChartProps {
  /** enriched_logs の全行。log_date 昇順でソート済みを推奨。 */
  enrichedRows: EnrichedLogPayloadRow[];
  /** 表示する直近の記録数 (デフォルト 60) */
  days?: number;
}

export function TdeeChart({ enrichedRows, days = 60 }: TdeeChartProps) {
  // tdee_estimated が存在する行のみ対象とし、直近 days 件に絞る
  const valid = enrichedRows
    .filter((r) => r.tdee_estimated !== null)
    .slice(-days);

  if (valid.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-700">TDEE トレンド</h2>
        <p className="text-sm text-gray-400">
          TDEE データがありません。バッチが実行されるとグラフが表示されます。
        </p>
      </div>
    );
  }

  const chartData = valid.map((r) => ({
    date: r.log_date.slice(5),
    // 整形のみ: canonical の tdee_estimated を表示する
    TDEE: Math.round(r.tdee_estimated!),
    // 7日平均 TDEE はバッチで事前計算済みの avg_tdee_7d を使う
    // avg_tdee_7d が null または undefined (古いバッチ結果の場合) は表示しない
    "TDEE (7日平均)": r.avg_tdee_7d != null ? Math.round(r.avg_tdee_7d) : null,
    // 摂取カロリー 7日平均もバッチ値を使う
    摂取カロリー: r.avg_calories_7d != null ? Math.round(r.avg_calories_7d) : null,
  }));

  // 参照線用: 直近 avg_tdee_7d の最終値
  // avg_tdee_7d は optional (古いバッチ結果では undefined) なので ?? null で fallback
  const lastAvgTdeeRaw = valid.at(-1)?.avg_tdee_7d;
  const avgTdeeDisplay =
    lastAvgTdeeRaw != null ? Math.round(lastAvgTdeeRaw) : null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-gray-700">TDEE トレンド</h2>
      <p className="mb-4 text-sm text-gray-400">
        {avgTdeeDisplay !== null
          ? `直近 TDEE 7日平均: ${avgTdeeDisplay.toLocaleString()} kcal`
          : "TDEE 7日平均を算出中（データ蓄積中）"}
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis tick={{ fontSize: 11 }} width={52} unit="kcal" />
          <Tooltip formatter={(v: TooltipValueType | undefined, name: number | string | undefined) => [typeof v === "number" ? `${v.toLocaleString()} kcal` : String(v), name ?? ""]} />
          <Legend />
          {avgTdeeDisplay !== null && (
            <ReferenceLine y={avgTdeeDisplay} stroke="#94a3b8" strokeDasharray="4 4" />
          )}
          <Line
            type="monotone"
            dataKey="摂取カロリー"
            stroke="#10b981"
            dot={false}
            strokeWidth={1.5}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="TDEE (7日平均)"
            stroke="#ef4444"
            dot={false}
            strokeWidth={2}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
