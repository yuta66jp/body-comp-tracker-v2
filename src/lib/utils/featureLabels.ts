/**
 * AI因子分析で使用する特徴量キーから表示ラベルへのマッピング。
 *
 * ── 同期フロー ───────────────────────────────────────────────────────────────
 * 特徴量の正本は ml-pipeline/feature_registry.py にある。
 * アクティブ特徴量を追加・削除したときの手順:
 *
 *   1. feature_registry.py で FeatureDef の active フラグを変更する
 *   2. ACTIVE_FEATURE_NAMES を同期させる（追加 or 削除）
 *      → TypeScript が ACTIVE_FEATURE_EXPLANATIONS の未記入キーをコンパイルエラーで検出する
 *   3. ACTIVE_FEATURE_EXPLANATIONS に label / direction / note / hint の 4 フィールドを追記する
 *
 * ── 将来の特徴量候補 ─────────────────────────────────────────────────────────
 * inactive 特徴量は FEATURE_LABEL_MAP（後半）に label のみ残しておく。
 * direction / note / hint は active 化のタイミングで ACTIVE_FEATURE_EXPLANATIONS に追加する。
 */

// ── アクティブ特徴量（ml-pipeline/feature_registry.py と同期させること）────

/**
 * 現在 XGBoost モデルで使用中の特徴量名リスト。
 * feature_registry.py の active=True に対応する。
 * TypeScript は ACTIVE_FEATURE_EXPLANATIONS の完全性をここで保証する。
 */
export const ACTIVE_FEATURE_NAMES = [
  "cal_lag1",
  "rolling_cal_7",
  "p_lag1",
  "f_lag1",
  "c_lag1",
] as const;

export type ActiveFeatureName = typeof ACTIVE_FEATURE_NAMES[number];

interface ActiveFeatureExplanation {
  /** 表示ラベル（単位付き） */
  label: string;
  /**
   * 統計的関連の方向（目安・ドメイン知識ベース）。
   * XGBoost の feature_importances_ は大きさのみを示すため、
   * ここの方向は因果ではなく「目安」として扱う。
   */
  direction: string;
  /** 補足説明（短く・断定的にしない） */
  note: string;
  /**
   * 1位特徴量に出たときの「次に確認するとよいこと」。
   * 断定しない・短い・次の確認観点につながる文にすること。
   */
  hint: string;
}

/**
 * アクティブ特徴量の説明オブジェクト。
 * Record<ActiveFeatureName, ...> により、ACTIVE_FEATURE_NAMES に存在するすべてのキーに
 * label / direction / note / hint の 4 フィールドが揃っているかを TypeScript が保証する。
 */
const ACTIVE_FEATURE_EXPLANATIONS: Record<ActiveFeatureName, ActiveFeatureExplanation> = {
  cal_lag1: {
    label:     "摂取 kcal（当日）",
    direction: "↑ 多いと体重↑傾向",
    note:      "翌日体重変化量への直接的な影響",
    hint:      "総摂取量と翌日体重変化量の関係を継続的に確認すると、自分のカロリー感度が見えてくるかもしれません。",
  },
  rolling_cal_7: {
    label:     "摂取 kcal（週平均）",
    direction: "↑ 多いと体重↑傾向",
    note:      "食習慣の傾向を反映",
    hint:      "単日より週単位の摂取傾向が体重に反映されている可能性があります。週平均を安定させることが示唆されます。",
  },
  p_lag1: {
    label:     "タンパク質（g）",
    direction: "↑ 多いと体重↑傾向",
    note:      "筋合成・水分保持を通じた影響",
    hint:      "タンパク質摂取は筋合成・水分保持を通じた体重変動と関連することがあります。絶対量より他栄養素とのバランスも確認してみてください。",
  },
  f_lag1: {
    label:     "脂質（g）",
    direction: "↑ 多いと体重↑傾向",
    note:      "消化・吸収が緩やか",
    hint:      "脂質は消化・吸収が緩やかなため、前日の影響が翌日に残る場合があります。脂質量の日内変動を確認してみてください。",
  },
  c_lag1: {
    label:     "炭水化物（g）",
    direction: "↑ 多いと体重↑傾向",
    note:      "グリコーゲン貯蔵と水分保持の影響が大きい",
    hint:      "炭水化物はグリコーゲン貯蔵・水分保持を通じた体重変動が出やすい栄養素です。チートデイやリフィード後の変動と照らし合わせてみてください。",
  },
};

// ── 将来の特徴量候補（ラベルのみ）───────────────────────────────────────────
//
// active 化のタイミングで ACTIVE_FEATURE_NAMES と ACTIVE_FEATURE_EXPLANATIONS に移動する。

const INACTIVE_FEATURE_LABEL_MAP: Readonly<Record<string, string>> = {
  // numeric
  calories:    "摂取 kcal",
  protein:     "タンパク質（g）",
  fat:         "脂質（g）",
  carbs:       "炭水化物（g）",
  weight:      "体重（kg）",
  sleep_hours: "睡眠時間（h）",

  // boolean / flag
  had_bowel_movement: "便通あり",
  is_cheat_day:       "チートデイ",
  is_refeed_day:      "リフィードデイ",
  is_eating_out:      "外食日",
  is_poor_sleep:      "睡眠不足",
  leg_flag:           "脚トレ日",

  // category
  training_type: "トレーニング種別",
  work_mode:     "勤務形態",
};

// ── 公開 API ─────────────────────────────────────────────────────────────────

/**
 * 全特徴量（active + inactive）の label を束ねた後方互換マップ。
 * FactorAnalysis など、active でないキーも扱う箇所で使用する。
 */
export const FEATURE_LABEL_MAP: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    ACTIVE_FEATURE_NAMES.map((k) => [k, ACTIVE_FEATURE_EXPLANATIONS[k].label])
  ),
  ...INACTIVE_FEATURE_LABEL_MAP,
};

/**
 * 特徴量キーから表示ラベルを解決する。
 *
 * 優先順:
 *   1. ACTIVE_FEATURE_EXPLANATIONS（active 特徴量）
 *   2. INACTIVE_FEATURE_LABEL_MAP（将来候補）
 *   3. fallbackLabel（バックエンドが payload に保存したラベル）
 *   4. キーをそのまま返す（表示崩れを防ぐ最終 fallback）
 */
export function getFeatureLabel(key: string, fallbackLabel?: string): string {
  return FEATURE_LABEL_MAP[key] ?? fallbackLabel ?? key;
}

/** 傾向を返す。active 特徴量のみ登録済み。未登録は null。 */
export function getFeatureDirection(key: string): string | null {
  const name = key as ActiveFeatureName;
  return ACTIVE_FEATURE_EXPLANATIONS[name]?.direction ?? null;
}

/** 補足説明を返す。active 特徴量のみ登録済み。未登録は null。 */
export function getFeatureNote(key: string): string | null {
  const name = key as ActiveFeatureName;
  return ACTIVE_FEATURE_EXPLANATIONS[name]?.note ?? null;
}

/** 解釈ヒントを返す。active 特徴量のみ登録済み。未登録は null。 */
export function getFeatureHint(key: string): string | null {
  const name = key as ActiveFeatureName;
  return ACTIVE_FEATURE_EXPLANATIONS[name]?.hint ?? null;
}

// ── 後方互換エクスポート（テスト・外部参照用）───────────────────────────────
//
// 旧コードが FEATURE_DIRECTION_MAP / FEATURE_NOTE_MAP / FEATURE_HINT_MAP を直接参照している場合に備えて
// active 特徴量分のみ再エクスポートする。

export const FEATURE_DIRECTION_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  ACTIVE_FEATURE_NAMES.map((k) => [k, ACTIVE_FEATURE_EXPLANATIONS[k].direction])
);

export const FEATURE_NOTE_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  ACTIVE_FEATURE_NAMES.map((k) => [k, ACTIVE_FEATURE_EXPLANATIONS[k].note])
);

export const FEATURE_HINT_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  ACTIVE_FEATURE_NAMES.map((k) => [k, ACTIVE_FEATURE_EXPLANATIONS[k].hint])
);
