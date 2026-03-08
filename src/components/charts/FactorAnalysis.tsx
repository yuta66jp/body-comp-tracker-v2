"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface FactorEntry {
  label: string;
  importance: number;
  pct: number;
}

interface FactorAnalysisProps {
  data: Record<string, FactorEntry>;
  updatedAt: string;
}

const BAR_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

const RANK_LABELS = ["1位", "2位", "3位", "4位", "5位"];

export function FactorAnalysis({ data, updatedAt }: FactorAnalysisProps) {
  const sorted = Object.values(data).sort((a, b) => b.importance - a.importance);

  const chartData = sorted.map((d) => ({
    name: d.label,
    pct: d.pct,
  }));

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-700">AI 因子分析（XGBoost）</h2>
          <p className="mt-0.5 text-xs text-gray-400">翌日体重に最も影響を与えている栄養素</p>
        </div>
        <p className="text-xs text-gray-300">{updatedAt.slice(0, 10)} 更新</p>
      </div>

      {/* ランキングカード */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {sorted.map((d, i) => (
          <div
            key={d.label}
            className="flex-shrink-0 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center"
          >
            <p className="text-[10px] text-gray-400">{RANK_LABELS[i]}</p>
            <p className="mt-0.5 text-xs font-semibold text-gray-700">{d.label}</p>
            <p className="text-sm font-bold" style={{ color: BAR_COLORS[i] }}>
              {d.pct}%
            </p>
          </div>
        ))}
      </div>

      {/* 水平棒グラフ */}
      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
          <Tooltip
            formatter={(v: any) => [`${v}%`, "重要度"]}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="mt-3 text-xs text-gray-400">
        ※ 各特徴量が翌日の体重変化を予測する際の相対的な重要度。値が大きいほど体重増減との関連が強い。
      </p>
    </div>
  );
}
