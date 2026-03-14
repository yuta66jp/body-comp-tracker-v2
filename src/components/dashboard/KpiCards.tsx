"use client";

import { TrendingDown, TrendingUp, Minus, Weight, CalendarClock, Target } from "lucide-react";
import type { DailyLog } from "@/lib/supabase/types";
import type { AppSettings } from "@/lib/domain/settings";
import { calcWeightTrend } from "@/lib/utils/calcTrend";
import { toJstDateStr, calcDaysLeft, addDaysStr } from "@/lib/utils/date";

interface KpiCardsProps {
  logs: DailyLog[];
  settings: AppSettings;
  avgTdee: number | null;
}

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  accent: string;
  iconColor: string;
  trendDir?: "up" | "down" | "flat";
  trendPositive?: "up" | "down";
}

function KpiCard({ label, value, unit, sub, icon, accent, iconColor, trendDir, trendPositive }: KpiCardProps) {
  const TrendIcon = trendDir === "up" ? TrendingUp : trendDir === "down" ? TrendingDown : Minus;
  const isGood = trendDir === undefined || trendDir === "flat"
    ? null
    : trendDir === trendPositive;
  const trendColor = isGood === null ? "text-slate-400" : isGood ? "text-emerald-500" : "text-rose-500";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent}`}>
          <span className={iconColor}>{icon}</span>
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-[2rem] font-bold leading-none tracking-tight text-slate-900">{value}</span>
        {unit && <span className="text-sm font-medium text-slate-400">{unit}</span>}
      </div>
      {sub && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trendDir ? trendColor : "text-slate-400"}`}>
          {trendDir && <TrendIcon size={13} />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

export function KpiCards({ logs, settings, avgTdee: _avgTdee }: KpiCardsProps) {
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const latest = sorted[sorted.length - 1];

  // --- 現在体重 ---
  const weightData = sorted.slice(-14)
    .filter((d) => d.weight !== null)
    .map((d) => ({ date: d.log_date, weight: d.weight! }));
  const trend = calcWeightTrend(weightData);
  const slopePerWeek = trend.slope * 7;
  const trendDir: "up" | "down" | "flat" =
    Math.abs(slopePerWeek) < 0.05 ? "flat" : slopePerWeek > 0 ? "up" : "down";
  const trendLabel = Math.abs(slopePerWeek) < 0.05
    ? "横ばい"
    : `${slopePerWeek > 0 ? "+" : ""}${slopePerWeek.toFixed(2)} kg/週`;

  // --- 基準日 (todayStr) ---
  // 以降の全暦日計算で共通して使う。JST 固定で UTC サーバー上でもズレない。
  const todayStr = toJstDateStr();

  // --- 残り日数 + 残り週数 ---
  // calcDaysLeft を使い GoalNavigator / calcReadiness と定義を統一する。
  // (旧実装: new Date(contestDate).getTime() - Date.now() は UTC 解釈のため
  //  JST 00:00〜08:59 に大会当日を "1日前" と誤表示するバグがあった)
  const contestDate = settings.contestDate;
  const daysLeft = contestDate ? calcDaysLeft(todayStr, contestDate) : null;
  // 残り週数: 1 桁の小数で表示
  const weeksLeft =
    daysLeft !== null && daysLeft > 0 ? (daysLeft / 7).toFixed(1) : null;

  // --- 目標到達予定日（線形トレンドから算出）---
  const goalWeight = settings.targetWeight;
  const currentWeight = latest?.weight ?? null;
  const slopePerDay = trend.slope; // kg/day

  let goalReachDate: string | null = null;
  let goalReachLabel = "—";

  if (goalWeight !== null && currentWeight !== null) {
    const gap0 = currentWeight - goalWeight;
    if (Math.abs(gap0) < 0.1) {
      goalReachLabel = "達成済み ✓";
    } else if (slopePerDay === 0 || (gap0 > 0 && slopePerDay >= 0) || (gap0 < 0 && slopePerDay <= 0)) {
      goalReachLabel = "停滞中";
    } else {
      const daysNeeded = gap0 / (-slopePerDay);
      if (daysNeeded > 0 && daysNeeded < 730) {
        goalReachDate = addDaysStr(todayStr, Math.round(daysNeeded));
        goalReachLabel = goalReachDate ? goalReachDate.slice(5) : "停滞中"; // MM-DD
      } else {
        goalReachLabel = "停滞中";
      }
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {/* 現在体重 */}
      <KpiCard
        label="現在体重"
        value={currentWeight !== null ? currentWeight.toFixed(1) : "—"}
        unit="kg"
        sub={weightData.length >= 2 ? trendLabel : undefined}
        icon={<Weight size={18} />}
        accent="bg-blue-50"
        iconColor="text-blue-600"
        trendDir={weightData.length >= 2 ? trendDir : undefined}
        trendPositive="down"
      />

      {/* 残り日数 + 残り週数 */}
      <KpiCard
        label="残り日数"
        value={daysLeft !== null ? daysLeft.toLocaleString() : "—"}
        unit={daysLeft !== null ? "日" : ""}
        sub={
          daysLeft !== null && daysLeft > 0 && weeksLeft !== null
            ? `${weeksLeft} 週 / ${contestDate}`
            : (contestDate ?? "コンテスト日未設定")
        }
        icon={<CalendarClock size={18} />}
        accent="bg-violet-50"
        iconColor="text-violet-600"
      />

      {/* 目標到達予定日 */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">目標到達予定</p>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50">
            <Target size={18} className="text-teal-600" />
          </div>
        </div>
        <div className="mt-3">
          <span className={`text-2xl font-bold leading-none tracking-tight ${
            goalReachDate
              ? "text-teal-600"
              : goalReachLabel === "達成済み ✓"
              ? "text-emerald-500"
              : "text-slate-400"
          }`}>
            {goalReachLabel}
          </span>
        </div>
        {goalReachDate && goalWeight !== null && (
          <p className="mt-2 text-xs text-slate-400">
            {goalWeight.toFixed(1)} kg 到達の推定日
          </p>
        )}
        {!goalWeight && (
          <p className="mt-2 text-xs text-slate-300">目標体重未設定</p>
        )}
      </div>
    </div>
  );
}
