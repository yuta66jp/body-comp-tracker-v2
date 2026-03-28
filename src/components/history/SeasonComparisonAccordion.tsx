"use client";

/**
 * SeasonComparisonAccordion — モバイル向けシーズン比較 アコーディオン
 *
 * SeasonComparisonTable の mobile 代替。
 * 各過去シーズンを 1 枚のアコーディオン行として表示し、
 * タップで展開するとマイルストーン別の体重 + 今季との差分を確認できる。
 *
 * - デスクトップ (md+) では非表示 (SeasonComparisonTable を表示)
 * - データ形状は SeasonComparisonTable と同じ props を受け取る
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { MilestoneRow, SeasonMeta } from "@/lib/utils/calcSeason";

interface SeasonComparisonAccordionProps {
  milestoneRows: MilestoneRow[];
  seasonMeta: SeasonMeta[];
  /** 全シーズン名リスト (古い順。current が最後) */
  seasons: string[];
  currentSeason: string;
  isCut?: boolean;
  /**
   * true (default / Cut)  : 今季列・差列を表示
   * false (Bulk)           : 今季列・差列を非表示（過去シーズン参照モード）
   */
  showCurrentSeason?: boolean;
}

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function daysOutLabel(d: number): string {
  if (d === 0) return "大会日";
  if (d === Infinity) return "仕上がり";
  return `D${d}`;
}

function DiffCell({
  current,
  past,
  isCut,
}: {
  current: number | null;
  past: number | null;
  isCut: boolean;
}) {
  if (current === null || past === null) {
    return <span className="text-slate-300 dark:text-slate-600">—</span>;
  }
  const d = current - past;
  const sign = d > 0 ? "+" : "";
  const label = `${sign}${d.toFixed(1)}`;
  const ahead = Math.abs(d) < 0.05 ? null : isCut ? d < 0 : d > 0;
  const colorCls =
    ahead === null
      ? "text-slate-400 dark:text-slate-500"
      : ahead
      ? "text-emerald-600 font-semibold dark:text-emerald-400"
      : "text-amber-600 font-semibold dark:text-amber-400";
  const Icon = ahead === null ? Minus : ahead ? TrendingDown : TrendingUp;

  return (
    <span className={`flex items-center justify-end gap-0.5 ${colorCls}`}>
      <Icon size={11} />
      {label}
    </span>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function SeasonComparisonAccordion({
  milestoneRows,
  seasonMeta,
  seasons,
  currentSeason,
  isCut = true,
  showCurrentSeason = true,
}: SeasonComparisonAccordionProps) {
  const [openSeason, setOpenSeason] = useState<string | null>(null);

  const pastSeasons = seasons.filter((s) => s !== currentSeason);

  if (pastSeasons.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <p className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">シーズン比較</p>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          比較する過去シーズンのデータがありません。
        </p>
      </div>
    );
  }

  // 仕上がり体重 Map (season → peakWeight)
  const peakBySeason: Record<string, number | null> = {};
  for (const meta of seasonMeta) {
    peakBySeason[meta.season] = meta.peakWeight;
  }

  // 仕上がり行を末尾に追加
  const finisherRow: MilestoneRow = {
    daysOut: Infinity,
    bySeasons: peakBySeason,
  };
  const displayRows = [...milestoneRows, finisherRow];

  const currentFinisher = peakBySeason[currentSeason] ?? null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">シーズン比較</p>
        {showCurrentSeason && (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-500 dark:bg-red-900/20 dark:text-red-400">
            {currentSeason}
          </span>
        )}
      </div>

      {/* ── アコーディオン行 (新しい順に表示) ── */}
      <div className="divide-y divide-slate-50 dark:divide-slate-700/60">
        {[...pastSeasons].reverse().map((season) => {
          const isOpen = openSeason === season;
          const pastFinisher = peakBySeason[season] ?? null;
          const finisherDiff =
            currentFinisher !== null && pastFinisher !== null
              ? currentFinisher - pastFinisher
              : null;
          const finisherAhead =
            finisherDiff === null
              ? null
              : Math.abs(finisherDiff) < 0.05
              ? null
              : isCut
              ? finisherDiff < 0
              : finisherDiff > 0;

          return (
            <div key={season}>
              {/* ── アコーディオンヘッダー ── */}
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`accordion-panel-${season}`}
                onClick={() => setOpenSeason(isOpen ? null : season)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{season}</span>
                  {pastFinisher !== null && (
                    <span className="text-xs text-slate-400 tabular-nums dark:text-slate-500">
                      仕上がり {pastFinisher.toFixed(1)} kg
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {showCurrentSeason && finisherDiff !== null && (
                    <span
                      className={`text-xs tabular-nums ${
                        finisherAhead === null
                          ? "text-slate-400 dark:text-slate-500"
                          : finisherAhead
                          ? "text-emerald-600 font-semibold dark:text-emerald-400"
                          : "text-amber-600 font-semibold dark:text-amber-400"
                      }`}
                    >
                      {finisherDiff > 0 ? "+" : ""}
                      {finisherDiff.toFixed(1)} kg
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronUp size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
                  ) : (
                    <ChevronDown size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
                  )}
                </div>
              </button>

              {/* ── 展開コンテンツ ── */}
              {isOpen && (
                <div
                  id={`accordion-panel-${season}`}
                  role="region"
                  aria-labelledby={`accordion-btn-${season}`}
                  className="border-t border-slate-50 bg-slate-50/40 dark:border-slate-700/60 dark:bg-slate-800/60"
                >
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
                        <th className="px-4 py-2 text-left">基準点</th>
                        <th className="px-3 py-2 text-right">{season}</th>
                        {showCurrentSeason && (
                          <th className="px-3 py-2 text-right text-red-400">{currentSeason}</th>
                        )}
                        {showCurrentSeason && (
                          <th className="px-4 py-2 text-right">差</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                      {displayRows.map((row, rowIdx) => {
                        const isFinisher = row.daysOut === Infinity;
                        const pastVal = row.bySeasons[season] ?? null;
                        const curVal = row.bySeasons[currentSeason] ?? null;

                        return (
                          <tr
                            key={rowIdx}
                            className={`${
                              isFinisher
                                ? "border-t border-slate-200 bg-slate-50 font-semibold dark:border-slate-600 dark:bg-slate-800/80"
                                : "hover:bg-slate-50/70 dark:hover:bg-slate-800"
                            }`}
                          >
                            <td className="px-4 py-2 text-slate-600 whitespace-nowrap dark:text-slate-300">
                              {daysOutLabel(row.daysOut)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                              {pastVal !== null ? (
                                <>{pastVal.toFixed(1)}<span className="ml-0.5 text-[9px] text-slate-300 dark:text-slate-600">kg</span></>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </td>
                            {showCurrentSeason && (
                              <td className="px-3 py-2 text-right tabular-nums">
                                {curVal !== null ? (
                                  <span className="font-semibold text-red-500 dark:text-red-400">
                                    {curVal.toFixed(1)}<span className="ml-0.5 text-[9px] font-normal text-slate-300 dark:text-slate-600">kg</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600">—</span>
                                )}
                              </td>
                            )}
                            {showCurrentSeason && (
                              <td className="px-4 py-2 text-right tabular-nums">
                                <DiffCell current={curVal} past={pastVal} isCut={isCut} />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 凡例 — Bulk 時非表示 ── */}
      {showCurrentSeason && (
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-50 bg-slate-50 px-5 py-2 text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
          <span className="flex items-center gap-1">
            <TrendingDown size={11} className="text-emerald-600 dark:text-emerald-400" />
            {isCut ? "今季が前回より軽い（先行）" : "今季が前回より重い（先行）"}
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp size={11} className="text-amber-600 dark:text-amber-400" />
            {isCut ? "今季が前回より重い（遅れ）" : "今季が前回より軽い（遅れ）"}
          </span>
        </div>
      )}
    </div>
  );
}
