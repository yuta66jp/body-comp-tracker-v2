/**
 * 推定睡眠時間算出ユーティリティ
 *
 * bed_time (就寝時刻) と wake_up_time (起床時刻) から
 * 推定睡眠時間 (sleep_hours) を算出する純粋関数群。
 *
 * ## 起床日基準（#507）
 *
 * sleep_hours は「log_date（起床日）に属する睡眠セッション」の長さを表す。
 * bed_time が前日夜・当日深夜・早朝のいずれであっても、
 * wake_up_time（= 起床時刻。sleep_sessions.wake_at を extractJstHHMM で変換した値）
 * と同じ log_date に属する値として扱う。
 *
 * 例（いずれも log_date = 2026-04-08）:
 *   - 前日夜就寝: bed_time=23:30, wake_up_time=07:00 → 7.5h （日またぎ補正あり）
 *   - 当日深夜就寝: bed_time=01:30, wake_up_time=08:00 → 6.5h
 *   - 早朝就寝: bed_time=04:00, wake_up_time=10:00 → 6.0h
 *
 * 設計方針:
 *   - 計算ロジックをここに集約し、UI 側での再実装を禁止する
 *   - 日またぎ補正: wake_up_time <= bed_time の場合、wake_up_time に 24h を加算
 *     （log_date の朝 = bed_time の翌朝にあたるため）
 *   - 有効範囲: (0, 24) — 0h 以下・24h 以上は異常値として null を返す
 *   - 結果は小数点以下 1 桁に丸める (例: 7.5h)
 */

/**
 * "HH:MM" または "HH:MM:SS" 形式の時刻文字列を「深夜0時からの分数」に変換する。
 * 形式が不正な場合は null を返す。
 */
function timeToMinutes(time: string): number | null {
  const parts = time.split(":");
  if (parts.length < 2 || parts.length > 3) return null;

  const h = parseInt(parts[0] ?? "", 10);
  const m = parseInt(parts[1] ?? "", 10);
  const s = parts.length === 3 ? parseInt(parts[2] ?? "", 10) : 0;

  if (
    isNaN(h) || isNaN(m) || isNaN(s) ||
    h < 0 || h > 23 ||
    m < 0 || m > 59 ||
    s < 0 || s > 59
  ) {
    return null;
  }

  return h * 60 + m + s / 60;
}

/**
 * bed_time と wake_up_time から推定睡眠時間 (sleep_hours) を算出する。
 *
 * 起床日基準: bedTime は log_date の朝に起床した睡眠セッションの開始時刻を表す。
 * 前日夜（23:30 等）・当日深夜（01:30 等）・早朝（04:00 等）のいずれも同じ計算式で処理する。
 *
 * #526: wake_up_time は sleep_sessions.wake_at を extractJstHHMM で JST 変換した値。
 *
 * @param bedTime     就寝時刻 "HH:MM" または "HH:MM:SS"
 *                    （この log_date の朝の起床に対応する睡眠セッションの開始時刻）
 * @param wakeUpTime  起床時刻 "HH:MM" または "HH:MM:SS"（sleep_sessions.wake_at の JST 変換値）
 * @returns 推定睡眠時間 (h, 小数点以下 1 桁)、または null (算出不能・異常値)
 *
 * 仕様:
 *   - wakeUpTime <= bedTime: 日またぎとみなし wakeUpTime に 24h を加算
 *     （log_date の朝 = bedTime の翌朝にあたる前日夜就寝ケース）
 *   - 有効範囲: 0h 超かつ 24h 未満 (境界値を除く)
 *     - 0h 以下: 同一時刻または wakeUpTime が bedTime より前すぎる異常値
 *     - 24h 以上: 就寝・起床が同一時刻 (日またぎ補正後 24h) = 異常値
 *   - 時刻形式が不正な場合は null を返す
 */
export function deriveSleepHours(
  bedTime: string,
  wakeUpTime: string
): number | null {
  const bedMin = timeToMinutes(bedTime);
  const weighMin = timeToMinutes(wakeUpTime);

  if (bedMin === null || weighMin === null) return null;

  // 日またぎ補正: wakeUpTime <= bedTime → 前日夜就寝（log_date の朝が bedTime の翌朝）
  const adjustedWeighMin = weighMin <= bedMin ? weighMin + 24 * 60 : weighMin;

  const diffHours = (adjustedWeighMin - bedMin) / 60;

  // 有効範囲: (0, 24) — 境界値は異常値として除外
  if (diffHours <= 0 || diffHours >= 24) return null;

  // 小数点以下 1 桁に丸め
  const rounded = Math.round(diffHours * 10) / 10;

  // 丸め後も範囲チェック: 極端に短い睡眠が 0h に丸められた場合 / 23h59m が 24h に丸められた場合
  if (rounded <= 0 || rounded >= 24) return null;

  return rounded;
}
