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
    return <span className="text-slate-300">—</span>;
  }
  const d = current - past;
  const sign = d > 0 ? "+" : "";
  const label = `${sign}${d.toFixed(1)}`;
  const ahead = Math.abs(d) < 0.05 ? null : isCut ? d < 0 : d > 0;
  const colorCls =
    ahead === null
      ? "text-slate-400"
      : ahead
      ? "text-emerald-600 font-semibold"
      : "text-amber-600 font-semibold";
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
}: SeasonComparisonAccordionProps) {
  const [openSeason, setOpenSeason] = useState<string | null>(null);

  const pastSeasons = seasons.filter((s) => s !== currentSeason);

  if (pastSeasons.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-bold text-slate-700">シーズン比較</p>
        <p className="text-sm text-slate-400">
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
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
        <p className="text-sm font-bold text-slate-700">シーズン比較</p>
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-500">
          {currentSeason}
        </span>
      </div>

      {/* ── アコーディオン行 (新しい順に表示) ── */}
      <div className="divide-y divide-slate-50">
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
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50/70"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-700">{season}</span>
                  {pastFinisher !== null && (
                    <span className="text-xs text-slate-400 tabular-nums">
                      仕上がり {pastFinisher.toFixed(1)} kg
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {finisherDiff !== null && (
                    <span
                      className={`text-xs tabular-nums ${
                        finisherAhead === null
                          ? "text-slate-400"
                          : finisherAhead
                          ? "text-emerald-600 font-semibold"
                          : "text-amber-600 font-semibold"
                      }`}
                    >
                      {finisherDiff > 0 ? "+" : ""}
                      {finisherDiff.toFixed(1)} kg
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronUp size={16} className="shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown size={16} className="shrink-0 text-slate-400" />
                  )}
                </div>
              </button>

              {/* ── 展開コンテンツ ── */}
              {isOpen && (
                <div
                  id={`accordion-panel-${season}`}
                  role="region"
                  aria-labelledby={`accordion-btn-${season}`}
                  className="border-t border-slate-50 bg-slate-50/40"
                >
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        <th className="px-4 py-2 text-left">基準点</th>
                        <th className="px-3 py-2 text-right">{season}</th>
                        <th className="px-3 py-2 text-right text-red-400">{currentSeason}</th>
                        <th className="px-4 py-2 text-right">差</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {displayRows.map((row, rowIdx) => {
                        const isFinisher = row.daysOut === Infinity;
                        const pastVal = row.bySeasons[season] ?? null;
                        const curVal = row.bySeasons[currentSeason] ?? null;

                        return (
                          <tr
                            key={rowIdx}
                            className={`${
                              isFinisher
                                ? "border-t border-slate-200 bg-slate-50 font-semibold"
                                : "hover:bg-slate-50/70"
                            }`}
                          >
                            <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                              {daysOutLabel(row.daysOut)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                              {pastVal !== null ? (
                                <>{pastVal.toFixed(1)}<span className="ml-0.5 text-[9px] text-slate-300">kg</span></>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {curVal !== null ? (
                                <span className="font-semibold text-red-500">
                                  {curVal.toFixed(1)}<span className="ml-0.5 text-[9px] font-normal text-slate-300">kg</span>
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              <DiffCell current={curVal} past={pastVal} isCut={isCut} />
                            </td>
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

      {/* ── 凡例 ── */}
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-50 bg-slate-50 px-5 py-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <TrendingDown size={11} className="text-emerald-500" />
          {isCut ? "今季が前回より軽い（先行）" : "今季が前回より重い（先行）"}
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp size={11} className="text-amber-500" />
          {isCut ? "今季が前回より重い（遅れ）" : "今季が前回より軽い（遅れ）"}
        </span>
      </div>
    </div>
  );
}
