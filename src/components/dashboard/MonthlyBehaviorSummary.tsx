"use client";

import type { MonthlyBehaviorStats } from "@/lib/utils/calcMonthlyBehaviorStats";
import {
  sortedTrainingEntries,
  sortedWorkModeEntries,
} from "@/lib/utils/calcMonthlyBehaviorStats";
import { TRAINING_TYPE_LABELS, WORK_MODE_LABELS } from "@/lib/utils/trainingType";
import { DAY_TAG_LABELS } from "@/lib/utils/dayTags";

interface MonthlyBehaviorSummaryProps {
  stats: MonthlyBehaviorStats[];
}

/** training_type の短縮ラベル (テーブルセル内の省スペース表示用) */
const TRAINING_SHORT_LABELS: Record<string, string> = {
  off:               "オフ",
  chest:             "胸",
  back:              "背",
  shoulders:         "肩",
  glutes_hamstrings: "ハム",
  quads:             "四頭",
};

/** work_mode の短縮ラベル */
const WORK_SHORT_LABELS: Record<string, string> = {
  off:    "休",
  office: "出社",
  remote: "在宅",
};

/** flags の短縮ラベル */
const FLAG_SHORT_LABELS: Record<string, string> = {
  is_cheat_day:  "チート",
  is_refeed_day: "リフィード",
  is_eating_out: "外食",
  is_travel_day: "旅行",
};

const FLAG_KEYS = [
  "is_cheat_day",
  "is_refeed_day",
  "is_eating_out",
  "is_travel_day",
] as const;

export function MonthlyBehaviorSummary({ stats }: MonthlyBehaviorSummaryProps) {
  if (stats.length === 0) return null;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        行動・生活サマリー
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-max w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-left dark:border-slate-700">
              <th className="pb-2 pr-3 font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">月</th>
              <th className="pb-2 pr-3 text-right font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">便通</th>
              <th className="pb-2 pr-3 font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">トレーニング</th>
              <th className="pb-2 pr-3 font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">仕事</th>
              <th className="pb-2 font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">特殊日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
            {stats.map((s) => {
              const trainingEntries = sortedTrainingEntries(s.trainingCounts);
              const workEntries = sortedWorkModeEntries(s.workModeCounts);
              const flagEntries = FLAG_KEYS.filter(
                (k) => s.flagCounts[k] > 0,
              );

              return (
                <tr key={s.month} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800">
                  {/* 月 */}
                  <td className="py-2.5 pr-3 font-mono font-medium text-slate-600 whitespace-nowrap dark:text-slate-300">
                    {s.month}
                  </td>

                  {/* 便通 */}
                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600 whitespace-nowrap dark:text-slate-300">
                    {s.bowelDays > 0 ? (
                      <span className="font-semibold text-teal-700 dark:text-teal-400">{s.bowelDays}日</span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>

                  {/* トレーニング */}
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                    {trainingEntries.length > 0 ? (
                      <span className="flex flex-nowrap gap-x-2">
                        {trainingEntries.map(({ type, count }) => (
                          <span key={type} className="whitespace-nowrap tabular-nums">
                            <span className="text-slate-400 dark:text-slate-500">
                              {TRAINING_SHORT_LABELS[type] ?? TRAINING_TYPE_LABELS[type]}
                            </span>
                            <span className="ml-0.5 font-semibold text-slate-600 dark:text-slate-300">{count}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>

                  {/* 仕事モード */}
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                    {workEntries.length > 0 ? (
                      <span className="flex flex-nowrap gap-x-2">
                        {workEntries.map(({ mode, count }) => (
                          <span key={mode} className="whitespace-nowrap tabular-nums">
                            <span className="text-slate-400 dark:text-slate-500">
                              {WORK_SHORT_LABELS[mode] ?? WORK_MODE_LABELS[mode]}
                            </span>
                            <span className="ml-0.5 font-semibold text-slate-600 dark:text-slate-300">{count}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>

                  {/* 特殊日 */}
                  <td className="py-2.5 text-slate-600 dark:text-slate-300">
                    {flagEntries.length > 0 ? (
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {flagEntries.map((k) => (
                          <span key={k} className="whitespace-nowrap tabular-nums">
                            <span className="text-slate-400 dark:text-slate-500">
                              {FLAG_SHORT_LABELS[k] ?? DAY_TAG_LABELS[k]}
                            </span>
                            <span className="ml-0.5 font-semibold text-slate-600 dark:text-slate-300">
                              {s.flagCounts[k]}
                            </span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
        ※ 未記録日は集計対象外。トレーニング・仕事モードの「—」は当月に有効な記録がないことを示す。
      </p>
    </div>
  );
}
