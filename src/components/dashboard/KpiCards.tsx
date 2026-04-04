"use client";

import { TrendingDown, TrendingUp, Minus, Weight, CalendarClock, Target } from "lucide-react";
import type { DashboardDailyLog } from "@/lib/supabase/types";
import type { AppSettings } from "@/lib/domain/settings";
import type { GoalReachResult } from "@/lib/utils/calcReadiness";
import { calcWeightTrend } from "@/lib/utils/calcTrend";
import { toJstDateStr, calcDaysLeft, addDaysStr, dateRangeStr } from "@/lib/utils/date";

interface KpiCardsProps {
  logs: DashboardDailyLog[];
  settings: AppSettings;
  avgTdee: number | null;
  currentWeight: number | null;
  currentSeason?: string | null;
  /** 目標到達予定日の計算結果 (page.tsx で算出した共通値) */
  goalReachResult: GoalReachResult;
  /**
   * 到達予測バッファ (日数)。page.tsx で「30日線形トレンド到達日 − 大会残日数」から算出。
   * 正=余裕あり / 負=期限超過見込み / null=到達日が算出不能 (停滞中・データ不足・達成済み)
   */
  bufferDays: number | null;
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
  tag?: React.ReactNode;
}

function KpiCard({ label, value, unit, sub, icon, accent, iconColor, trendDir, trendPositive, tag }: KpiCardProps) {
  const TrendIcon = trendDir === "up" ? TrendingUp : trendDir === "down" ? TrendingDown : Minus;
  const isGood = trendDir === undefined || trendDir === "flat"
    ? null
    : trendDir === trendPositive;
  const trendColor = isGood === null ? "text-slate-400" : isGood ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      {tag && <div className="mb-2">{tag}</div>}
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent}`}>
          <span className={iconColor}>{icon}</span>
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-[2rem] font-bold leading-none tracking-tight text-slate-900 dark:text-slate-300">{value}</span>
        {unit && <span className="text-sm font-medium text-slate-400 dark:text-slate-500">{unit}</span>}
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

export function KpiCards({ logs, settings, currentWeight, currentSeason, goalReachResult, bufferDays }: KpiCardsProps) {
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const isCut = settings.currentPhase !== "Bulk";
  const deadlineLabel = isCut ? "大会日" : "目標日";

  // --- 基準日 (todayStr) ---
  // 以降の全暦日計算で共通して使う。JST 固定で UTC サーバー上でもズレない。
  const todayStr = toJstDateStr();

  // --- 残り日数 + 残り週数 ---
  // calcDaysLeft を使い GoalNavigator / calcReadiness と定義を統一する。
  const contestDate = settings.contestDate;
  const daysLeft = contestDate ? calcDaysLeft(todayStr, contestDate) : null;
  const weeksLeft =
    daysLeft !== null && daysLeft > 0 ? (daysLeft / 7).toFixed(1) : null;

  // --- 現在体重カードの週次トレンド表示 (14暦日回帰) ---
  // 目標到達予定日の計算 (7日平均 + 30日回帰) は page.tsx で一元計算した goalReachResult を使う
  const goalWeight = settings.targetWeight;

  const d14Start = addDaysStr(todayStr, -13) ?? todayStr;
  const logByDate = new Map(sorted.map((l) => [l.log_date, l]));

  // 14暦日回帰 slope (kg/day) — 現在体重カードの週次トレンド表示用（敏感さを残す）
  const trend14Data = dateRangeStr(d14Start, todayStr)
    .map((d) => ({ date: d, weight: logByDate.get(d)?.weight ?? null }))
    .filter((p): p is { date: string; weight: number } => p.weight !== null);
  const slopePerDay14 = trend14Data.length >= 2 ? calcWeightTrend(trend14Data).slope : null;

  // 週あたり変化率: 14暦日回帰 slope × 7 — 現在体重カードの直近変化表示（感度優先）
  const slopePerWeek = slopePerDay14 !== null ? slopePerDay14 * 7 : null;
  const trendDir: "up" | "down" | "flat" =
    slopePerWeek === null || Math.abs(slopePerWeek) < 0.05 ? "flat" : slopePerWeek > 0 ? "up" : "down";
  const trendLabel = slopePerWeek === null || Math.abs(slopePerWeek) < 0.05
    ? "横ばい"
    : `${slopePerWeek > 0 ? "+" : ""}${slopePerWeek.toFixed(1)} kg/週`;

  const goalReachDate = goalReachResult.date;
  const goalReachLabel = goalReachResult.label;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {/* 現在体重 */}
      <KpiCard
        label="現在体重"
        value={currentWeight !== null ? currentWeight.toFixed(1) : "—"}
        unit="kg"
        sub={slopePerWeek !== null ? trendLabel : undefined}
        icon={<Weight size={18} />}
        accent="bg-blue-50 dark:bg-blue-900/30"
        iconColor="text-blue-600 dark:text-blue-400"
        trendDir={slopePerWeek !== null ? trendDir : undefined}
        trendPositive={isCut ? "down" : "up"}
      />

      {/* 残り日数 + 残り週数 */}
      <KpiCard
        label="残り日数"
        value={
          daysLeft === null ? "—"
          : daysLeft < 0 ? "終了済"
          : daysLeft.toLocaleString()
        }
        unit={daysLeft !== null && daysLeft >= 0 ? "日" : undefined}
        sub={
          daysLeft === null ? `${deadlineLabel}未設定`
          : daysLeft < 0 ? `${contestDate} 終了`
          : daysLeft === 0 ? `本日が${deadlineLabel}`
          : weeksLeft !== null ? `${weeksLeft} 週 / ${contestDate}`
          : contestDate
        }
        icon={<CalendarClock size={18} />}
        accent="bg-violet-50 dark:bg-violet-900/30"
        iconColor="text-violet-600 dark:text-violet-400"
        tag={
          currentSeason ? (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">
              大会: {currentSeason.replace(/_/g, " ")}
            </span>
          ) : undefined
        }
      />

      {/* 目標到達予定日 */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">目標到達予定</p>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-900/30">
            <Target size={18} className="text-teal-600 dark:text-teal-400" />
          </div>
        </div>
        <div className="mt-3">
          <span className={`text-2xl font-bold leading-none tracking-tight ${
            goalReachDate
              ? "text-teal-600 dark:text-teal-400"
              : goalReachLabel === "達成済み ✓"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-400"
          }`}>
            {goalReachLabel}
          </span>
        </div>
        {goalReachDate && goalWeight !== null && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            {goalWeight.toFixed(1)} kg 到達の推定日（7日平均 + 30日トレンド）
          </p>
        )}
        {goalReachDate && bufferDays !== null && (
          <p className={`mt-1 text-xs font-medium ${
            bufferDays >= 14
              ? "text-emerald-600 dark:text-emerald-400"
              : bufferDays >= 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-rose-600 dark:text-rose-400"
          }`}>
            バッファ {bufferDays >= 0 ? `+${bufferDays} 日` : `▲${Math.abs(bufferDays)} 日不足`}
          </p>
        )}
        {!goalWeight && (
          <p className="mt-2 text-xs text-slate-300 dark:text-slate-600">目標体重未設定</p>
        )}
      </div>
    </div>
  );
}
