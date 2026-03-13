"use client";

import { TrendingDown, TrendingUp, Minus, Weight, Flame, CalendarClock, Zap, Target } from "lucide-react";
import type { DailyLog } from "@/lib/supabase/types";
import { calcWeightTrend } from "@/lib/utils/calcTrend";
import { toJstDateStr, calcDaysLeft, addDaysStr } from "@/lib/utils/date";

const KCAL_PER_KG = 7200;

interface KpiCardsProps {
  logs: DailyLog[];
  settings: Record<string, number | string | null>;
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

export function KpiCards({ logs, settings, avgTdee }: KpiCardsProps) {
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

  // --- 平均カロリー (7日) ---
  const last7cal = sorted.slice(-7).filter((d) => d.calories !== null);
  const avgCalories = last7cal.length > 0
    ? last7cal.reduce((s, d) => s + d.calories!, 0) / last7cal.length
    : null;

  // --- 残り日数 ---
  // calcDaysLeft を使い GoalNavigator / calcReadiness と定義を統一する。
  // (旧実装: new Date(contestDate).getTime() - Date.now() は UTC 解釈のため
  //  JST 00:00〜08:59 に大会当日を "1日前" と誤表示するバグがあった)
  const contestDate = typeof settings["contest_date"] === "string" ? settings["contest_date"] : null;
  const todayStr = toJstDateStr();
  const daysLeft = contestDate ? calcDaysLeft(todayStr, contestDate) : null;

  // --- 目標到達予定日（線形トレンドから算出）---
  const goalWeight = typeof settings["goal_weight"] === "number" ? settings["goal_weight"] : null;
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

  // --- 推奨カロリー調整 ---
  const phase = typeof settings["current_phase"] === "string" ? settings["current_phase"] : "Cut";
  const isCut = phase !== "Bulk";

  const gap = currentWeight !== null && goalWeight !== null ? currentWeight - goalWeight : null;

  let actionValue = "Keep";
  let actionSub = "On Track";
  let actionColor = "text-emerald-500";

  if (gap !== null && daysLeft !== null) {
    const adj = Math.round((Math.abs(gap) * KCAL_PER_KG) / daysLeft);
    if (isCut) {
      if (gap > 0.2) {
        actionValue = `-${adj.toLocaleString()} kcal`;
        actionSub = "もっと絞って";
        actionColor = "text-rose-500";
      } else if (gap <= 0) {
        actionValue = "目標達成!";
        actionSub = "維持フェーズ";
        actionColor = "text-blue-500";
      } else {
        actionValue = "Keep";
        actionSub = "順調";
        actionColor = "text-emerald-500";
      }
    } else {
      if (gap < -0.5) {
        actionValue = `+${adj.toLocaleString()} kcal`;
        actionSub = "もっと食べて";
        actionColor = "text-amber-500";
      } else if (gap > 0.5) {
        actionValue = `-${adj.toLocaleString()} kcal`;
        actionSub = "ペースダウン";
        actionColor = "text-rose-500";
      } else {
        actionValue = "Keep";
        actionSub = "順調";
        actionColor = "text-emerald-500";
      }
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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

      {/* 平均カロリー + TDEE */}
      <KpiCard
        label="平均カロリー 7日"
        value={avgCalories !== null ? Math.round(avgCalories).toLocaleString() : "—"}
        unit="kcal"
        sub={
          avgTdee !== null ? (
            <span>
              TDEE <span className="font-semibold text-orange-500">{Math.round(avgTdee).toLocaleString()}</span> kcal
              {avgCalories !== null && (
                <span className={avgCalories - avgTdee < 0 ? " text-emerald-500" : " text-rose-500"}>
                  {" "}({avgCalories - avgTdee < 0 ? "" : "+"}{Math.round(avgCalories - avgTdee)} kcal)
                </span>
              )}
            </span>
          ) : undefined
        }
        icon={<Flame size={18} />}
        accent="bg-orange-50"
        iconColor="text-orange-500"
      />

      {/* 残り日数 */}
      <KpiCard
        label="残り日数"
        value={daysLeft !== null ? daysLeft.toLocaleString() : "—"}
        unit={daysLeft !== null ? "日" : ""}
        sub={contestDate ?? "コンテスト日未設定"}
        icon={<CalendarClock size={18} />}
        accent="bg-violet-50"
        iconColor="text-violet-600"
      />

      {/* 推奨カロリー調整 */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">推奨調整</p>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
            <Zap size={18} className="text-emerald-600" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className={`text-2xl font-bold leading-none tracking-tight ${actionColor}`}>
            {actionValue}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-xs font-medium ${actionColor}`}>{actionSub}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            isCut ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
          }`}>
            {phase}
          </span>
        </div>
      </div>

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
