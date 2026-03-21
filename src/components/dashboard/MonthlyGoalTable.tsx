"use client";

import type { MonthlyGoalComparisonRow, MonthlyPlanProgressState } from "@/lib/utils/monthlyGoalVisualization";

interface MonthlyGoalTableProps {
  rows: MonthlyGoalComparisonRow[];
  /** "Cut" | "Bulk" — 差分の色付け方向を決定する */
  phase: string;
}

/** 差分 (diffKg) の表示色を phase に応じて返す。
 *  Cut: 正 = 遅れ(rose), 負 = 先行(emerald)
 *  Bulk: 正 = 先行(emerald), 負 = 遅れ(rose)
 */
function diffColor(diffKg: number | null, isCut: boolean): string {
  if (diffKg === null) return "text-slate-300";
  if (Math.abs(diffKg) < 0.05) return "text-slate-500";
  const isBehind = isCut ? diffKg > 0 : diffKg < 0;
  return isBehind ? "text-rose-500" : "text-emerald-600";
}

/** progressState のバッジ表示 */
function ProgressBadge({ state }: { state: MonthlyPlanProgressState }) {
  if (state === "pending") {
    return <span className="text-slate-300">—</span>;
  }
  if (state === "on_track") {
    return (
      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
        計画内
      </span>
    );
  }
  if (state === "ahead") {
    return (
      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">
        先行
      </span>
    );
  }
  // "behind"
  return (
    <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold text-rose-500">
      遅れ
    </span>
  );
}

export function MonthlyGoalTable({ rows, phase }: MonthlyGoalTableProps) {
  if (rows.length === 0) return null;

  const isCut = phase !== "Bulk";
  const hasPartial = rows.some((r) => r.isPartialActual);

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left">
              <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">月次計画 vs 実績</th>
              {/* 月初体重: sm 以上のみ表示 */}
              <th className="hidden sm:table-cell pb-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">月初体重</th>
              <th className="pb-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">月末目標</th>
              <th className="pb-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">実績月末</th>
              <th className="pb-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">差分</th>
              <th className="pb-2 pr-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">状態</th>
              <th className="pb-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">累積ズレ</th>
              {/* 翌月必要: sm 以上のみ表示 */}
              <th className="hidden sm:table-cell pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">翌月必要</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => {
              const rowBg = row.isCurrentMonth
                ? "bg-blue-50/40"
                : "";
              return (
                <tr key={row.month} className={`transition-colors hover:bg-slate-50/70 ${rowBg}`}>
                  {/* 月 */}
                  <td className="py-2 pr-3 font-mono text-xs font-medium text-slate-600">
                    {row.month}
                    {row.isCurrentMonth && (
                      <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-600">
                        今月
                      </span>
                    )}
                  </td>
                  {/* 月初体重 (sm 以上) */}
                  <td className="hidden sm:table-cell py-2 pr-3 text-right text-xs text-slate-500">
                    {row.monthStartWeight !== null
                      ? `${row.monthStartWeight.toFixed(1)} kg`
                      : "—"}
                  </td>
                  {/* 月末目標 */}
                  <td className="py-2 pr-3 text-right text-xs font-semibold text-slate-700">
                    {row.monthEndTarget.toFixed(1)} kg
                  </td>
                  {/* 実績月末 */}
                  <td className="py-2 pr-3 text-right text-xs font-semibold text-slate-700">
                    {row.isFutureMonth ? (
                      <span className="font-normal text-slate-300">—</span>
                    ) : row.actualMonthEndWeight !== null ? (
                      <>
                        {row.actualMonthEndWeight.toFixed(1)} kg
                        {row.isPartialActual && (
                          <span className="ml-0.5 text-[9px] font-normal text-slate-400">*</span>
                        )}
                      </>
                    ) : (
                      <span className="font-normal text-slate-300">—</span>
                    )}
                  </td>
                  {/* 差分 */}
                  <td className={`py-2 pr-3 text-right text-xs font-semibold tabular-nums ${diffColor(row.diffKg, isCut)}`}>
                    {row.diffKg !== null
                      ? `${row.diffKg > 0 ? "+" : ""}${row.diffKg.toFixed(2)}`
                      : "—"}
                  </td>
                  {/* 状態 */}
                  <td className="py-2 pr-3 text-center text-xs">
                    <ProgressBadge state={row.progressState} />
                  </td>
                  {/* 累積ズレ */}
                  <td className={`py-2 pr-3 text-right text-xs tabular-nums ${diffColor(row.cumulativeGapKg, isCut)}`}>
                    {row.cumulativeGapKg !== null
                      ? `${row.cumulativeGapKg > 0 ? "+" : ""}${row.cumulativeGapKg.toFixed(2)}`
                      : "—"}
                  </td>
                  {/* 翌月必要変化量 (sm 以上) */}
                  <td className="hidden sm:table-cell py-2 text-right text-xs tabular-nums text-slate-500">
                    {row.nextRequiredDeltaKg !== null
                      ? `${row.nextRequiredDeltaKg > 0 ? "+" : ""}${row.nextRequiredDeltaKg.toFixed(1)} kg`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasPartial && (
          <p className="mt-1.5 text-[10px] text-slate-400">
            * 当月は月末未到達のため直近実測値を表示
          </p>
        )}
      </div>
    </div>
  );
}
