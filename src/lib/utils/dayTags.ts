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
 *
 * is_poor_sleep は Phase 2.5 で UI 入力を廃止し sleep_hours に置き換えた。
 * DB カラムとしては残存するため型には含めるが、DAY_TAGS 配列には含まない
 * (入力UIに表示しない)。
 * 既存データの表示互換 (WeeklyReviewCard / calcWeeklyReview) のため型には残す。
 */
export type DayTag =
  | "is_cheat_day"
  | "is_refeed_day"
  | "is_eating_out"
  | "is_poor_sleep"; // @deprecated 入力UI廃止。表示互換のため型に残す。

/**
 * 入力 UI に表示するタグ一覧。
 * is_poor_sleep は除外済み (sleep_hours に移行)。
 */
export const DAY_TAGS: DayTag[] = [
  "is_cheat_day",
  "is_refeed_day",
  "is_eating_out",
  // is_poor_sleep は UI 入力廃止のためここには含めない
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

/**
 * 入力 UI に表示するタグを false で初期化したオブジェクトを返す。
 * is_poor_sleep は入力 UI から廃止されたため含まない。
 */
export function emptyTagState(): Pick<Record<DayTag, boolean>, "is_cheat_day" | "is_refeed_day" | "is_eating_out"> {
  return {
    is_cheat_day:  false,
    is_refeed_day: false,
    is_eating_out: false,
  };
}
