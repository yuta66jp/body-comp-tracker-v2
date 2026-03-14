/**
 * timeWindow.ts — 週次・前週比較の時間ウィンドウ定義
 *
 * ## 設計方針
 *
 * ### 暦日ベース (calendar-day window) を canonical とする理由
 *   - 「直近7日」は "今日を含む7暦日" と定義するのが最も直感的であり、
 *     カレンダー上で誰でも再現できる。
 *   - 記録日ベース (last N logged entries) は欠損日があると
 *     ウィンドウが過去にずれ、前週比較の基準が不安定になる。
 *     例: 3日記録なしの場合、「直近7記録」は実は10日前まで遡る。
 *   - 暦日ベースでは欠損日のある記録を欠損として扱い、
 *     平均はその日が "存在しなかった" ではなく "記録がなかった" として計算される。
 *     これにより比較期間が常に同一長さ（7暦日 vs 前7暦日）になる。
 *   - calcReadiness / calcWeeklyReview はすでに暦日ベースで実装されており、
 *     この utility はそれらと同一の設計に揃える。
 *
 * ### 記録日ベース (logged-entry window) の提供理由
 *   - MacroChart / TdeeChart のような "直近 N 件の記録を表示する" グラフでは
 *     欠損日をスキップして連続した表示にしたい。
 *   - 表示目的に限定し、前週比較などビジネス指標の計算には使わない。
 *
 * ### 命名規則
 *   - `calendar` prefix: 暦日ベース
 *   - `entry` / `Entries` suffix: 記録日ベース
 *
 * ### 前提
 *   - `today: string` は YYYY-MM-DD 形式 (通常は toJstDateStr() の戻り値)
 *   - ログは log_date 昇順ソート済みを前提としてよい (ソートはしない)
 *   - `new Date("YYYY-MM-DD")` は UTC 解釈になるため使用禁止。
 *     日付演算はすべて parseLocalDateStr / addDaysStr / dateRangeStr を使う。
 */

import { addDaysStr, dateRangeStr } from "./date";

// ─── 暦日ベース ───────────────────────────────────────────────────────────────

/**
 * today 基準で直近 n 暦日の date-only 文字列セットを返す。
 *
 * 例: today="2026-03-14", n=7 → {"2026-03-08", ..., "2026-03-14"}
 *
 * @param today - 基準日 (YYYY-MM-DD)。通常は toJstDateStr() の戻り値。
 * @param n     - ウィンドウ長（日数）。1 以上の整数。today を含む。
 * @returns YYYY-MM-DD 文字列の Set。today が不正なら空 Set。
 */
export function calendarDaysWindow(today: string, n: number): Set<string> {
  const start = addDaysStr(today, -(n - 1));
  if (start === null) return new Set();
  return new Set(dateRangeStr(start, today));
}

/**
 * 直近 n 暦日に属する記録を抽出する（暦日ベース）。
 *
 * today を含む n 暦日（today-（n-1） 〜 today）に log_date が含まれる
 * エントリのみを返す。欠損日（ログなし）は結果に含まれない。
 * そのため返却件数は最大 n 件（欠損があれば減る）。
 *
 * @param logs  - DailyLog 配列（ソート順不問だが log_date 昇順推奨）
 * @param today - 基準日 (YYYY-MM-DD)
 * @param n     - ウィンドウ長（日数）
 * @returns 直近 n 暦日に含まれる記録の配列（log_date 昇順）
 */
export function filterLastNCalendarDays<T extends { log_date: string }>(
  logs: T[],
  today: string,
  n: number
): T[] {
  const window = calendarDaysWindow(today, n);
  return logs.filter((l) => window.has(l.log_date));
}

/**
 * 前 n 暦日（直近 n 日の1つ前の n 日間）に属する記録を抽出する（暦日ベース）。
 *
 * 「前週」ウィンドウ: today-(2n-1) 〜 today-n
 * 例: today="2026-03-14", n=7 → "2026-03-01" 〜 "2026-03-07"
 *
 * @param logs  - DailyLog 配列
 * @param today - 基準日 (YYYY-MM-DD)
 * @param n     - ウィンドウ長（日数）
 * @returns 前 n 暦日に含まれる記録の配列（log_date 昇順）
 */
export function filterPrevNCalendarDays<T extends { log_date: string }>(
  logs: T[],
  today: string,
  n: number
): T[] {
  const endDate = addDaysStr(today, -n);
  const startDate = addDaysStr(today, -(2 * n - 1));
  if (endDate === null || startDate === null) return [];
  const window = new Set(dateRangeStr(startDate, endDate));
  return logs.filter((l) => window.has(l.log_date));
}

// ─── 記録日ベース ─────────────────────────────────────────────────────────────

/**
 * 最新 n 件の記録を返す（記録日ベース）。
 *
 * ログが n 件未満の場合は全件返す。
 * 表示目的（グラフの直近 N 件表示など）に使用する。
 * 前週比較などビジネス指標の計算には暦日ベース関数を使うこと。
 *
 * @param logs - 配列（log_date 昇順ソート済みであること）
 * @param n    - 取得件数
 * @returns 末尾 n 件の配列
 */
export function lastNEntries<T>(logs: T[], n: number): T[] {
  if (n <= 0) return [];
  return logs.slice(-n);
}

/**
 * 最新 n 件の1つ前の n 件を返す（記録日ベース）。
 *
 * 例: ログが 20 件、n=7 → インデックス 6〜12 の 7 件
 * ログ件数が 2n 未満の場合は不足分を先頭から詰める。
 *
 * @param logs - 配列（log_date 昇順ソート済みであること）
 * @param n    - ウィンドウ長
 * @returns 直近 n 件の1つ前の n 件（最大 n 件）
 */
export function prevNEntries<T>(logs: T[], n: number): T[] {
  const total = logs.length;
  const end = Math.max(0, total - n);
  const start = Math.max(0, end - n);
  return logs.slice(start, end);
}
