/**
 * SeasonComparisonTable — 全シーズン × マイルストーン 数値テーブル
 *
 * Server Component。全シーズンを列、大会前マイルストーンを行として
 * 体重を並べて表示する。「前回比」列は最新の過去シーズンとの差分。
 *
 * 想定ユース:
 *   - YearOverYearSummary が「判断用の要約」
 *   - SeasonComparisonTable が「参照用の詳細」
 *
 * Graceful degradation:
 *   - 過去シーズンが 0 件 → 「データなし」メッセージのみ
 *   - 今季が特定マイルストーンに未達 → "—" で表示、スコアにも影響しない
 */

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { MilestoneRow, SeasonMeta } from "@/lib/utils/calcSeason";

interface SeasonComparisonTableProps {
  milestoneRows: MilestoneRow[];
  seasonMeta: SeasonMeta[];   // 仕上がり体重行の追加用
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

/** 今季と最新過去シーズンの差分の色 */
function diffColorClass(
  current: number | null,
  prev: number | null,
  isCut: boolean
): string {
  if (current === null || prev === null) return "text-slate-300";
  const d = current - prev;
  if (Math.abs(d) < 0.05) return "text-slate-400";
  const ahead = isCut ? d < 0 : d > 0;
  return ahead ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold";
}

function DiffCell({
  current,
  prev,
  isCut,
}: {
  current: number | null;
  prev: number | null;
  isCut: boolean;
}) {
  if (current === null || prev === null) {
    return <span className="text-slate-300">—</span>;
  }
  const d = current - prev;
  const sign = d > 0 ? "+" : "";
  const label = `${sign}${d.toFixed(1)}`;
  const ahead = Math.abs(d) < 0.05 ? null : isCut ? d < 0 : d > 0;
  const colorCls = diffColorClass(current, prev, isCut);
  const Icon =
    ahead === null ? Minus : ahead ? TrendingDown : TrendingUp;

  return (
    <span className={`flex items-center justify-end gap-0.5 ${colorCls}`}>
      <Icon size={11} />
      {label}
    </span>
  );
}

// 過去シーズンのカラーレベル (古い順に薄いグレー)
function pastSeasonTextColor(idx: number, total: number): string {
  const level = idx / Math.max(total - 1, 1); // 0 (oldest) → 1 (newest past)
  if (level < 0.25) return "text-slate-300";
  if (level < 0.5) return "text-slate-400";
  if (level < 0.75) return "text-slate-500";
  return "text-slate-600";
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function SeasonComparisonTable({
  milestoneRows,
  seasonMeta,
  seasons,
  currentSeason,
  isCut = true,
}: SeasonComparisonTableProps) {
  const pastSeasons = seasons.filter((s) => s !== currentSeason);

  // 過去シーズンがない場合
  if (pastSeasons.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-bold text-slate-700">シーズン比較テーブル</p>
        <p className="text-sm text-slate-400">
          比較する過去シーズンのデータがありません。
        </p>
      </div>
    );
  }

  // 最新の過去シーズン (差分比較用)
  const prevSeason = pastSeasons[pastSeasons.length - 1];

  // 仕上がり体重 Map (season → peakWeight)
  const peakBySeasons: Record<string, number | null> = {};
  for (const meta of seasonMeta) {
    peakBySeasons[meta.season] = meta.peakWeight;
  }

  // 仕上がり体重を最終行として追加
  const finisherRow: MilestoneRow = {
    daysOut: Infinity,
    bySeasons: peakBySeasons,
  };
  const displayRows = [...milestoneRows, finisherRow];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
        <p className="text-sm font-bold text-slate-700">シーズン比較テーブル</p>
        <p className="text-xs text-slate-400">
          体重は 7日移動平均 / 大会 ±3日以内の最近接値 / 差は今季 − {prevSeason}
        </p>
      </div>

      {/* ── テーブル (横スクロール対応) ── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="sticky left-0 bg-slate-50 px-4 py-2.5 text-left whitespace-nowrap">
                基準点
              </th>
              {/* 過去シーズン (古い順, グレー系) */}
              {pastSeasons.map((s, idx) => (
                <th
                  key={s}
                  className={`px-3 py-2.5 text-right ${pastSeasonTextColor(
                    idx,
                    pastSeasons.length
                  )}`}
                >
                  {s}
                </th>
              ))}
              {/* 今季 (赤でハイライト) */}
              <th className="px-3 py-2.5 text-right text-red-500">
                {currentSeason}
                <span className="ml-1 rounded bg-red-50 px-1 text-[9px] font-bold">今季</span>
              </th>
              {/* 差分列 */}
              <th className="px-4 py-2.5 text-right text-slate-500">
                差 (vs {prevSeason})
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {displayRows.map((row, rowIdx) => {
              const isFinisher = row.daysOut === Infinity;
              const label = daysOutLabel(row.daysOut);
              const curVal = row.bySeasons[currentSeason] ?? null;
              const prvVal = row.bySeasons[prevSeason] ?? null;

              return (
                <tr
                  key={rowIdx}
                  className={`transition-colors hover:bg-slate-50/70 ${
                    isFinisher
                      ? "border-t-2 border-slate-200 bg-slate-50/50 font-semibold"
                      : ""
                  }`}
                >
                  {/* 基準点ラベル */}
                  <td className="sticky left-0 bg-white px-4 py-2.5 text-slate-600 hover:bg-slate-50/70 whitespace-nowrap">
                    {label}
                    {isFinisher && (
                      <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                        最小体重
                      </span>
                    )}
                  </td>

                  {/* 過去シーズンの体重 */}
                  {pastSeasons.map((s, idx) => {
                    const val = row.bySeasons[s] ?? null;
                    return (
                      <td
                        key={s}
                        className={`px-3 py-2.5 text-right tabular-nums ${pastSeasonTextColor(
                          idx,
                          pastSeasons.length
                        )}`}
                      >
                        {val !== null ? (
                          <>
                            {val.toFixed(1)}
                            <span className="ml-0.5 text-[10px]">kg</span>
                          </>
                        ) : (
                          <span className="text-slate-200">—</span>
                        )}
                      </td>
                    );
                  })}

                  {/* 今季の体重 */}
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {curVal !== null ? (
                      <span className="font-semibold text-red-500">
                        {curVal.toFixed(1)}
                        <span className="ml-0.5 text-xs font-normal text-slate-300">kg</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">
                        —
                        <span className="ml-0.5 text-[10px]">
                          {isFinisher ? "中" : "未達"}
                        </span>
                      </span>
                    )}
                  </td>

                  {/* 差分 */}
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <DiffCell current={curVal} prev={prvVal} isCut={isCut} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 凡例 ── */}
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-50 bg-slate-50 px-5 py-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <TrendingDown size={11} className="text-emerald-600" />
          {isCut ? "今季が前回より軽い (先行)" : "今季が前回より重い (先行)"}
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp size={11} className="text-amber-600" />
          {isCut ? "今季が前回より重い (遅れ)" : "今季が前回より軽い (遅れ)"}
        </span>
        <span className="ml-auto">
          過去シーズン数: {pastSeasons.length} / 全 {seasons.length} シーズン
        </span>
      </div>
    </div>
  );
}
