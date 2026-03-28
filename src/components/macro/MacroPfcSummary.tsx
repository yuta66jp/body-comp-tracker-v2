"use client";

import type { PfcKcalRatio } from "@/lib/utils/calcMacro";

interface MacroPfcSummaryProps {
  ratio: PfcKcalRatio | null;
}

interface BarSegment {
  label: string;
  pct: number;
  kcal: number;
  color: string;
  textColor: string;
}

function pfcInterpretation(ratio: PfcKcalRatio): string {
  const { proteinPct, fatPct, carbsPct } = ratio;
  if (proteinPct >= 30 && fatPct <= 30) return "高タンパク・低脂質バランス";
  if (proteinPct < 20) return "タンパク質がやや低め";
  if (fatPct > 40) return "脂質が高め";
  if (carbsPct > 55) return "炭水化物寄り";
  return "バランス良好";
}

export function MacroPfcSummary({ ratio }: MacroPfcSummaryProps) {
  if (!ratio) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <h2 className="mb-2 text-base font-semibold text-gray-700 dark:text-slate-200">今週の PFC 比率</h2>
        <p className="text-sm text-gray-400 dark:text-slate-500">データ不足のため表示できません（P/F/C いずれかが未入力）</p>
      </div>
    );
  }

  const segments: BarSegment[] = [
    { label: "P", pct: ratio.proteinPct, kcal: ratio.proteinKcal, color: "bg-blue-500 dark:bg-blue-500/75",    textColor: "text-blue-600" },
    { label: "F", pct: ratio.fatPct,     kcal: ratio.fatKcal,     color: "bg-amber-400 dark:bg-amber-400/75",  textColor: "text-amber-600" },
    { label: "C", pct: ratio.carbsPct,   kcal: ratio.carbsKcal,   color: "bg-emerald-500 dark:bg-emerald-500/75", textColor: "text-emerald-600" },
  ];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-gray-700 dark:text-slate-200">今週の PFC 比率</h2>
        <span className="text-xs text-gray-400 dark:text-slate-500">PFC由来 {ratio.totalKcal.toLocaleString()} kcal 基準</span>
      </div>

      {/* 積み上げバー */}
      <div className="flex h-6 w-full overflow-hidden rounded-full">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} flex items-center justify-center transition-all`}
            style={{ width: `${seg.pct}%` }}
          >
            {seg.pct >= 10 && (
              <span className="text-xs font-bold text-white">{seg.pct}%</span>
            )}
          </div>
        ))}
      </div>

      {/* 凡例 */}
      <div className="mt-3 flex flex-wrap gap-4">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div className={`h-3 w-3 rounded-sm ${seg.color}`} />
            <span className="text-xs text-gray-600 dark:text-slate-300">
              {seg.label === "P" ? "タンパク質" : seg.label === "F" ? "脂質" : "炭水化物"}
              {" "}<span className={`font-semibold ${seg.textColor}`}>{seg.pct}%</span>
              <span className="ml-1 text-gray-400 dark:text-slate-500">({seg.kcal.toLocaleString()} kcal)</span>
            </span>
          </div>
        ))}
      </div>

      {/* 読解補助文 */}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{pfcInterpretation(ratio)}</p>
    </div>
  );
}
