/**
 * calendarUtils — 月間カレンダー表示用データ変換
 *
 * DailyLog[] を YYYY-MM-DD キーの Map に変換し、各日のカレンダーセル描画に必要な
 * 情報（体重差分・カロリー差分・特殊日タグ・コンディション）を導出する。
 *
 * 差分計算ルール:
 *   体重差分: ログ日付昇順で並べたとき、直前に体重記録があるエントリとの差分。
 *             欠損日をまたぐ（例: 月曜→木曜）場合も直前ログとの差分を返す。
 *   カロリー差分: 同じく直前にカロリー記録があるエントリとの差分。
 */

import type { DailyLog } from "@/lib/supabase/types";
import { DAY_TAGS, DAY_TAG_LABELS, DAY_TAG_BADGE_COLORS } from "./dayTags";
import { formatConditionSummary } from "./trainingType";

// ── 型定義 ──────────────────────────────────────────────────────────────────

export interface CalendarDayTagInfo {
  key: string;
  label: string;
  colorClass: string;
}

/**
 * 1日分のカレンダーセル表示データ。
 * ログが存在する日のみ Map に含まれる（ログなし日は undefined）。
 */
export interface CalendarDayData {
  log: DailyLog;
  /** 直前体重記録との差分。直前ログがないか、体重 null の場合は null */
  weightDelta: number | null;
  /** 直前カロリー記録との差分。直前ログがないか、calories null の場合は null */
  calDelta: number | null;
  /** 有効な特殊日タグ（true のものだけ） */
  dayTags: CalendarDayTagInfo[];
  /**
   * 便通・トレーニング種別・勤務形態の一行整形テキスト。
   * 表示項目がない場合は null。
   */
  conditionSummary: string | null;
}

// ── 主要関数 ──────────────────────────────────────────────────────────────

/**
 * DailyLog[] を YYYY-MM-DD キーの CalendarDayData マップに変換する。
 *
 * - ログが存在しない日は Map に含まれない
 * - 差分は「直前のログ日の記録値」との差分（欠損日を跨ぐ）
 */
export function buildCalendarDayMap(logs: DailyLog[]): Map<string, CalendarDayData> {
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));

  // 体重・カロリーそれぞれの「記録ありログ」リスト（差分計算用）
  const withWeight = sorted.filter((d) => d.weight !== null);
  const withCals   = sorted.filter((d) => d.calories !== null);

  const map = new Map<string, CalendarDayData>();

  for (const log of sorted) {
    // 体重差分
    let weightDelta: number | null = null;
    if (log.weight !== null) {
      const idx = withWeight.findIndex((d) => d.log_date === log.log_date);
      if (idx > 0) {
        weightDelta = Math.round((log.weight - withWeight[idx - 1].weight!) * 100) / 100;
      }
    }

    // カロリー差分
    let calDelta: number | null = null;
    if (log.calories !== null) {
      const idx = withCals.findIndex((d) => d.log_date === log.log_date);
      if (idx > 0) {
        calDelta = Math.round(log.calories - withCals[idx - 1].calories!);
      }
    }

    // 特殊日タグ（true のもののみ）
    const dayTags: CalendarDayTagInfo[] = DAY_TAGS
      .filter((tag) => log[tag])
      .map((tag) => ({
        key:        tag,
        label:      DAY_TAG_LABELS[tag],
        colorClass: DAY_TAG_BADGE_COLORS[tag],
      }));

    // コンディション情報
    const conditionSummary = formatConditionSummary({
      had_bowel_movement: log.had_bowel_movement as boolean | null,
      training_type:      log.training_type,
      work_mode:          log.work_mode,
    });

    map.set(log.log_date, { log, weightDelta, calDelta, dayTags, conditionSummary });
  }

  return map;
}

/**
 * Date オブジェクトを YYYY-MM-DD 文字列に変換する（ローカル日付）。
 *
 * `new Date(dateStr)` は UTC 解釈になるため使用禁止。
 * DayPicker が渡す Date は JS の new Date(year, monthIndex, day) で生成される
 * ローカル日付のため、この関数でローカル年月日を取り出す。
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
