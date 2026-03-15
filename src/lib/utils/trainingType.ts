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
  "off",
  "chest",
  "back",
  "shoulders",
  "glutes_hamstrings",
  "quads",
] as const;

export type TrainingType = typeof TRAINING_TYPES[number];

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  off:               "オフ",
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
] as const;

export type WorkMode = typeof WORK_MODES[number];

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  off:    "休日",
  office: "出社",
  remote: "在宅",
};

// ── leg_flag 導出 ─────────────────────────────────────────────────────────────

/**
 * training_type から leg_flag を導出する。
 *
 * ルール:
 *   - quads または glutes_hamstrings → true  (レッグ日)
 *   - chest / back / shoulders / off → false (非レッグ日)
 *   - null / undefined (未入力)      → null  (未判定 ≠ false)
 *
 * off は「トレーニングなしと明示した日」であり、脚トレをしていないことが確定するため false。
 * null は「training_type 未記録」であり、脚トレの有無が不明なため null (≠ false)。
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

// ── 補助情報整形 ──────────────────────────────────────────────────────────────

/**
 * 日次ログの補助情報（便通・トレーニング種別・仕事モード）を
 * 表示用の1行テキストに整形する。
 *
 * - had_bowel_movement: null/undefined は非表示。false は「便通なし」として表示する
 * - training_type / work_mode: 未知値・null は非表示
 * - 表示項目を " / " で結合して返す
 * - 表示項目が1つもなければ null を返す
 *
 * 例: "便通あり / 四頭 / 在宅"、"便通なし / 出社"、null
 */
export function formatConditionSummary(params: {
  had_bowel_movement: boolean | null | undefined;
  training_type: string | null | undefined;
  work_mode: string | null | undefined;
}): string | null {
  const parts: string[] = [];

  // 便通: false は「便通なし」として表示 (null/undefined のみ除外)
  if (params.had_bowel_movement !== null && params.had_bowel_movement !== undefined) {
    parts.push(params.had_bowel_movement ? "便通あり" : "便通なし");
  }

  // training_type: 有効な enum 値のみ日本語化して表示
  if (params.training_type != null && isValidTrainingType(params.training_type)) {
    parts.push(TRAINING_TYPE_LABELS[params.training_type]);
  }

  // work_mode: 有効な enum 値のみ日本語化して表示
  if (params.work_mode != null && isValidWorkMode(params.work_mode)) {
    parts.push(WORK_MODE_LABELS[params.work_mode]);
  }

  return parts.length > 0 ? parts.join(" / ") : null;
}

/** training_type 文字列が有効値かどうかを検証する */
export function isValidTrainingType(v: string): v is TrainingType {
  return (TRAINING_TYPES as readonly string[]).includes(v);
}

/** work_mode 文字列が有効値かどうかを検証する */
export function isValidWorkMode(v: string): v is WorkMode {
  return (WORK_MODES as readonly string[]).includes(v);
}
