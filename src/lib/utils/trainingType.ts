/**
 * trainingType.ts — トレーニング部位・仕事モード定義 + leg_flag 導出
 *
 * 設計原則:
 *   - training_type はユーザー入力値 (DB 保存)
 *   - leg_flag は training_type から一意に導出される内部フラグ
 *   - leg_flag の判定ロジックはこのファイルに集約し、分散させない
 *   - ユーザーが leg_flag を直接入力することはない
 */

// ── training_type ────────────────────────────────────────────────────────────

export const TRAINING_TYPES = [
  "chest",
  "back",
  "shoulders",
  "glutes_hamstrings",
  "quads",
] as const;

export type TrainingType = typeof TRAINING_TYPES[number];

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  chest:             "胸",
  back:              "背中",
  shoulders:         "肩",
  glutes_hamstrings: "ハム・ケツ",
  quads:             "四頭",
};

// ── work_mode ────────────────────────────────────────────────────────────────

export const WORK_MODES = [
  "off",
  "office",
  "remote",
  "active",
  "travel",
  "other",
] as const;

export type WorkMode = typeof WORK_MODES[number];

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  off:    "休日",
  office: "出社",
  remote: "在宅",
  active: "活動",
  travel: "遠征",
  other:  "その他",
};

// ── leg_flag 導出 ─────────────────────────────────────────────────────────────

/**
 * training_type から leg_flag を導出する。
 *
 * ルール:
 *   - quads または glutes_hamstrings → true (レッグ日)
 *   - chest / back / shoulders      → false (非レッグ日)
 *   - null / undefined (未入力)     → null (未判定 ≠ false)
 *
 * ユーザーが leg_flag を直接編集する UI は作らない。
 * この関数が leg_flag の唯一の定義源。
 *
 * @param trainingType - DB に保存された training_type 値
 * @returns boolean | null
 */
export function deriveLegFlag(trainingType: TrainingType | string | null | undefined): boolean | null {
  if (trainingType == null) return null;
  return trainingType === "quads" || trainingType === "glutes_hamstrings";
}

/** training_type 文字列が有効値かどうかを検証する */
export function isValidTrainingType(v: string): v is TrainingType {
  return (TRAINING_TYPES as readonly string[]).includes(v);
}

/** work_mode 文字列が有効値かどうかを検証する */
export function isValidWorkMode(v: string): v is WorkMode {
  return (WORK_MODES as readonly string[]).includes(v);
}
