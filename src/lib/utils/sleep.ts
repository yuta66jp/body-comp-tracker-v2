/**
 * 睡眠時間算出ユーティリティ
 *
 * bed_time (就寝時刻) と weigh_in_time (起床・体重測定時刻) から
 * 推定睡眠時間 (sleep_hours) を算出する純粋関数群。
 *
 * 設計方針:
 *   - 計算ロジックをここに集約し、UI 側での再実装を禁止する
 *   - 日またぎ補正: bed_time > weigh_in_time の場合は翌朝とみなし 24h を加算
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
 * bed_time と weigh_in_time から推定睡眠時間 (sleep_hours) を算出する。
 *
 * @param bedTime     就寝時刻 "HH:MM" または "HH:MM:SS"
 * @param weighInTime 起床・体重測定時刻 "HH:MM" または "HH:MM:SS"
 * @returns 推定睡眠時間 (h, 小数点以下 1 桁)、または null (算出不能・異常値)
 *
 * 仕様:
 *   - bed_time > weigh_in_time: 日またぎとみなし weigh_in_time に 24h を加算
 *   - 有効範囲: 0h 超かつ 24h 未満 (境界値を除く)
 *     - 0h 以下: 同一時刻または weigh_in_time が bed_time より前すぎる異常値
 *     - 24h 以上: 就寝・起床が同一時刻 (日またぎ補正後 24h) = 異常値
 *   - 時刻形式が不正な場合は null を返す
 */
export function deriveSleepHours(
  bedTime: string,
  weighInTime: string
): number | null {
  const bedMin = timeToMinutes(bedTime);
  const weighMin = timeToMinutes(weighInTime);

  if (bedMin === null || weighMin === null) return null;

  // 日またぎ補正: weigh_in_time <= bed_time なら翌朝とみなす
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
