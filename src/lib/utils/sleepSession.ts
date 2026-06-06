/**
 * TIMESTAMPTZ 文字列から表示用の JST HH:MM を抽出するユーティリティ。
 */

/** JST オフセット (ms)。UTC + この値 = JST */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * TIMESTAMPTZ 文字列から JST の HH:MM を抽出する。
 *
 * Supabase は TIMESTAMPTZ を UTC 形式（例: "2026-04-07T14:30:00+00:00"）で
 * 返す。`slice(11, 16)` はこの UTC 時刻を切り出してしまうため、
 * Date に変換して JST（UTC+9）へ変換してから HH:MM を取り出す。
 *
 * @param timestamptz ISO 8601 文字列
 * @returns JST の "HH:MM" 文字列。不正入力の場合は null。
 */
export function extractJstHHMM(timestamptz: string): string | null {
  const date = new Date(timestamptz);
  if (isNaN(date.getTime())) return null;

  const jstDate = new Date(date.getTime() + JST_OFFSET_MS);

  const h = String(jstDate.getUTCHours()).padStart(2, "0");
  const m = String(jstDate.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
