"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { MacroKpiData, MacroTargets, MacroDiff } from "@/lib/utils/calcMacro";

interface MacroKpiCardsProps {
  kpi:     MacroKpiData;
  targets: MacroTargets;
  diff:    MacroDiff;
}

function DiffBadge({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) return <span className="text-slate-300">—</span>;
  const sign = value > 0 ? "+" : "";
  const color = value > 0 ? "text-rose-500" : value < 0 ? "text-emerald-600" : "text-slate-400";
  return <span className={`text-sm font-medium ${color}`}>{sign}{value.toLocaleString()} {unit}</span>;
}

function WeekDelta({ curr, prev, unit }: { curr: number | null; prev: number | null; unit: string }) {
  if (curr === null || prev === null) return <span className="text-xs text-slate-300">前週データなし</span>;
  const d = Math.round(curr) - Math.round(prev);
  const sign = d > 0 ? "+" : "";
  const color = d < 0 ? "text-emerald-600" : d > 0 ? "text-rose-500" : "text-slate-400";
  return <span className={`text-xs ${color}`}>前週比 {sign}{d.toLocaleString()} {unit}</span>;
}

export function MacroKpiCards({ kpi, targets, diff }: MacroKpiCardsProps) {
  const { weekly, prevWeekly, weightChangeRate } = kpi;

  let paceLabel = "—";
  let paceColor = "text-gray-400";
  if (weightChangeRate !== null) {
    if (weightChangeRate < -1.5)      { paceLabel = "速すぎ ⚠️";     paceColor = "text-rose-500"; }
    else if (weightChangeRate < -0.5) { paceLabel = "理想ペース 🎯"; paceColor = "text-emerald-600"; }
    else if (weightChangeRate < 0.5)  { paceLabel = "緩やか 🐢";     paceColor = "text-amber-500"; }
    else                              { paceLabel = "増加中";         paceColor = "text-rose-500"; }
  }

  const macros: { key: keyof MacroTargets; label: string; actual: number | null; prevActual: number | null; unit: string }[] = [
    { key: "protein", label: "タンパク質", actual: weekly.avgProtein,  prevActual: prevWeekly.avgProtein,  unit: "g" },
    { key: "fat",     label: "脂質",       actual: weekly.avgFat,      prevActual: prevWeekly.avgFat,      unit: "g" },
    { key: "carbs",   label: "炭水化物",   actual: weekly.avgCarbs,    prevActual: prevWeekly.avgCarbs,    unit: "g" },
  ];

  return (
    <div className="space-y-4">
      {/* 上段: kcal + 週次体重変化 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* kcal カード */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">週平均カロリー</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {weekly.avgCalories !== null ? Math.round(weekly.avgCalories).toLocaleString() : "—"}
            <span className="ml-1 text-base font-normal text-gray-400">kcal</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-400">
              目標: {targets.calories !== null ? `${targets.calories.toLocaleString()} kcal` : "未設定"}
            </span>
            <DiffBadge value={diff.calories} unit="kcal" />
          </div>
          <div className="mt-1">
            <WeekDelta curr={weekly.avgCalories} prev={prevWeekly.avgCalories} unit="kcal" />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">直近7記録日の平均</p>
          {/* TDEE 接続導線 */}
          {diff.calories !== null && (
            <p className="mt-1 text-xs text-slate-400">
              {diff.calories > 100
                ? "目標を超過 — 収支は TDEE 画面で確認できます"
                : diff.calories < -100
                ? "目標を下回り — 収支は TDEE 画面で確認できます"
                : "目標付近の摂取量です"}
            </p>
          )}
        </div>

        {/* 週次体重変化カード */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">週次体重変化</p>
            {weightChangeRate !== null ? (
              weightChangeRate < 0
                ? <TrendingDown size={20} className="text-emerald-500" />
                : weightChangeRate > 0
                ? <TrendingUp size={20} className="text-rose-500" />
                : <Minus size={20} className="text-gray-300" />
            ) : <Minus size={20} className="text-gray-300" />}
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {weightChangeRate !== null
              ? `${weightChangeRate > 0 ? "+" : ""}${weightChangeRate.toFixed(2)}%`
              : "—"}
          </p>
          <p className={`mt-1 text-sm font-medium ${paceColor}`}>{paceLabel}</p>
          <p className="mt-2 text-xs text-slate-400">直近7記録日 vs 前7記録日 の平均体重比</p>
        </div>
      </div>

      {/* 下段: P / F / C 目標差分カード */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {macros.map(({ key, label, actual, prevActual, unit }) => (
          <div key={key} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{label}（週平均）</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {actual !== null ? `${Math.round(actual)}` : "—"}
              <span className="ml-1 text-sm font-normal text-gray-400">{unit}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-xs text-gray-400">
                目標: {targets[key] !== null ? `${targets[key]} ${unit}` : "未設定"}
              </span>
              <DiffBadge value={diff[key]} unit={unit} />
            </div>
            <div className="mt-1">
              <WeekDelta curr={actual} prev={prevActual} unit={unit} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">直近7記録日の平均</p>
          </div>
        ))}
      </div>
    </div>
  );
}
