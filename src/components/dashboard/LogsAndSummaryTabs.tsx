"use client";

import { useState } from "react";
import { RecentLogsTable } from "./RecentLogsTable";
import { SeasonSummary } from "@/components/history/SeasonSummary";
import type { DailyLog } from "@/lib/supabase/types";
import type { MonthStats } from "@/components/history/SeasonSummary";

interface LogsAndSummaryTabsProps {
  logs: DailyLog[];
  monthStats: MonthStats[];
  seasonMap?: Map<string, string>;
  currentSeason?: string | null;
}

type Tab = "logs" | "monthly";

export function LogsAndSummaryTabs({ logs, monthStats, seasonMap, currentSeason }: LogsAndSummaryTabsProps) {
  const [tab, setTab] = useState<Tab>("logs");

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex border-b border-slate-100">
        {(["logs", "monthly"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-5 py-3.5 text-sm font-semibold transition-colors ${
              tab === t
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t === "logs" ? "直近ログ" : "月別サマリー"}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "logs" ? (
          <RecentLogsTable logs={logs} embedded seasonMap={seasonMap} currentSeason={currentSeason} />
        ) : (
          monthStats.length > 0
            ? <SeasonSummary stats={monthStats} />
            : <p className="py-6 text-center text-sm text-slate-400">データがありません</p>
        )}
      </div>
    </div>
  );
}
