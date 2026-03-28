/**
 * BacktestExcludedDates — バックテスト除外日一覧表示
 *
 * forecast_backtest_runs.config と daily_logs から再導出した除外日一覧を表示する。
 * #370 で追加: 除外件数だけでなく「どの日付が除外対象になったか」を確認できるようにする。
 *
 * 表示内容:
 *   - 除外理由別の集計サマリー
 *   - 日付 / 除外理由 / 由来 の一覧テーブル
 *   - 除外対象日数と評価サンプル除外件数は別概念である旨の補足
 *
 * 除外が 0 件の場合も表示し、「フラグなし・手動期間未設定」の状態を確認できるようにする。
 *
 * #371 での手動 event period 実行導線追加後も、この表示は変更なしで自然に機能する
 * (manualEventPeriods が埋まれば自動でリストに表示される)。
 */

import { CalendarX2 } from "lucide-react";
import type { ExcludedDateEntry, ExcludedReason, ExcludedSource } from "@/lib/utils/backtestExclusion";

// ── 表示定数 ──────────────────────────────────────────────────────────────

const REASON_CONFIG: Record<
  ExcludedReason,
  { label: string; badgeClass: string }
> = {
  cheat_day:           { label: "チートデイ",       badgeClass: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" },
  travel_day:          { label: "旅行日",            badgeClass: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400" },
  manual_event_period: { label: "手動イベント期間",  badgeClass: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" },
  recovery_day:        { label: "回復日",            badgeClass: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400" },
};

const SOURCE_LABELS: Record<ExcludedSource, string> = {
  daily_logs: "DBフラグ",
  derived:    "自動付与",
  manual:     "手動設定",
};

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  entries: ExcludedDateEntry[];
  recoveryDays: number;
  /** reason は #371 で追加されたオプションフィールド。旧 run には存在しない場合がある。 */
  manualEventPeriods: Array<{ start: string; end: string; reason?: string }>;
}

// ── コンポーネント ────────────────────────────────────────────────────────

export function BacktestExcludedDates({
  entries,
  recoveryDays,
  manualEventPeriods,
}: Props) {
  // 理由別集計
  const counts: Record<ExcludedReason, number> = {
    cheat_day:           0,
    travel_day:          0,
    manual_event_period: 0,
    recovery_day:        0,
  };
  for (const e of entries) {
    counts[e.reason]++;
  }

  const totalDays = entries.length;
  const hasManualPeriods = manualEventPeriods.length > 0;

  // サマリー: 0以外の理由を列挙
  const summaryCounts = (
    Object.entries(counts) as Array<[ExcludedReason, number]>
  ).filter(([, n]) => n > 0);

  return (
    <details className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      {/* ── サマリー行（クリックで展開） ── */}
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <CalendarX2 size={15} className="flex-shrink-0 text-slate-400 dark:text-slate-500" />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
            除外対象日の確認
          </span>
          {totalDays > 0 ? (
            <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {totalDays} 日
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              除外なし
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {summaryCounts.length > 0 && (
            <div className="hidden gap-2 sm:flex">
              {summaryCounts.map(([reason, n]) => (
                <span
                  key={reason}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${REASON_CONFIG[reason].badgeClass}`}
                >
                  {REASON_CONFIG[reason].label}: {n}
                </span>
              ))}
            </div>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500 group-open:hidden">▼ 展開</span>
          <span className="hidden text-xs text-slate-400 dark:text-slate-500 group-open:inline">▲ 閉じる</span>
        </div>
      </summary>

      {/* ── 展開コンテンツ ── */}
      <div className="divide-y divide-slate-50 dark:divide-slate-700/60">
        {/* 設定情報 */}
        <div className="bg-slate-50/60 dark:bg-slate-800/60 px-5 py-2.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-medium">除外条件:</span>{" "}
          回復期間 {recoveryDays} 日 /{" "}
          {hasManualPeriods ? (
            <>
              手動イベント期間{" "}
              {manualEventPeriods.map((ep, i) => (
                <span key={i} className="font-mono">
                  {i > 0 && " / "}
                  {ep.start}〜{ep.end}
                  {ep.reason && (
                    <span className="ml-1 font-sans not-italic text-violet-600 dark:text-violet-400">
                      ({ep.reason})
                    </span>
                  )}
                </span>
              ))}
            </>
          ) : (
            <span>手動イベント期間 未設定（自動タグのみ対象）</span>
          )}
        </div>

        {totalDays === 0 ? (
          /* 除外なしの場合 */
          <div className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">
            <p>除外対象日はありません。</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              daily_logs に cheat_day / travel_day フラグが立っている日がなく、
              手動イベント期間も未設定のため、除外なしで全日が評価されています。
            </p>
          </div>
        ) : (
          <>
            {/* モバイル: シンプルリスト */}
            <div className="md:hidden divide-y divide-slate-50 dark:divide-slate-700/60">
              {entries.map((e) => {
                const cfg = REASON_CONFIG[e.reason];
                return (
                  <div key={e.date} className="flex items-center justify-between px-5 py-2.5">
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{e.date}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.badgeClass}`}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {SOURCE_LABELS[e.source]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* デスクトップ: テーブル */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    <th className="px-5 py-2">日付</th>
                    <th className="px-4 py-2">除外理由</th>
                    <th className="px-4 py-2">由来</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                  {entries.map((e) => {
                    const cfg = REASON_CONFIG[e.reason];
                    return (
                      <tr key={e.date} className="hover:bg-slate-50/60 dark:hover:bg-slate-800">
                        <td className="px-5 py-2 font-mono text-slate-700 dark:text-slate-300">{e.date}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.badgeClass}`}
                          >
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-400 dark:text-slate-500">
                          {SOURCE_LABELS[e.source]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 補足注記 */}
        <div className="bg-slate-50/60 dark:bg-slate-800/60 px-5 py-2.5 text-[11px] text-slate-400 dark:text-slate-500">
          ここに表示される「除外対象日数」は、評価ウィンドウ内の実際の日数カウントです。
          比較テーブルの「除外†」（評価サンプル除外件数）とは異なります。
          同じ日付でも複数の予測起点から target_date として評価される場合、
          サンプル除外件数は日数より多くなります。
          回復日 = イベント日直後 {recoveryDays} 日間を自動付与。
        </div>
      </div>
    </details>
  );
}
