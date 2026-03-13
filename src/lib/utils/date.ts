/**
 * date.ts — JST 基準の日付ユーティリティ
 *
 * 背景:
 *   - UTC サーバー（Next.js SSR・GitHub Actions など）と JST ブラウザで
 *     「今日の日付」が食い違う問題がある。
 *   - `new Date().toISOString().slice(0, 10)` は UTC 日付を返すため、
 *     JST の 00:00〜08:59 では前日の日付になる。
 *   - `getFullYear() / getMonth() / getDate()` は実行環境のローカル TZ 依存のため、
 *     UTC サーバー上では JST とは異なる日付を返す。
 *
 * 対策:
 *   - 日付文字列を生成する関数 (toJstDateStr) は UTC+9 オフセットを加算して
 *     JST の日付として固定する。環境の TZ 設定に依存しない。
 *   - 日付文字列を解釈する関数 (parseLocalDateStr) はローカル Date を生成する。
 *     addDaysStr / dateRangeStr は文字列 → Date → 文字列 の変換をするため、
 *     JST で統一される。
 *
 * 責務の分離:
 *   - toJstDateStr()     : Date → YYYY-MM-DD 文字列（JST 固定）
 *   - parseLocalDateStr(): YYYY-MM-DD 文字列 → Date（入力検証付き）
 *   - daysBetween()     : date-only 同士の差分日数 (to - from). 全差分計算の基盤
 *   - calcDaysLeft()    : daysBetween のラッパー（today→target、正=未来）
 *   - addDaysStr()      : YYYY-MM-DD + N日 → YYYY-MM-DD
 *   - dateRangeStr()    : from 〜 to の YYYY-MM-DD 配列
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9

/**
 * 指定した Date（省略時は現在時刻）を JST 基準の YYYY-MM-DD 形式に変換する。
 *
 * 実行環境の TZ 設定（UTC サーバー / JST ブラウザ）に関係なく、
 * 常に JST の日付文字列を返す。
 *
 * @param date - 変換対象の Date。省略時は `new Date()` を使用。
 * @returns "YYYY-MM-DD" 形式の文字列（JST 基準）
 */
export function toJstDateStr(date: Date = new Date()): string {
  // UTC+9 オフセットを加算して JST の「今の時刻」を UTC の世界で表現し、
  // ISO 文字列の日付部分を取り出す。
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}

/**
 * @deprecated toJstDateStr() を使用してください。
 * 実行環境依存のローカルタイムゾーンで日付を生成していたが、
 * UTC サーバーと JST ブラウザで結果が異なるため JST 固定の toJstDateStr に移行。
 */
export function toLocalDateStr(date?: Date): string {
  return toJstDateStr(date);
}

/**
 * "YYYY-MM-DD" 文字列を Date に変換する（入力検証付き）。
 *
 * `new Date("YYYY-MM-DD")` は UTC 午前0時として解釈されるため使用しない。
 * 本関数は `new Date(y, m-1, d)` でローカル午前0時の Date を返す。
 * addDaysStr / dateRangeStr の内部で使用し、最終的に toJstDateStr() で
 * JST の YYYY-MM-DD 文字列に変換される。
 *
 * 以下の入力は不正とみなし null を返す:
 * - "YYYY-MM-DD" 形式でない ("abc", "2026/03/01", 空文字)
 * - 月が 1〜12 の範囲外 ("2026-13-01")
 * - 実在しない日付 ("2026-02-31")
 *
 * @param s - "YYYY-MM-DD" 形式の文字列
 * @returns Date オブジェクト。不正な入力は null。
 */
export function parseLocalDateStr(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * 2つの YYYY-MM-DD 文字列間のカレンダー日数差を返す（低レベル基盤関数）。
 *
 * 戻り値: (to - from) の日数。
 *   正  = to が from より未来
 *   0   = 同日
 *   負  = to が from より過去
 *   null = どちらかの日付が不正
 *
 * date-only 文字列を parseLocalDateStr で「ローカル午前0時の Date」に変換して
 * 差分を取るため、UTC サーバー / JST ブラウザどちらでも結果が一致する。
 * `new Date("YYYY-MM-DD")` が UTC 午前0時として解釈されるズレを回避している。
 *
 * アプリ内の全 daysOut / 差分日数計算はこの関数を経由すること。
 * - calcDaysLeft(today, target)   → daysBetween(today, target)
 * - daysOut (大会基準)             → daysBetween(targetDate, logDate)
 * - calcTodayDaysOut              → daysBetween(contestDate, todayStr)
 *
 * @param from  起点日 (YYYY-MM-DD)
 * @param to    終点日 (YYYY-MM-DD)
 * @returns 差分日数 (整数)。どちらかの日付が不正なら null。
 */
export function daysBetween(from: string, to: string): number | null {
  const f = parseLocalDateStr(from);
  const t = parseLocalDateStr(to);
  if (f === null || t === null) return null;
  // parseLocalDateStr は同一環境での「ローカル午前0時」を返すため
  // 差分は必ず整数日数になる (Math.round は念のため)
  return Math.round((t.getTime() - f.getTime()) / 86_400_000);
}

/**
 * 2つの YYYY-MM-DD 文字列間のカレンダー日数差を返す。
 *
 * 戻り値の意味:
 *   正  = target が today より未来（残り日数）
 *   0   = target が today と同じ日（その日が大会日など）
 *   負  = target が today より過去
 *   null = どちらかの日付が不正
 *
 * KpiCards / GoalNavigator / calcReadiness はすべてこの関数を参照することで
 * 残り日数の定義を一箇所に統一する。
 *
 * 内部実装: daysBetween(today, target)
 *
 * @param today  基準日 (YYYY-MM-DD). 通常は toJstDateStr() の戻り値を渡す。
 * @param target 目標日 (YYYY-MM-DD). コンテスト日など。
 * @returns カレンダー日数差 (整数)。どちらかの日付が不正なら null。
 */
export function calcDaysLeft(today: string, target: string): number | null {
  return daysBetween(today, target);
}

/**
 * ある日付に指定日数を加算した日付を YYYY-MM-DD で返す（JST 基準）。
 *
 * @param base - 基準日 (YYYY-MM-DD)
 * @param days - 加算する日数（負の値で減算）
 * @returns YYYY-MM-DD 文字列（JST 基準）。base が不正な場合は null。
 */
export function addDaysStr(base: string, days: number): string | null {
  const d = parseLocalDateStr(base);
  if (d === null) return null;
  d.setDate(d.getDate() + days);
  return toJstDateStr(d);
}

/**
 * from 〜 to の範囲の日付文字列配列を返す（両端を含む、JST 基準）。
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
    dates.push(toJstDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
