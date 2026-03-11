/**
 * YearOverYearSummary — 今季 vs 前回シーズン 差分カード
 *
 * Server Component。最重要の「今年は去年より進んでいるか」をすぐ答えられる。
 *
 * 表示内容:
 *   - 今季 / 前回シーズンの対比 (D-180〜D-14 + 仕上がり体重)
 *   - 差分 (今季 − 前回) を色付きで明示
 *   - 最新の比較可能マイルストーンに基づく自動所見 1 行
 *
 * Graceful degradation:
 *   - 前回シーズンのデータなし → その旨だけ表示
 *   - 今季がまだそのマイルストーンに達していない → "—" + "未到達"
 */

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { MilestoneRow, SeasonMeta } from "@/lib/utils/calcSeason";

interface YearOverYearSummaryProps {
  milestoneRows: MilestoneRow[];
  currentSeason: string;
  /** 直近の過去シーズン名 (null = 過去データなし) */
  prevSeason: string | null;
  currentMeta: SeasonMeta | null;
  prevMeta: SeasonMeta | null;
  /** Cut フェーズなら true (軽い = 良い). Bulk なら false */
  isCut?: boolean;
}

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function fmt1(v: number | null): string {
  return v !== null ? v.toFixed(1) : "—";
}

function daysOutLabel(d: number): string {
  if (d === 0) return "大会日";
  return `D${d}`; // e.g. D-90
}

/** 差分の表示テキスト (今季 − 前回) */
function diffLabel(current: number | null, prev: number | null): string {
  if (current === null || prev === null) return "—";
  const d = current - prev;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)} kg`;
}

/** diff が有利かどうか (Cut では負が有利, Bulk では正が有利) */
function isAhead(current: number | null, prev: number | null, isCut: boolean): boolean | null {
  if (current === null || prev === null) return null;
  const d = current - prev;
  if (Math.abs(d) < 0.05) return null; // 誤差範囲
  return isCut ? d < 0 : d > 0;
}

/** diff の色クラス */
function diffColor(ahead: boolean | null): string {
  if (ahead === null) return "text-slate-400";
  return ahead ? "text-emerald-600" : "text-amber-600";
}

/** diff のアイコン */
function DiffIcon({ ahead }: { ahead: boolean | null }) {
  if (ahead === null) return <Minus size={12} className="text-slate-300" />;
  if (ahead) return <TrendingDown size={12} className="text-emerald-500" />;
  return <TrendingUp size={12} className="text-amber-500" />;
}

// ─── 自動所見生成 ────────────────────────────────────────────────────────────

function generateFinding(
  milestoneRows: MilestoneRow[],
  currentSeason: string,
  prevSeason: string,
  currentMeta: SeasonMeta | null,
  prevMeta: SeasonMeta | null,
  isCut: boolean
): string {
  // 比較可能な最新マイルストーン (両シーズンに値がある最後の行)
  const comparable = [...milestoneRows]
    .reverse()
    .find(
      (r) =>
        r.bySeasons[currentSeason] !== null && r.bySeasons[prevSeason] !== null
    );

  if (!comparable) {
    // 今季は比較開始前
    if (prevMeta) {
      return `前回シーズン（${prevSeason}）の仕上がり体重は ${prevMeta.peakWeight.toFixed(1)} kg でした。今季のデータが蓄積されると比較が可能になります。`;
    }
    return "比較可能なデータがまだありません。";
  }

  const cur = comparable.bySeasons[currentSeason]!;
  const prv = comparable.bySeasons[prevSeason]!;
  const diff = cur - prv;
  const label = daysOutLabel(comparable.daysOut);
  const direction = isCut
    ? diff < -0.05
      ? "先行"
      : diff > 0.05
      ? "遅れ"
      : "同ペース"
    : diff > 0.05
    ? "先行"
    : diff < -0.05
    ? "遅れ"
    : "同ペース";
  const sign = diff > 0 ? "+" : "";
  const diffStr = `${sign}${diff.toFixed(1)} kg`;

  let base = `${label} 時点で前回比 ${diffStr}（${direction}）。`;

  // 仕上がり体重の参考値
  if (prevMeta && currentMeta === null) {
    // 今季まだ終わっていない
    base += ` 前回の仕上がりは ${prevMeta.peakWeight.toFixed(1)} kg でした。`;
  }

  return base;
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function YearOverYearSummary({
  milestoneRows,
  currentSeason,
  prevSeason,
  currentMeta,
  prevMeta,
  isCut = true,
}: YearOverYearSummaryProps) {
  // 前回シーズンのデータがない
  if (!prevSeason) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-bold text-slate-700">前回シーズン比較</p>
        <p className="text-sm text-slate-400">
          過去シーズンのデータがないため比較できません。
          <code className="ml-1 text-xs font-mono">import_history.py</code> でインポートすると表示されます。
        </p>
      </div>
    );
  }

  const finding = generateFinding(
    milestoneRows,
    currentSeason,
    prevSeason,
    currentMeta,
    prevMeta,
    isCut
  );

  // 仕上がり体重行を追加
  const finisherRow: MilestoneRow = {
    daysOut: Infinity, // sentinel
    bySeasons: {
      [currentSeason]: currentMeta?.peakWeight ?? null,
      [prevSeason]: prevMeta?.peakWeight ?? null,
    },
  };

  const displayRows = [...milestoneRows, finisherRow];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
        <p className="text-sm font-bold text-slate-700">前回シーズン比較</p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-600">
            {currentSeason}
          </span>
          <span className="text-slate-300">vs</span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-600">
            {prevSeason}
          </span>
        </div>
      </div>

      {/* ── テーブル ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 text-left">基準点</th>
              <th className="px-4 py-2 text-right">{prevSeason}</th>
              <th className="px-4 py-2 text-right text-red-500">{currentSeason}</th>
              <th className="px-4 py-2 text-right">差 (今季 − 前回)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {displayRows.map((row, i) => {
              const isFinisher = row.daysOut === Infinity;
              const label = isFinisher ? "仕上がり" : daysOutLabel(row.daysOut);
              const curVal = row.bySeasons[currentSeason] ?? null;
              const prvVal = row.bySeasons[prevSeason] ?? null;
              const ahead = isAhead(curVal, prvVal, isCut);

              return (
                <tr
                  key={i}
                  className={`transition-colors hover:bg-slate-50 ${
                    isFinisher ? "border-t border-slate-200 font-semibold" : ""
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-600">
                    {label}
                    {isFinisher && (
                      <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                        (最小体重)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {fmt1(prvVal)}
                    {prvVal !== null && <span className="ml-0.5 text-xs text-slate-300">kg</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {curVal !== null ? (
                      <span className="font-semibold text-red-500">
                        {fmt1(curVal)}
                        <span className="ml-0.5 text-xs font-normal text-slate-300">kg</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">
                        —
                        <span className="ml-1 text-[10px] text-slate-300">
                          {isFinisher ? "シーズン中" : "未到達"}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {curVal !== null && prvVal !== null ? (
                      <span
                        className={`flex items-center justify-end gap-1 font-semibold ${diffColor(ahead)}`}
                      >
                        <DiffIcon ahead={ahead} />
                        {diffLabel(curVal, prvVal)}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 所見 ── */}
      <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-600">
        {finding}
      </div>
    </div>
  );
}
