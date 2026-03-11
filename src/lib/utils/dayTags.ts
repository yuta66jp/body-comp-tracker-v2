/**
 * 特殊日タグ定義 (dayTags)
 *
 * - タグ名・ラベル・カラーの単一定義源
 * - UI (MealLogger, RecentLogsTable, WeeklyReviewCard) はここからインポートする
 * - 将来タグを追加する場合はここに追記し、型に反映させる
 *
 * 今回実装しないタグ:
 *   is_high_sodium — 判定基準が主観的で入力一貫性を保ちにくいため除外
 */

/** 特殊日タグ名のユニオン型 */
export type DayTag =
  | "is_cheat_day"
  | "is_refeed_day"
  | "is_eating_out"
  | "is_poor_sleep";

/** タグの定義順 (UI 表示順と一致させる) */
export const DAY_TAGS: DayTag[] = [
  "is_cheat_day",
  "is_refeed_day",
  "is_eating_out",
  "is_poor_sleep",
];

/** 日本語ラベル */
export const DAY_TAG_LABELS: Record<DayTag, string> = {
  is_cheat_day:  "チートデイ",
  is_refeed_day: "リフィード",
  is_eating_out: "外食",
  is_poor_sleep: "睡眠不良",
};

/** バッジ用カラークラス (非アクティブ時: リスト表示など) */
export const DAY_TAG_BADGE_COLORS: Record<DayTag, string> = {
  is_cheat_day:  "bg-rose-100 text-rose-700",
  is_refeed_day: "bg-amber-100 text-amber-700",
  is_eating_out: "bg-blue-100 text-blue-700",
  is_poor_sleep: "bg-purple-100 text-purple-700",
};

/** トグルボタン用カラークラス (アクティブ時) */
export const DAY_TAG_ACTIVE_COLORS: Record<DayTag, string> = {
  is_cheat_day:  "bg-rose-500 text-white border-rose-500",
  is_refeed_day: "bg-amber-500 text-white border-amber-500",
  is_eating_out: "bg-blue-500 text-white border-blue-500",
  is_poor_sleep: "bg-purple-500 text-white border-purple-500",
};

/** 全タグを false で初期化したオブジェクトを返す */
export function emptyTagState(): Record<DayTag, boolean> {
  return {
    is_cheat_day:  false,
    is_refeed_day: false,
    is_eating_out: false,
    is_poor_sleep: false,
  };
}
