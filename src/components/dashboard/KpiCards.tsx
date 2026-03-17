"use client";

import { TrendingDown, TrendingUp, Minus, Weight, CalendarClock, Target } from "lucide-react";
import type { DailyLog } from "@/lib/supabase/types";
import type { AppSettings } from "@/lib/domain/settings";
import { calcWeightTrend } from "@/lib/utils/calcTrend";
import { toJstDateStr, calcDaysLeft, addDaysStr, dateRangeStr } from "@/lib/utils/date";
import { calcGoalReachDate } from "@/lib/utils/calcReadiness";

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

  // --- 現在体重（最新の生体重。目標到達予定の計算には使わない）---
  const currentWeight = latest?.weight ?? null;

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

  // --- 目標到達予定日（7日平均 + 14暦日回帰ベース）---
  // 現在地: 直近7暦日の体重平均（生体重ノイズに強い安定した基準点）
  // 速度  : 直近14暦日の線形回帰 slope（短期トレンドを捉えつつ単日値への依存を下げる）
  // AI 予測（NeuralProphet）はチャート側の参考表示に留め、KPI 主表示には採用しない
  const goalWeight = settings.targetWeight;

  const d7Start = addDaysStr(todayStr, -6) ?? todayStr;
  const d14Start = addDaysStr(todayStr, -13) ?? todayStr;
  const logByDate = new Map(sorted.map((l) => [l.log_date, l]));

  // 7暦日平均
  const w7 = dateRangeStr(d7Start, todayStr)
    .map((d) => logByDate.get(d)?.weight ?? null)
    .filter((v): v is number => v !== null);
  const weight_7d_avg = w7.length > 0 ? w7.reduce((a, b) => a + b, 0) / w7.length : null;

  // 14暦日回帰 slope (kg/day)
  const trend14Data = dateRangeStr(d14Start, todayStr)
    .map((d) => ({ date: d, weight: logByDate.get(d)?.weight ?? null }))
    .filter((p): p is { date: string; weight: number } => p.weight !== null);
  const slopePerDay14 = trend14Data.length >= 2 ? calcWeightTrend(trend14Data).slope : null;

  // 週あたり変化率: 14暦日回帰 slope × 7 — 週次レビューの weekly_rate_kg と同一ロジック
  const slopePerWeek = slopePerDay14 !== null ? slopePerDay14 * 7 : null;
  const trendDir: "up" | "down" | "flat" =
    slopePerWeek === null || Math.abs(slopePerWeek) < 0.05 ? "flat" : slopePerWeek > 0 ? "up" : "down";
  const trendLabel = slopePerWeek === null || Math.abs(slopePerWeek) < 0.05
    ? "横ばい"
    : `${slopePerWeek > 0 ? "+" : ""}${slopePerWeek.toFixed(2)} kg/週`;

  const goalReachResult = calcGoalReachDate(weight_7d_avg, slopePerDay14, goalWeight, todayStr);
  const goalReachDate = goalReachResult.date;
  const goalReachLabel = goalReachResult.label;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {/* 現在体重 */}
      <KpiCard
        label="現在体重"
        value={currentWeight !== null ? currentWeight.toFixed(1) : "—"}
        unit="kg"
        sub={slopePerWeek !== null ? trendLabel : undefined}
        icon={<Weight size={18} />}
        accent="bg-blue-50"
        iconColor="text-blue-600"
        trendDir={slopePerWeek !== null ? trendDir : undefined}
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
            {goalWeight.toFixed(1)} kg 到達の推定日（7日平均ベース）
          </p>
        )}
        {!goalWeight && (
          <p className="mt-2 text-xs text-slate-300">目標体重未設定</p>
        )}
      </div>
    </div>
  );
}
