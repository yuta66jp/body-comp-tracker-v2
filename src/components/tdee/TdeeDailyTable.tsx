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

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">日次 TDEE ログ（直近 14 日）</h2>
      <div className="overflow-x-auto">
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
                      {/* 数値テキスト */}
                      <span className={`text-xs font-medium ${textColor}`}>
                        {balance !== null
                          ? `${balance > 0 ? "+" : ""}${balance.toLocaleString()}`
                          : "—"}
                      </span>
                      {/* diverging bar（balance がある行のみ） */}
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
