/**
 * AI因子分析で使用する特徴量キーから表示ラベルへのマッピング。
 *
 * ルール:
 *   - 単位を持つ指標は括弧内に単位を明記する
 *   - boolean / flag 系は状態を示す短い表現にする
 *   - lag1 系（当日値）と rolling 系（期間平均）は「（当日）」「（週平均）」で区別する
 *
 * 追加手順:
 *   1. このマップに追記する
 *   2. analyze.py の FEATURE_LABELS と同期する
 */
export const FEATURE_LABEL_MAP: Readonly<Record<string, string>> = {
  // ── 現在の XGBoost 特徴量 (analyze.py FEATURE_COLS) ──────────────────────
  cal_lag1:      "摂取 kcal（当日）",
  rolling_cal_7: "摂取 kcal（週平均）",
  p_lag1:        "タンパク質（g）",
  f_lag1:        "脂質（g）",
  c_lag1:        "炭水化物（g）",

  // ── 将来の特徴量候補 ────────────────────────────────────────────────────
  // numeric
  calories:    "摂取 kcal",
  protein:     "タンパク質（g）",
  fat:         "脂質（g）",
  carbs:       "炭水化物（g）",
  weight:      "体重（kg）",
  sleep_hours: "睡眠時間（h）",

  // boolean / flag
  had_bowel_movement: "排便あり",
  is_cheat_day:       "チートデイ",
  is_refeed_day:      "リフィードデイ",
  is_eating_out:      "外食日",
  is_poor_sleep:      "睡眠不足",
  leg_flag:           "脚トレ日",

  // category
  training_type: "トレーニング種別",
  work_mode:     "勤務形態",
};

/**
 * 特徴量キーから表示ラベルを解決する。
 *
 * 優先順:
 *   1. FEATURE_LABEL_MAP に登録済みのキー
 *   2. fallbackLabel（バックエンドが payload に保存したラベル）
 *   3. キーをそのまま返す（表示崩れを防ぐ最終 fallback）
 */
export function getFeatureLabel(key: string, fallbackLabel?: string): string {
  return FEATURE_LABEL_MAP[key] ?? fallbackLabel ?? key;
}
