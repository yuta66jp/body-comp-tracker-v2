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
 * 詳細（条件メモ・Google Health 指標など）は secondary として小さく添える。
 */

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { DashboardDailyLog } from "@/lib/supabase/types";
import { DAY_TAGS, DAY_TAG_LABELS, DAY_TAG_BADGE_COLORS } from "@/lib/utils/dayTags";
import { formatConditionSummary } from "@/lib/utils/trainingType";
import { computeWeightDelta, buildRecentLogArrays } from "@/lib/utils/recentLogsUtils";
import {
  buildGoogleHealthDailyMetricMap,
  formatGoogleHealthDailyMetricLine,
  type GoogleHealthDailyMetricForDisplay,
} from "@/lib/googleHealth/displayMetrics";

interface RecentLogsCardsProps {
  logs: DashboardDailyLog[];
  googleHealthMetrics?: GoogleHealthDailyMetricForDisplay[];
  seasonMap?: Map<string, string>;
  currentSeason?: string | null;
}

export function RecentLogsCards({ logs, googleHealthMetrics = [], seasonMap, currentSeason }: RecentLogsCardsProps) {
  const { sorted, ascending } = buildRecentLogArrays(logs);
  const googleHealthMetricByDate = buildGoogleHealthDailyMetricMap(googleHealthMetrics);

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
                const firstLine = [
                  conditionSummary,
                ]
                  .filter(Boolean)
                  .join(" / ");
                const googleHealthLine = formatGoogleHealthDailyMetricLine(
                  googleHealthMetricByDate.get(log.log_date),
                );
                if (!firstLine && googleHealthLine === "データなし") return null;
                return (
                  <div className="mt-0.5 space-y-0.5 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
                    {firstLine && (
                      <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-x-1">
                        <span>日次ログ:</span>
                        <span>{firstLine}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-x-1">
                      <span>Google Health:</span>
                      <span>{googleHealthLine}</span>
                    </div>
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
