"use client";

import { TrendingDown, TrendingUp, Minus, Flame, Beef, BarChart2 } from "lucide-react";
import type { MacroKpiData } from "@/lib/utils/calcMacro";

interface MacroKpiCardsProps {
  kpi: MacroKpiData;
}

function delta(curr: number | null, prev: number | null) {
  if (curr === null || prev === null) return null;
  return curr - prev;
}

export function MacroKpiCards({ kpi }: MacroKpiCardsProps) {
  const { weekly, prevWeekly, weightChangeRate, proteinRatio } = kpi;

  const calDelta = delta(weekly.avgCalories, prevWeekly.avgCalories);

  let paceLabel = "—";
  let paceColor = "text-gray-400";
  if (weightChangeRate !== null) {
    if (weightChangeRate < -1.5) { paceLabel = "速すぎ ⚠️"; paceColor = "text-rose-500"; }
    else if (weightChangeRate < -0.5) { paceLabel = "理想ペース 🎯"; paceColor = "text-emerald-600"; }
    else if (weightChangeRate < 0.5) { paceLabel = "緩やか 🐢"; paceColor = "text-amber-500"; }
    else { paceLabel = "増加中"; paceColor = "text-rose-500"; }
  }

  const proteinOk = proteinRatio !== null && proteinRatio >= 30;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* 週次体重変化率 */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">週次体重変化</span>
          {weightChangeRate !== null ? (
            weightChangeRate < 0
              ? <TrendingDown size={20} className="text-emerald-500" />
              : <TrendingUp size={20} className="text-rose-500" />
          ) : <Minus size={20} className="text-gray-300" />}
        </div>
        <p className="mt-3 text-3xl font-bold text-gray-900">
          {weightChangeRate !== null
            ? `${weightChangeRate > 0 ? "+" : ""}${weightChangeRate.toFixed(2)}%`
            : "—"}
        </p>
        <p className={`mt-1 text-sm font-medium ${paceColor}`}>{paceLabel}</p>
      </div>

      {/* 週平均カロリー */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">週平均カロリー</span>
          <Flame size={20} className="text-gray-400" />
        </div>
        <p className="mt-3 text-3xl font-bold text-gray-900">
          {weekly.avgCalories !== null ? Math.round(weekly.avgCalories).toLocaleString() : "—"}
          <span className="ml-1 text-base font-normal text-gray-400">kcal</span>
        </p>
        {calDelta !== null && (
          <p className={`mt-1 text-sm ${calDelta < 0 ? "text-emerald-600" : "text-rose-500"}`}>
            前週比 {calDelta > 0 ? "+" : ""}{Math.round(calDelta)} kcal
          </p>
        )}
      </div>

      {/* タンパク質比率 */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">タンパク質比率</span>
          <Beef size={20} className="text-gray-400" />
        </div>
        <p className="mt-3 text-3xl font-bold text-gray-900">
          {proteinRatio !== null ? `${proteinRatio.toFixed(1)}%` : "—"}
        </p>
        <p className={`mt-1 text-sm ${proteinOk ? "text-emerald-600" : "text-amber-500"}`}>
          {proteinRatio !== null ? (proteinOk ? "目標達成 ✓ (≥30%)" : "目標未達 (<30%)") : "データ不足"}
        </p>
      </div>
    </div>
  );
}
