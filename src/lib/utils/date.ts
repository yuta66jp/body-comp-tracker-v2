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
 * @param s - "YYYY-MM-DD" 形式の文字列
 * @returns ローカルタイムゾーンの Date（時刻は 00:00:00）
 */
export function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
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
 *
 * @param base - 基準日 (YYYY-MM-DD)
 * @param days - 加算する日数（負の値で減算）
 */
export function addDaysStr(base: string, days: number): string {
  const d = parseLocalDateStr(base);
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

/**
 * from 〜 to の範囲の日付文字列配列を返す（両端を含む）。
 *
 * `new Date(from)` ではなく parseLocalDateStr() を使うことで、
 * タイムゾーンによる日付ずれを防いでいる。
 *
 * @param from - 開始日 (YYYY-MM-DD)
 * @param to   - 終了日 (YYYY-MM-DD)
 */
export function dateRangeStr(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = parseLocalDateStr(from);
  const end = parseLocalDateStr(to);
  while (cur <= end) {
    dates.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
