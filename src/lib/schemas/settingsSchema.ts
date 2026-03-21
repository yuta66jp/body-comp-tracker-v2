/**
 * Settings 保存スキーマ — バリデーションの canonical source はここ。
 *
 * UI 側・server action 側ともにこのファイルの型と関数を参照すること。
 * settings テーブルは key(PK) / value_num / value_str の構造を持つため、
 * 各設定キーが number か string かをここで明確に定義する。
 */

import { parseStrictNumber } from "@/lib/utils/parseNumber";

// ─── 設定キー一覧 ────────────────────────────────────────────────────────────

/** value_num に保存する数値系キー */
export const NUMERIC_SETTING_KEYS = [
  "goal_weight",
  "activity_factor",
  "height_cm",
  "age",
  "target_calories_kcal",
  "target_protein_g",
  "target_fat_g",
  "target_carbs_g",
] as const;

/** value_str に保存する文字列系キー */
export const STRING_SETTING_KEYS = [
  "current_season",
  "current_phase",
  "sex",
  "contest_date",
  "monthly_plan_overrides",
] as const;

export type NumericSettingKey = (typeof NUMERIC_SETTING_KEYS)[number];
export type StringSettingKey = (typeof STRING_SETTING_KEYS)[number];
export type SettingKey = NumericSettingKey | StringSettingKey;

// ─── 型 ─────────────────────────────────────────────────────────────────────

/**
 * 保存対象の設定値 (入力値は文字列で渡ってくることを前提)。
 *
 * 全フィールドが省略可能だが、省略したフィールドは parseSettings() 内で
 * null として扱われ DB に上書きされる。
 * これは部分更新インターフェースではなく、全項目一括保存を前提とした入力型である。
 * 一部キーだけを渡すと、残りのキーが null で消えるため注意すること。
 */
export interface SettingsInput {
  // 数値系 (文字列として渡し、schema 側で number に変換する)
  goal_weight?: string | null;
  activity_factor?: string | null;
  height_cm?: string | null;
  age?: string | null;
  target_calories_kcal?: string | null;
  target_protein_g?: string | null;
  target_fat_g?: string | null;
  target_carbs_g?: string | null;
  // 文字列系
  current_season?: string | null;
  current_phase?: string | null;
  sex?: string | null;
  contest_date?: string | null;
  /** JSON 文字列化した MonthlyGoalOverride[] */
  monthly_plan_overrides?: string | null;
}

/**
 * バリデーション・変換済みの DB upsert 用レコード型。
 * value_num と value_str の排他性はここで保証する。
 */
export interface SettingRecord {
  key: string;
  value_num: number | null;
  value_str: string | null;
}

/** バリデーションエラーの詳細 */
export interface SettingsValidationError {
  field: string;
  message: string;
}

/** parseSettings の戻り値 */
export type ParseSettingsResult =
  | { ok: true; records: SettingRecord[] }
  | { ok: false; errors: SettingsValidationError[] };

// ─── バリデーションルール ────────────────────────────────────────────────────

interface NumericRule {
  min: number;
  max: number;
  label: string;
}

const NUMERIC_RULES: Record<NumericSettingKey, NumericRule> = {
  goal_weight:          { min: 20,  max: 200,  label: "目標体重" },
  activity_factor:      { min: 1.2, max: 2.5,  label: "活動係数" },
  height_cm:            { min: 100, max: 250,  label: "身長" },
  age:                  { min: 1,   max: 120,  label: "年齢" },
  target_calories_kcal: { min: 500, max: 6000, label: "目標カロリー" },
  target_protein_g:     { min: 0,   max: 500,  label: "目標タンパク質" },
  target_fat_g:         { min: 0,   max: 300,  label: "目標脂質" },
  target_carbs_g:       { min: 0,   max: 800,  label: "目標炭水化物" },
};

const VALID_PHASES = ["Cut", "Bulk"] as const;
const VALID_SEXES = ["male", "female"] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function isNumericKey(key: string): key is NumericSettingKey {
  return (NUMERIC_SETTING_KEYS as readonly string[]).includes(key);
}

/**
 * YYYY-MM-DD 形式かつ実在する日付かを検証する。
 * `new Date("YYYY-MM-DD")` は UTC 解釈のためカレンダー検証にのみ使用し、
 * タイムゾーン依存の処理には使わない。
 */
function isValidDate(s: string): boolean {
  if (!DATE_PATTERN.test(s)) return false;
  const [year, month, day] = s.split("-").map(Number);
  // 月: 1-12, 日: 1-31 の基本チェック
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // 実在日チェック: Date を使い年月日が変化しないか確認（UTC で比較）
  const d = new Date(`${s}T00:00:00Z`);
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() + 1 === month &&
    d.getUTCDate() === day
  );
}

// ─── メインのパース・バリデーション関数 ─────────────────────────────────────

/**
 * SettingsInput を検証・変換して DB upsert 用の SettingRecord[] を返す。
 *
 * 【全項目保存関数】
 * この関数は常に全設定キー (NUMERIC_SETTING_KEYS + STRING_SETTING_KEYS) の
 * レコードを生成する。省略・null・空文字のフィールドは value_num/value_str = null
 * として records に積まれ、DB で上書きされる。
 *
 * partial update（一部キーのみ更新）には対応していない。
 * 一部キーだけ渡すと、残りキーが null で消えるため、必ず全フィールドを渡すこと。
 * 現状の唯一の caller (saveSettings) は SettingsForm から全フィールドを受け取って渡す。
 *
 * - バリデーションエラーがひとつでもあれば ok: false を返す（保存は行わない）。
 */
export function parseSettings(input: SettingsInput): ParseSettingsResult {
  const errors: SettingsValidationError[] = [];
  const records: SettingRecord[] = [];

  // ── 数値系フィールドの処理 ────────────────────────────────────────────────
  for (const key of NUMERIC_SETTING_KEYS) {
    const raw = (input[key] ?? "").trim();
    if (raw === "") {
      // 空欄 = 未設定 → null で保存
      records.push({ key, value_num: null, value_str: null });
      continue;
    }
    const parsed = parseStrictNumber(raw);
    if (parsed === null) {
      errors.push({ field: key, message: `${NUMERIC_RULES[key].label} は数値で入力してください` });
      continue;
    }
    const { min, max, label } = NUMERIC_RULES[key];
    if (parsed < min || parsed > max) {
      errors.push({ field: key, message: `${label} は ${min}〜${max} の範囲で入力してください` });
      continue;
    }
    records.push({ key, value_num: parsed, value_str: null });
  }

  // ── current_season ────────────────────────────────────────────────────────
  {
    const raw = (input.current_season ?? "").trim();
    records.push({ key: "current_season", value_num: null, value_str: raw !== "" ? raw : null });
  }

  // ── current_phase ─────────────────────────────────────────────────────────
  {
    const raw = (input.current_phase ?? "").trim();
    if (raw !== "" && !(VALID_PHASES as readonly string[]).includes(raw)) {
      errors.push({ field: "current_phase", message: `フェーズは "Cut" または "Bulk" を選択してください` });
    } else {
      records.push({ key: "current_phase", value_num: null, value_str: raw !== "" ? raw : null });
    }
  }

  // ── sex ───────────────────────────────────────────────────────────────────
  {
    const raw = (input.sex ?? "").trim();
    if (raw !== "" && !(VALID_SEXES as readonly string[]).includes(raw)) {
      errors.push({ field: "sex", message: `性別は "male" または "female" を選択してください` });
    } else {
      records.push({ key: "sex", value_num: null, value_str: raw !== "" ? raw : null });
    }
  }

  // ── contest_date ──────────────────────────────────────────────────────────
  {
    const raw = (input.contest_date ?? "").trim();
    if (raw !== "" && !isValidDate(raw)) {
      errors.push({ field: "contest_date", message: "コンテスト日は YYYY-MM-DD 形式の有効な日付で入力してください" });
    } else {
      records.push({ key: "contest_date", value_num: null, value_str: raw !== "" ? raw : null });
    }
  }

  // ── monthly_plan_overrides ────────────────────────────────────────────────
  // JSON 文字列として保持する。内容バリデーションは MonthlyGoalPlanSection 側で完結している。
  {
    const raw = (input.monthly_plan_overrides ?? "").trim();
    records.push({ key: "monthly_plan_overrides", value_num: null, value_str: raw !== "" ? raw : null });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, records };
}

// ─── 型ガード ────────────────────────────────────────────────────────────────

export function isSettingKey(key: string): key is SettingKey {
  return (
    (NUMERIC_SETTING_KEYS as readonly string[]).includes(key) ||
    (STRING_SETTING_KEYS as readonly string[]).includes(key)
  );
}

export function isNumericSettingKey(key: string): key is NumericSettingKey {
  return isNumericKey(key);
}
