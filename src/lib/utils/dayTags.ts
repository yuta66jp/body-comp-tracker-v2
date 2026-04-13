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

/**
 * ユーザー入力可能な特殊日タグ名のユニオン型。
 */
export type DayTag =
  | "is_cheat_day"
  | "is_refeed_day"
  | "is_eating_out"
  | "is_travel_day"
  | "is_tanning_day"
  | "is_posing_day";

/** 入力 UI に表示するタグ一覧。 */
export const DAY_TAGS: DayTag[] = [
  "is_cheat_day",
  "is_refeed_day",
  "is_eating_out",
  "is_travel_day",
  "is_tanning_day",
  "is_posing_day",
];

/** 日本語ラベル */
export const DAY_TAG_LABELS: Record<DayTag, string> = {
  is_cheat_day:   "チートデイ",
  is_refeed_day:  "リフィード",
  is_eating_out:  "外食",
  is_travel_day:  "旅行",
  is_tanning_day: "タンニング",
  is_posing_day:  "ポージング",
};

/** バッジ用カラークラス (非アクティブ時: リスト表示など) */
export const DAY_TAG_BADGE_COLORS: Record<DayTag, string> = {
  is_cheat_day:   "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  is_refeed_day:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  is_eating_out:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  is_travel_day:  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  is_tanning_day: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  is_posing_day:  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

/** トグルボタン用カラークラス (アクティブ時) */
export const DAY_TAG_ACTIVE_COLORS: Record<DayTag, string> = {
  is_cheat_day:   "bg-rose-500 text-white border-rose-500",
  is_refeed_day:  "bg-amber-500 text-white border-amber-500",
  is_eating_out:  "bg-blue-500 text-white border-blue-500",
  is_travel_day:  "bg-teal-500 text-white border-teal-500",
  is_tanning_day: "bg-orange-500 text-white border-orange-500",
  is_posing_day:  "bg-purple-500 text-white border-purple-500",
};

/** 入力 UI に表示するタグを false で初期化したオブジェクトを返す。 */
export function emptyTagState(): Record<DayTag, boolean> {
  return {
    is_cheat_day:   false,
    is_refeed_day:  false,
    is_eating_out:  false,
    is_travel_day:  false,
    is_tanning_day: false,
    is_posing_day:  false,
  };
}
