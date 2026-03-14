/**
 * TodayWindowComparison — 今日基準 近傍ウィンドウ体重比較
 *
 * 現在シーズンの「今日の大会基準日数」と同じ時期 (±windowDays日) に
 * 各シーズンがどの体重だったかを比較する。
 *
 * D-day 固定マイルストーンとは異なり「今この瞬間」との比較に特化。
 *
 * Graceful degradation:
 *   - 過去シーズンなし → 説明メッセージのみ
 *   - 今季のウィンドウ内にデータなし → 推定時期だけ表示
 *   - 特定シーズンでウィンドウ内にデータなし → "—" で表示
 */

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { TodayWindowEntry } from "@/lib/utils/calcSeason";

interface TodayWindowComparisonProps {
  entries: TodayWindowEntry[];
  currentSeason: string;
  todayDaysOut: number;
  windowDays?: number;
  isCut?: boolean;
}

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function fmt1(v: number | null): string {
  return v !== null ? v.toFixed(1) : "—";
}

/**
 * 日付レンジを補助テキスト用にフォーマットする。
 * - 同日: "2024/06/03"
 * - 同年: "2024/06/03–06/09"
 * - 異年: "2024/06/03–2025/01/09"
 * - null: "" (表示なし)
 */
function fmtDateRange(from: string | null, to: string | null): string {
  if (!from || !to) return "";
  const fmtDate = (s: string) => s.replace(/-/g, "/");
  if (from === to) return fmtDate(from);
  const [fy] = from.split("-");
  const [ty] = to.split("-");
  const toStr = fy === ty ? to.slice(5).replace("-", "/") : fmtDate(to);
  return `${fmtDate(from)}–${toStr}`;
}

function diffLabel(current: number | null, past: number | null): string {
  if (current === null || past === null) return "—";
  const d = current - past;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)} kg`;
}

function isAhead(
  current: number | null,
  past: number | null,
  isCut: boolean
): boolean | null {
  if (current === null || past === null) return null;
  const d = current - past;
  if (Math.abs(d) < 0.05) return null;
  return isCut ? d < 0 : d > 0;
}

function diffColorClass(ahead: boolean | null): string {
  if (ahead === null) return "text-slate-400";
  return ahead ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold";
}

function DiffIcon({ ahead }: { ahead: boolean | null }) {
  if (ahead === null) return <Minus size={12} className="text-slate-300" />;
  if (ahead) return <TrendingDown size={12} className="text-emerald-500" />;
  return <TrendingUp size={12} className="text-amber-500" />;
}

// ─── 自動所見生成 ────────────────────────────────────────────────────────────

function generateFinding(
  entries: TodayWindowEntry[],
  currentSeason: string,
  isCut: boolean
): string | null {
  const current = entries.find((e) => e.season === currentSeason);
  if (!current || current.avgWeight === null) return null;

  // 最新の過去シーズン (データあり) を探す
  const pastWithData = entries
    .filter((e) => e.season !== currentSeason && e.avgWeight !== null)
    .sort((a, b) => b.season.localeCompare(a.season));

  if (pastWithData.length === 0) return null;

  const prev = pastWithData[0];
  const diff = current.avgWeight - prev.avgWeight!;
  const direction = isCut
    ? diff < -0.05 ? "先行" : diff > 0.05 ? "遅れ" : "同ペース"
    : diff > 0.05 ? "先行" : diff < -0.05 ? "遅れ" : "同ペース";
  const sign = diff > 0 ? "+" : "";

  return `この時期の平均体重は前回シーズン（${prev.season}）比 ${sign}${diff.toFixed(1)} kg（${direction}）の傾向が見られます。`;
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function TodayWindowComparison({
  entries,
  currentSeason,
  todayDaysOut,
  windowDays = 7,
  isCut = true,
}: TodayWindowComparisonProps) {
  const pastEntries = entries.filter((e) => e.season !== currentSeason);
  const currentEntry = entries.find((e) => e.season === currentSeason) ?? null;
  const daysLabel =
    todayDaysOut === 0
      ? "大会日"
      : `大会 ${Math.abs(todayDaysOut)} 日前`;

  // 過去シーズンなし
  if (pastEntries.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-bold text-slate-700">今日基準比較</p>
        <p className="text-sm text-slate-400">
          比較する過去シーズンのデータがありません。
        </p>
      </div>
    );
  }

  const finding = generateFinding(entries, currentSeason, isCut);

  // 全シーズンを古い順にソート (Season Low と表示順を統一、今季は末尾に自然に含まれる)
  const sortedEntries = [...entries].sort((a, b) => a.season.localeCompare(b.season));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div>
          <p className="text-sm font-bold text-slate-700">今日基準比較</p>
          <p className="text-xs text-slate-400">
            {daysLabel} の近傍 ±{windowDays} 日における平均体重（7日移動平均）
          </p>
        </div>
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-500">
          {currentSeason}
        </span>
      </div>

      {/* ── テーブル ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 text-left">シーズン</th>
              <th className="px-4 py-2.5 text-right">件数</th>
              <th className="px-4 py-2.5 text-right">平均体重</th>
              <th className="px-4 py-2.5 text-right">差（今季 − 過去）</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {/* 今季の行 */}
            {sortedEntries.map((entry) => {
              const isCurrent = entry.season === currentSeason;
              const ahead = isCurrent
                ? null
                : isAhead(currentEntry?.avgWeight ?? null, entry.avgWeight, isCut);
              return (
                <tr
                  key={entry.season}
                  className={`transition-colors hover:bg-slate-50/70 ${isCurrent ? "bg-red-50/30 font-semibold" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    {isCurrent ? (
                      <>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                          {entry.season}
                        </span>
                        <span className="ml-2 text-[10px] font-normal text-slate-400">今季</span>
                      </>
                    ) : (
                      <span className="text-slate-600">{entry.season}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                    {entry.count > 0 ? entry.count : <span className="text-slate-200">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {entry.avgWeight !== null ? (
                      <div>
                        {isCurrent ? (
                          <span className="font-semibold text-red-500">
                            {fmt1(entry.avgWeight)}
                            <span className="ml-0.5 text-xs font-normal text-slate-300">kg</span>
                          </span>
                        ) : (
                          <span className="text-slate-600">
                            {fmt1(entry.avgWeight)}
                            <span className="ml-0.5 text-xs text-slate-300">kg</span>
                          </span>
                        )}
                        {fmtDateRange(entry.dateFrom, entry.dateTo) && (
                          <div className="mt-0.5 text-[10px] text-slate-300">
                            {fmtDateRange(entry.dateFrom, entry.dateTo)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-200">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {isCurrent ? (
                      <span className="text-slate-300">—</span>
                    ) : currentEntry?.avgWeight !== null && entry.avgWeight !== null ? (
                      <span className={`flex items-center justify-end gap-1 ${diffColorClass(ahead)}`}>
                        <DiffIcon ahead={ahead} />
                        {diffLabel(currentEntry!.avgWeight, entry.avgWeight)}
                      </span>
                    ) : (
                      <span className="text-slate-200">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 所見 ── */}
      {finding && (
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          {finding}
        </div>
      )}

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
        <span className="ml-auto text-slate-300">ウィンドウ ±{windowDays}日</span>
      </div>
    </div>
  );
}
