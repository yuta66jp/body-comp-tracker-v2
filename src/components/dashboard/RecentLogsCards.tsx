"use client";

/**
 * RecentLogsCards — 直近ログのモバイル向けカードリスト表示
 *
 * RecentLogsTable はデスクトップ用の横スクロール table。
 * このコンポーネントはモバイルで各行を縦積みカードとして表示し、
 * 日付・体重・カロリーの要点を視認しやすくする。
 *
 * 表示情報を意図的に絞る:
 *   - 日付（font-mono）+ シーズン・タグバッジ
 *   - 体重 + 前日比
 *   - カロリー
 * 詳細（条件メモ・sleep_hours など）は secondary として小さく添える。
 */

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { DashboardDailyLog, SleepSession } from "@/lib/supabase/types";
import { extractJstHHMM } from "@/lib/utils/sleepSession";
import { DAY_TAGS, DAY_TAG_LABELS, DAY_TAG_BADGE_COLORS } from "@/lib/utils/dayTags";
import { formatConditionSummary } from "@/lib/utils/trainingType";
import { computeWeightDelta, buildRecentLogArrays } from "@/lib/utils/recentLogsUtils";
import { calcFastingHours } from "@/lib/utils/calendarUtils";
import { addDaysStr } from "@/lib/utils/date";

interface RecentLogsCardsProps {
  logs: DashboardDailyLog[];
  sleepSessions?: Pick<SleepSession, "wake_date" | "wake_at">[];
  seasonMap?: Map<string, string>;
  currentSeason?: string | null;
}

export function RecentLogsCards({ logs, sleepSessions = [], seasonMap, currentSeason }: RecentLogsCardsProps) {
  const { sorted, ascending } = buildRecentLogArrays(logs);
  // 断食時間算出用: 日付 → ログ の高速参照テーブル（前日 D-1 の last_meal_end_time を参照するため）
  const logByDate = new Map(ascending.map((l) => [l.log_date, l]));
  // 断食時間算出用: wake_date → wake_at (JST HH:MM) の高速参照テーブル
  const wakeTimeByDate = new Map(
    sleepSessions
      .map((s) => [s.wake_date, extractJstHHMM(s.wake_at)] as [string, string | null])
      .filter((entry): entry is [string, string] => entry[1] !== null)
  );

  if (sorted.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">ログがありません</p>
    );
  }

  return (
    <div className="divide-y divide-slate-50 dark:divide-slate-700/60">
      {sorted.map((log) => {
        const delta = computeWeightDelta(ascending, log);
        const DeltaIcon =
          delta === null ? null : delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
        const season = seasonMap?.get(log.log_date) ?? currentSeason;
        const conditionSummary = formatConditionSummary({
          had_bowel_movement: log.had_bowel_movement as boolean | null,
          training_type: log.training_type,
          work_mode: log.work_mode,
        });

        return (
          <div
            key={log.log_date}
            className="flex items-start justify-between gap-3 py-3"
          >
            {/* 左: 日付 + バッジ */}
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs font-medium text-slate-600 dark:text-slate-300">
                {log.log_date}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {season && (
                  <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-blue-500 dark:bg-blue-900/30 dark:text-blue-400">
                    {season}
                  </span>
                )}
                {DAY_TAGS.filter((tag) => log[tag]).map((tag) => (
                  <span
                    key={tag}
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${DAY_TAG_BADGE_COLORS[tag]}`}
                  >
                    {DAY_TAG_LABELS[tag]}
                  </span>
                ))}
              </div>
              {(() => {
                const prevDate    = addDaysStr(log.log_date, -1);
                const prevDayLog  = prevDate ? (logByDate.get(prevDate) ?? null) : null;
                const wakeUpTime  = wakeTimeByDate.get(log.log_date) ?? null;
                const fastingHours = calcFastingHours(prevDayLog?.last_meal_end_time, wakeUpTime);
                if (!conditionSummary && log.sleep_hours === null && fastingHours === null) return null;
                return (
                  <div className="mt-0.5 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
                    {[
                      conditionSummary,
                      log.sleep_hours !== null ? `睡眠${log.sleep_hours}h` : null,
                      fastingHours !== null ? `断食${fastingHours % 1 === 0 ? fastingHours.toFixed(0) : fastingHours.toFixed(1)}h` : null,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </div>
                );
              })()}
            </div>

            {/* 右: 体重 + カロリー */}
            <div className="flex-shrink-0 text-right">
              <div className="flex items-baseline justify-end gap-1">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {log.weight?.toFixed(1)}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">kg</span>
                {delta !== null && DeltaIcon && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                      delta > 0
                        ? "text-rose-500"
                        : delta < 0
                        ? "text-blue-500"
                        : "text-slate-300 dark:text-slate-600"
                    }`}
                  >
                    <DeltaIcon size={11} />
                    {Math.abs(delta).toFixed(1)}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">
                {log.calories !== null ? (
                  <>
                    {log.calories.toLocaleString()}
                    <span className="ml-0.5 text-[10px] text-slate-400 dark:text-slate-500">kcal</span>
                  </>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
