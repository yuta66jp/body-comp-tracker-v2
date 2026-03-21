"use client";

import { DivergingBar } from "@/components/ui/DivergingBar";
import { getNormalizedDiffWidth } from "@/lib/utils/calorieDiff";
import {
  getBalanceBarColors,
  getBalanceTextColor,
  type CurrentPhase,
} from "@/lib/utils/energyBalance";

interface TdeeDailyRow {
  date: string;
  calories: number | null;
  tdee: number | null;
}

interface TdeeDailyTableProps {
  data: TdeeDailyRow[];
  /** settings.current_phase ("Cut" | "Bulk") — 未設定時は null */
  phase?: CurrentPhase | null;
}

export function TdeeDailyTable({ data, phase = null }: TdeeDailyTableProps) {
  const recent = [...data].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);

  // 表示14行の balance 絶対値最大値（diverging bar 正規化用）
  const maxAbs = (() => {
    const absDiffs = recent
      .filter((row): row is TdeeDailyRow & { calories: number; tdee: number } =>
        row.calories !== null && row.tdee !== null
      )
      .map((row) => Math.abs(Math.round(row.calories - row.tdee)));
    return absDiffs.length > 0 ? Math.max(...absDiffs) : 0;
  })();

  const { leftColor, rightColor } = getBalanceBarColors(phase);

  if (recent.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">日次 TDEE ログ（直近 14 日）</h2>
        <p className="text-sm text-gray-400">データがありません。</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="px-5 pt-5 pb-1">
        <h2 className="text-sm font-semibold text-gray-700">日次 TDEE ログ（直近 14 日）</h2>
      </div>

      {/* ── モバイル: カードリスト (md 未満) ── */}
      <div className="md:hidden divide-y divide-slate-50 px-4 pb-4">
        {recent.map((row) => {
          const balance =
            row.calories !== null && row.tdee !== null
              ? Math.round(row.calories - row.tdee)
              : null;
          const ratio =
            balance !== null ? getNormalizedDiffWidth(balance, maxAbs) : 0;
          const textColor =
            balance !== null
              ? getBalanceTextColor(balance, phase)
              : "text-gray-300";

          return (
            <div key={row.date} className="py-3">
              {/* 行 1: 日付 + 収支 */}
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs font-medium text-slate-600">{row.date}</span>
                <span className={`tabular-nums text-sm font-semibold ${textColor}`}>
                  {balance !== null
                    ? `${balance > 0 ? "+" : ""}${balance.toLocaleString()} kcal`
                    : "—"}
                </span>
              </div>
              {/* 行 2: TDEE + 摂取 */}
              <div className="mt-1 flex items-center gap-5 text-xs">
                <div>
                  <span className="text-slate-400">TDEE </span>
                  <span className="font-medium text-slate-700 tabular-nums">
                    {row.tdee !== null ? Math.round(row.tdee).toLocaleString() : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">摂取 </span>
                  <span className="font-medium text-slate-700 tabular-nums">
                    {row.calories !== null ? row.calories.toLocaleString() : "—"}
                  </span>
                </div>
              </div>
              {/* 行 3: Diverging bar */}
              {balance !== null && (
                <div className="mt-2">
                  <DivergingBar
                    diff={balance}
                    ratio={ratio}
                    leftColor={leftColor}
                    rightColor={rightColor}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── デスクトップ: テーブル (md+) ── */}
      <div className="hidden md:block overflow-x-auto px-5 pb-5 pt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="pb-2 pr-4 font-medium">日付</th>
              <th className="pb-2 pr-4 font-medium text-right">摂取カロリー</th>
              <th className="pb-2 pr-4 font-medium text-right">実測 TDEE</th>
              <th className="pb-2 font-medium">バランス</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((row) => {
              const balance =
                row.calories !== null && row.tdee !== null
                  ? Math.round(row.calories - row.tdee)
                  : null;
              const ratio =
                balance !== null ? getNormalizedDiffWidth(balance, maxAbs) : 0;
              const textColor =
                balance !== null
                  ? getBalanceTextColor(balance, phase)
                  : "text-gray-300";

              return (
                <tr key={row.date} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium text-gray-700">{row.date}</td>
                  <td className="py-2 pr-4 text-right text-gray-600">
                    {row.calories !== null ? row.calories.toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-600">
                    {row.tdee !== null ? Math.round(row.tdee).toLocaleString() : "—"}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-col gap-1">
                      <span className={`text-xs font-medium ${textColor}`}>
                        {balance !== null
                          ? `${balance > 0 ? "+" : ""}${balance.toLocaleString()}`
                          : "—"}
                      </span>
                      {balance !== null && (
                        <DivergingBar
                          diff={balance}
                          ratio={ratio}
                          leftColor={leftColor}
                          rightColor={rightColor}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
