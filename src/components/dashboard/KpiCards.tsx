"use client";

import { TrendingDown, TrendingUp, Minus, Weight, Flame, Beef, CalendarCheck } from "lucide-react";
import type { DailyLog } from "@/lib/supabase/types";
import { calcWeightTrend } from "@/lib/utils/calcTrend";

interface KpiCardsProps {
  logs: DailyLog[];
}

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;       // Tailwind bg クラス (アイコン背景)
  iconColor: string;    // Tailwind text クラス
  trend?: "up" | "down" | "flat";
  trendPositive?: "up" | "down";
}

function KpiCard({
  label, value, unit, sub, icon,
  accent, iconColor, trend, trendPositive,
}: KpiCardProps) {
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  const isGood =
    trend === undefined || trend === "flat"
      ? null
      : trend === trendPositive;

  const trendColor =
    isGood === null ? "text-slate-400" : isGood ? "text-emerald-500" : "text-rose-500";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent}`}>
          <span className={iconColor}>{icon}</span>
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-[2rem] font-bold leading-none tracking-tight text-slate-900">
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-slate-400">{unit}</span>}
      </div>
      {(sub !== undefined || trend !== undefined) && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          {trend && <TrendIcon size={13} />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

export function KpiCards({ logs }: KpiCardsProps) {
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const latest = sorted[sorted.length - 1];
  const recent = sorted.slice(-14);

  const weightData = recent
    .filter((d) => d.weight !== null)
    .map((d) => ({ date: d.log_date, weight: d.weight! }));
  const trend = calcWeightTrend(weightData);
  const slopePerWeek = trend.slope * 7;

  const last7 = sorted.slice(-7);
  const avgCalories =
    last7.filter((d) => d.calories !== null).length > 0
      ? last7.filter((d) => d.calories !== null).reduce((s, d) => s + d.calories!, 0) /
        last7.filter((d) => d.calories !== null).length
      : null;
  const avgProtein =
    last7.filter((d) => d.protein !== null).length > 0
      ? last7.filter((d) => d.protein !== null).reduce((s, d) => s + d.protein!, 0) /
        last7.filter((d) => d.protein !== null).length
      : null;

  const trendLabel =
    Math.abs(slopePerWeek) < 0.05
      ? "横ばい"
      : `${slopePerWeek > 0 ? "+" : ""}${slopePerWeek.toFixed(2)} kg/週`;

  const trendDir: "up" | "down" | "flat" =
    Math.abs(slopePerWeek) < 0.05 ? "flat" : slopePerWeek > 0 ? "up" : "down";

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <KpiCard
        label="現在体重"
        value={latest?.weight !== null && latest?.weight !== undefined
          ? latest.weight.toFixed(1) : "—"}
        unit="kg"
        sub={weightData.length >= 2 ? trendLabel : undefined}
        icon={<Weight size={18} />}
        accent="bg-blue-50"
        iconColor="text-blue-600"
        trend={weightData.length >= 2 ? trendDir : undefined}
        trendPositive="down"
      />
      <KpiCard
        label="平均カロリー 7日"
        value={avgCalories !== null ? Math.round(avgCalories).toLocaleString() : "—"}
        unit="kcal"
        icon={<Flame size={18} />}
        accent="bg-orange-50"
        iconColor="text-orange-500"
      />
      <KpiCard
        label="平均タンパク質 7日"
        value={avgProtein !== null ? Math.round(avgProtein).toString() : "—"}
        unit="g"
        icon={<Beef size={18} />}
        accent="bg-emerald-50"
        iconColor="text-emerald-600"
      />
      <KpiCard
        label="ログ日数"
        value={logs.length.toString()}
        unit="日"
        sub={`最終: ${latest?.log_date ?? "—"}`}
        icon={<CalendarCheck size={18} />}
        accent="bg-violet-50"
        iconColor="text-violet-600"
      />
    </div>
  );
}
