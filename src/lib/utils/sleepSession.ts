/**
 * sleepSession.ts — sleep_sessions モデルのユーティリティ (#515)
 *
 * sleep_sessions テーブルへの保存に使う TIMESTAMPTZ 文字列の組み立てと
 * sleep duration の計算を担う。
 *
 * ## 設計方針
 *
 * - `bed_at` / `wake_at` は ISO 8601 + JST オフセット (+09:00) の文字列として組み立てる
 *   → PostgreSQL の TIMESTAMPTZ が UTC に変換して保存する
 * - JST 固定: このアプリは個人利用・日本国内のため TZ は +09:00 にハードコードする
 * - 日付決定ルール:
 *     bedTimeHHMM > wakeTimeHHMM → 前日夜就寝 → bed_date = wake_date - 1日
 *     それ以外                   → 当日就寝   → bed_date = wake_date
 *
 * ## canonical ケース (wake_date = 2026-04-08)
 *
 *   前日夜就寝: bed=23:30, wake=07:00
 *     → "23:30" > "07:00" → bed_date = 2026-04-07
 *     → bed_at="2026-04-07T23:30:00+09:00", wake_at="2026-04-08T07:00:00+09:00", 7.5h
 *
 *   当日深夜就寝: bed=01:00, wake=08:00
 *     → "01:00" < "08:00" → bed_date = 2026-04-08
 *     → bed_at="2026-04-08T01:00:00+09:00", wake_at="2026-04-08T08:00:00+09:00", 7.0h
 *
 *   早朝就寝: bed=04:00, wake=10:00
 *     → "04:00" < "10:00" → bed_date = 2026-04-08
 *     → bed_at="2026-04-08T04:00:00+09:00", wake_at="2026-04-08T10:00:00+09:00", 6.0h
 *
 *   当日夜就寝(翌日分): wake_date=2026-04-09, bed=23:00, wake=08:00
 *     → "23:00" > "08:00" → bed_date = 2026-04-08
 *     → bed_at="2026-04-08T23:00:00+09:00", wake_at="2026-04-09T08:00:00+09:00", 9.0h
 */

import { addDaysStr, parseLocalDateStr } from "./date";

/** JST タイムゾーンオフセット文字列。TIMESTAMPTZ 組み立て時に付加する。 */
const JST_OFFSET = "+09:00";

/**
 * HH:MM 形式の時刻文字列を検証する。
 * 有効な場合は true を返す。
 */
function isValidHHMM(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr ?? "", 10);
  const m = parseInt(mStr ?? "", 10);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * wake_date / 就寝時刻 / 起床時刻から TIMESTAMPTZ 用の ISO 8601 文字列を組み立てる。
 *
 * @param wakeDate     起床日 "YYYY-MM-DD"
 * @param bedTimeHHMM  就寝時刻 "HH:MM"
 * @param wakeTimeHHMM 起床時刻 "HH:MM"
 * @returns { bedAt, wakeAt } ISO 8601 文字列 (JST +09:00 付き)
 *          入力が不正な場合は null
 *
 * 日付決定ルール:
 *   bedTimeHHMM > wakeTimeHHMM (辞書順) → 前日夜就寝 → bed_date = wakeDate - 1日
 *   それ以外                            → 当日就寝   → bed_date = wakeDate
 */
export function buildSleepSessionDatetimes(
  wakeDate: string,
  bedTimeHHMM: string,
  wakeTimeHHMM: string
): { bedAt: string; wakeAt: string } | null {
  // wake_date の検証
  if (parseLocalDateStr(wakeDate) === null) return null;

  // HH:MM の検証
  if (!isValidHHMM(bedTimeHHMM) || !isValidHHMM(wakeTimeHHMM)) return null;

  // bed_date の決定
  // HH:MM 文字列は "HH:MM" 形式が保証されているため辞書順比較が時刻比較と一致する
  const bedDate =
    bedTimeHHMM > wakeTimeHHMM
      ? addDaysStr(wakeDate, -1) // 前日夜就寝
      : wakeDate;                // 当日就寝

  if (bedDate === null) return null;

  return {
    bedAt:  `${bedDate}T${bedTimeHHMM}:00${JST_OFFSET}`,
    wakeAt: `${wakeDate}T${wakeTimeHHMM}:00${JST_OFFSET}`,
  };
}

/**
 * TIMESTAMPTZ 文字列のペアから睡眠時間 (h, 小数点 1 桁) を算出する。
 *
 * `deriveSleepHours()` (sleep.ts) は TIME 文字列ベースだが、
 * 本関数は TIMESTAMPTZ (ISO 8601) を使うため日付曖昧性がない。
 *
 * @param bedAt  就寝日時 ISO 8601 文字列 (例: "2026-04-07T23:30:00+09:00")
 * @param wakeAt 起床日時 ISO 8601 文字列 (例: "2026-04-08T07:00:00+09:00")
 * @returns 睡眠時間 (h, 小数点 1 桁)。不正入力または 0h 以下 / 24h 以上は null。
 */
export function calcSleepDurationHours(
  bedAt: string,
  wakeAt: string
): number | null {
  const bed  = new Date(bedAt);
  const wake = new Date(wakeAt);

  if (isNaN(bed.getTime()) || isNaN(wake.getTime())) return null;

  const diffMs = wake.getTime() - bed.getTime();
  if (diffMs <= 0) return null;

  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours >= 24) return null;

  const rounded = Math.round(diffHours * 10) / 10;
  // 丸め後も境界チェック
  if (rounded <= 0 || rounded >= 24) return null;

  return rounded;
}
