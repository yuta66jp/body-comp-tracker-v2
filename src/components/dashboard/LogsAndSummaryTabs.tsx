"use client";

import { useState } from "react";
import { RecentLogsTable } from "./RecentLogsTable";
import { RecentLogsCards } from "./RecentLogsCards";
import { MonthlyCalendar } from "./MonthlyCalendar";
import { MonthlyGoalTable } from "./MonthlyGoalTable";
import { MonthlyBehaviorSummary } from "./MonthlyBehaviorSummary";
import { SeasonSummary } from "@/components/history/SeasonSummary";
import type { DashboardDailyLog, SleepSession } from "@/lib/supabase/types";
import type { GoogleHealthDailyMetricForDisplay } from "@/lib/googleHealth/displayMetrics";
import type { MonthStats } from "@/components/history/SeasonSummary";
import type { MonthlyGoalComparisonRow } from "@/lib/utils/monthlyGoalVisualization";
import type { MonthlyBehaviorStats } from "@/lib/utils/calcMonthlyBehaviorStats";

interface LogsAndSummaryTabsProps {
  logs: DashboardDailyLog[];
  sleepSessions?: Pick<SleepSession, "wake_date" | "wake_at" | "bed_at">[];
  googleHealthMetrics?: GoogleHealthDailyMetricForDisplay[];
  monthStats: MonthStats[];
  seasonMap?: Map<string, string>;
  currentSeason?: string | null;
  /** 月次計画 vs 実績の比較行 (buildMonthlyGoalComparisonRows の結果) */
  monthlyGoalSummaryRows?: MonthlyGoalComparisonRow[];
  /** "Cut" | "Bulk" — MonthlyGoalTable の差分色分けに使用 */
  phase?: string;
  /** 月別行動・生活集計 (calcMonthlyBehaviorStats の結果) */
  monthlyBehaviorStats?: MonthlyBehaviorStats[];
}

type Tab = "logs" | "calendar" | "monthly";

const TAB_LABELS: Record<Tab, string> = {
  logs:     "直近ログ",
  calendar: "カレンダー",
  monthly:  "月別",
};

export function LogsAndSummaryTabs({ logs, sleepSessions = [], googleHealthMetrics = [], monthStats, seasonMap, currentSeason, monthlyGoalSummaryRows, phase, monthlyBehaviorStats }: LogsAndSummaryTabsProps) {
  const [tab, setTab] = useState<Tab>("logs");

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <div role="tablist" className="flex border-b border-slate-100 dark:border-slate-700">
        {(["logs", "calendar", "monthly"] as Tab[]).map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-3.5 text-sm font-semibold transition-colors ${
              tab === t
                ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        {tab === "logs" && (
          <div role="tabpanel" id="panel-logs" aria-labelledby="tab-logs">
            {/* モバイル: カードリスト。sm+ ではテーブル表示に切り替え */}
            <div className="sm:hidden">
              <RecentLogsCards logs={logs} sleepSessions={sleepSessions} googleHealthMetrics={googleHealthMetrics} seasonMap={seasonMap} currentSeason={currentSeason} />
            </div>
            <div className="hidden sm:block">
              <RecentLogsTable logs={logs} sleepSessions={sleepSessions} googleHealthMetrics={googleHealthMetrics} embedded seasonMap={seasonMap} currentSeason={currentSeason} />
            </div>
          </div>
        )}
        {tab === "calendar" && (
          <div role="tabpanel" id="panel-calendar" aria-labelledby="tab-calendar">
            <MonthlyCalendar logs={logs} sleepSessions={sleepSessions} googleHealthMetrics={googleHealthMetrics} />
          </div>
        )}
        {tab === "monthly" && (
          <div role="tabpanel" id="panel-monthly" aria-labelledby="tab-monthly">
            {/* 過去の実績（昇順: 古い月から新しい月へ）*/}
            {monthStats.length > 0
              ? <SeasonSummary stats={[...monthStats].reverse()} />
              : !monthlyGoalSummaryRows?.length && (
                  <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">データがありません</p>
                )
            }
            {/* 月次計画 vs 実績 */}
            {monthlyGoalSummaryRows && monthlyGoalSummaryRows.length > 0 && (
              <div className="mt-5">
                <MonthlyGoalTable rows={monthlyGoalSummaryRows} phase={phase ?? "Cut"} />
              </div>
            )}
            {/* 月別行動・生活サマリー（昇順: 古い月から新しい月へ）*/}
            {monthlyBehaviorStats && monthlyBehaviorStats.length > 0 && (
              <MonthlyBehaviorSummary stats={[...monthlyBehaviorStats].reverse()} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
