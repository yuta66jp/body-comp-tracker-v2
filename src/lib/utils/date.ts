/**
 * date.ts — タイムゾーン安全な日付ユーティリティ
 *
 * `new Date().toISOString().slice(0, 10)` は UTC で日付を返すため、
 * JST (UTC+9) の 00:00〜08:59 では前日の日付になる問題がある。
 * このモジュールの関数はローカルタイムゾーンで日付を返す。
 */

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
 * @param base - 基準日 (YYYY-MM-DD)
 * @param days - 加算する日数（負の値で減算）
 */
export function addDaysStr(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

/**
 * from 〜 to の範囲の日付文字列配列を返す（両端を含む）。
 *
 * @param from - 開始日 (YYYY-MM-DD)
 * @param to   - 終了日 (YYYY-MM-DD)
 */
export function dateRangeStr(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
