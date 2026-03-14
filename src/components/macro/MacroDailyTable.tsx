"use client";

import { DivergingBar } from "@/components/ui/DivergingBar";
import { getNormalizedDiffWidth } from "@/lib/utils/calorieDiff";

interface DailyRow {
  fullDate: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface MacroDailyTableProps {
  data: DailyRow[];
  /** settings.target_calories_kcal — 未設定時は null（差分表示・バーなし） */
  calTarget?: number | null;
}

function pct(macro_g: number, total_kcal: number, multiplier: number) {
  if (!total_kcal) return "—";
  return `${Math.round((macro_g * multiplier / total_kcal) * 100)}%`;
}

export function MacroDailyTable({ data, calTarget = null }: MacroDailyTableProps) {
  const recent = [...data].sort((a, b) => b.fullDate.localeCompare(a.fullDate)).slice(0, 14);

  // diverging bar 正規化用: 表示14行の diff 絶対値最大値
  const maxAbs = (() => {
    if (calTarget == null) return 0;
    const absDiffs = recent.map((row) => Math.abs(row.calories - calTarget));
    return absDiffs.length > 0 ? Math.max(...absDiffs) : 0;
  })();

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-700">日次栄養内訳（直近 14 日）</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="pb-2 pr-4 font-medium">日付</th>
              <th className="pb-2 pr-4 font-medium">カロリー</th>
              <th className="pb-2 pr-4 font-medium text-right">P (g / %)</th>
              <th className="pb-2 pr-4 font-medium text-right">F (g / %)</th>
              <th className="pb-2 font-medium text-right">C (g / %)</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((row) => {
              const calDiff = calTarget != null ? row.calories - calTarget : null;
              const calRatio = calDiff !== null ? getNormalizedDiffWidth(calDiff, maxAbs) : 0;
              return (
                <tr key={row.fullDate} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium text-gray-700">{row.fullDate}</td>
                  <td className="py-2 pr-4">
                    {/* テキスト: 実績値 + 差分 */}
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-gray-600">{row.calories.toLocaleString()}</span>
                      <span className="text-[10px] text-gray-400">kcal</span>
                      {calDiff !== null && (
                        <span
                          className={`text-[10px] font-medium ${
                            calDiff > 0
                              ? "text-blue-500"
                              : calDiff < 0
                              ? "text-rose-500"
                              : "text-gray-400"
                          }`}
                        >
                          ({calDiff > 0 ? "+" : ""}{Math.round(calDiff)})
                        </span>
                      )}
                    </div>
                    {/* diverging bar（目標設定時のみ） */}
                    {calDiff !== null && (
                      <div className="mt-1">
                        <DivergingBar
                          diff={calDiff}
                          ratio={calRatio}
                          leftColor="bg-rose-400"
                          rightColor="bg-blue-400"
                        />
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right text-xs text-gray-600">
                    {row.protein}g <span className="text-gray-400">({pct(row.protein, row.calories, 4)})</span>
                  </td>
                  <td className="py-2 pr-4 text-right text-xs text-gray-600">
                    {row.fat}g <span className="text-gray-400">({pct(row.fat, row.calories, 9)})</span>
                  </td>
                  <td className="py-2 text-right text-xs text-gray-600">
                    {row.carbs}g <span className="text-gray-400">({pct(row.carbs, row.calories, 4)})</span>
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
