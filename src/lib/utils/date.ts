/**
 * date.ts — タイムゾーン安全な日付ユーティリティ
 *
 * `new Date().toISOString().slice(0, 10)` は UTC で日付を返すため、
 * JST (UTC+9) の 00:00〜08:59 では前日の日付になる問題がある。
 * このモジュールの関数はローカルタイムゾーンで日付を返す。
 *
 * また `new Date("YYYY-MM-DD")` は ISO 8601 の日付のみ文字列として UTC 午前0時に
 * パースされるため、タイムゾーンがある環境では意図しない日付になる場合がある。
 * "YYYY-MM-DD" 文字列からローカル日付を作成する場合は parseLocalDateStr() を使うこと。
 */

/**
 * "YYYY-MM-DD" 文字列をローカルタイムゾーンの Date に変換する。
 *
 * `new Date("YYYY-MM-DD")` は UTC 午前0時として解釈されるため、
 * JST 環境では前日の 09:00 になってしまう。本関数はローカル日付として解釈する。
 *
 * 以下の入力は不正とみなし null を返す:
 * - "YYYY-MM-DD" 形式でない ("abc", "2026/03/01", 空文字)
 * - 月が 1〜12 の範囲外 ("2026-13-01")
 * - 実在しない日付 ("2026-02-31")
 *
 * @param s - "YYYY-MM-DD" 形式の文字列
 * @returns ローカルタイムゾーンの Date（時刻は 00:00:00）。不正な入力は null。
 */
export function parseLocalDateStr(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  // 月の範囲チェック (1〜12)
  if (m < 1 || m > 12) return null;
  // 実在する日付か確認: Date が月をオーバーフローしないことで検証
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * 指定した Date（省略時は今日）をローカルタイムゾーンで YYYY-MM-DD 形式に変換する。
 *
 * @param date - 変換対象の Date。省略時は `new Date()` を使用。
 * @returns "YYYY-MM-DD" 形式の文字列
 */
export function toLocalDateStr(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * ある日付に指定日数を加算した日付を YYYY-MM-DD で返す。
 *
 * `new Date(base)` ではなく parseLocalDateStr() を使うことで、
 * タイムゾーンによる日付ずれを防いでいる。
 * base が不正な形式の場合は null を返す。
 *
 * @param base - 基準日 (YYYY-MM-DD)
 * @param days - 加算する日数（負の値で減算）
 * @returns YYYY-MM-DD 文字列。base が不正な場合は null。
 */
export function addDaysStr(base: string, days: number): string | null {
  const d = parseLocalDateStr(base);
  if (d === null) return null;
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

/**
 * from 〜 to の範囲の日付文字列配列を返す（両端を含む）。
 *
 * `new Date(from)` ではなく parseLocalDateStr() を使うことで、
 * タイムゾーンによる日付ずれを防いでいる。
 * from または to が不正な形式の場合は空配列を返す。
 *
 * @param from - 開始日 (YYYY-MM-DD)
 * @param to   - 終了日 (YYYY-MM-DD)
 * @returns 日付文字列の配列。from または to が不正な場合は空配列。
 */
export function dateRangeStr(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = parseLocalDateStr(from);
  const end = parseLocalDateStr(to);
  if (cur === null || end === null) return [];
  while (cur <= end) {
    dates.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
