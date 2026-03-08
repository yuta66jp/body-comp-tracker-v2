"use client";

import { TrendingDown, TrendingUp, Minus, Scale, Flame, Beef, Droplets } from "lucide-react";
import type { DailyLog } from "@/lib/supabase/types";
import { calcWeightTrend } from "@/lib/utils/calcTrend";

interface KpiCardsProps {
  logs: DailyLog[];
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "flat";
  trendPositive?: "up" | "down"; // どちら向きが良いか
}

function KpiCard({ label, value, sub, icon, trend, trendPositive }: KpiCardProps) {
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  const trendColor =
    trend === undefined || trend === "flat"
      ? "text-gray-400"
      : trend === trendPositive
      ? "text-emerald-500"
      : "text-rose-500";

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-bold text-gray-900">{value}</p>
      {(sub || trend) && (
        <div className={`mt-1 flex items-center gap-1 text-sm ${trendColor}`}>
          {trend && <TrendIcon size={14} />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

export function KpiCards({ logs }: KpiCardsProps) {
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const latest = sorted[sorted.length - 1];
  const recent = sorted.slice(-14); // 直近 14 日

  // 体重トレンド (直近 14 日)
  const weightData = recent
    .filter((d) => d.weight !== null)
    .map((d) => ({ date: d.log_date, weight: d.weight! }));
  const trend = calcWeightTrend(weightData);
  const slopePerWeek = trend.slope * 7;

  // 平均カロリー・タンパク質 (直近 7 日)
  const last7 = sorted.slice(-7);
  const avgCalories =
    last7.filter((d) => d.calories !== null).reduce((s, d) => s + d.calories!, 0) /
    (last7.filter((d) => d.calories !== null).length || 1);
  const avgProtein =
    last7.filter((d) => d.protein !== null).reduce((s, d) => s + d.protein!, 0) /
    (last7.filter((d) => d.protein !== null).length || 1);

  const fmt = (n: number | null, unit: string, digits = 1) =>
    n !== null ? `${n.toFixed(digits)}${unit}` : "—";

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
        value={fmt(latest?.weight ?? null, " kg")}
        sub={weightData.length >= 2 ? trendLabel : undefined}
        icon={<Scale size={20} />}
        trend={weightData.length >= 2 ? trendDir : undefined}
        trendPositive="down"
      />
      <KpiCard
        label="平均カロリー (7日)"
        value={fmt(avgCalories, " kcal", 0)}
        icon={<Flame size={20} />}
      />
      <KpiCard
        label="平均タンパク質 (7日)"
        value={fmt(avgProtein, " g", 0)}
        icon={<Beef size={20} />}
      />
      <KpiCard
        label="ログ日数"
        value={`${logs.length} 日`}
        sub={`直近: ${latest?.log_date ?? "—"}`}
        icon={<Droplets size={20} />}
      />
    </div>
  );
}
