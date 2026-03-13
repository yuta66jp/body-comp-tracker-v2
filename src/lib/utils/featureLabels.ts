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

// ── 傾向・補足マップ ─────────────────────────────────────────────────────────
//
// 傾向は「統計的な関連の方向」であり因果関係ではない。
// XGBoost の feature_importances_ は重要度の大きさのみを示すため、
// ここに記載する方向は栄養学的ドメイン知識に基づく「目安」として扱う。

/**
 * 特徴量ごとの傾向（統計的関連の方向、目安）。
 * "↑ 多い → 翌日体重↑ 傾向" のように短く記述する。
 */
export const FEATURE_DIRECTION_MAP: Readonly<Record<string, string>> = {
  // 現在の XGBoost 特徴量
  cal_lag1:      "↑ 多いと体重↑傾向",
  rolling_cal_7: "↑ 多いと体重↑傾向",
  p_lag1:        "↑ 多いと体重↑傾向",
  f_lag1:        "↑ 多いと体重↑傾向",
  c_lag1:        "↑ 多いと体重↑傾向",
  // 将来の特徴量候補
  calories:      "↑ 多いと体重↑傾向",
  protein:       "↑ 多いと体重↑傾向",
  fat:           "↑ 多いと体重↑傾向",
  carbs:         "↑ 多いと体重↑傾向",
  sleep_hours:   "↑ 長いと体重↓傾向",
  had_bowel_movement: "あり → 体重↓傾向",
  leg_flag:      "脚トレ翌日は体重↑傾向",
  is_cheat_day:  "あり → 体重↑傾向",
  is_refeed_day: "あり → 体重↑傾向",
};

/**
 * 特徴量ごとの補足説明（短く・断定的にしない）。
 */
export const FEATURE_NOTE_MAP: Readonly<Record<string, string>> = {
  // 現在の XGBoost 特徴量
  cal_lag1:      "翌日体重への直接的な影響",
  rolling_cal_7: "食習慣の傾向を反映",
  p_lag1:        "筋合成・水分保持を通じた影響",
  f_lag1:        "消化・吸収が緩やか",
  c_lag1:        "グリコーゲン貯蔵と水分保持の影響が大きい",
  // 将来の特徴量候補
  sleep_hours:         "回復・代謝への間接的影響",
  had_bowel_movement:  "腸内容物による一時的な変動",
  leg_flag:            "DOMS による水分移動の影響",
  is_cheat_day:        "高カロリー摂取と水分保持",
};

/** 傾向を返す。登録がなければ null。 */
export function getFeatureDirection(key: string): string | null {
  return FEATURE_DIRECTION_MAP[key] ?? null;
}

/** 補足説明を返す。登録がなければ null。 */
export function getFeatureNote(key: string): string | null {
  return FEATURE_NOTE_MAP[key] ?? null;
}
