/**
 * AppSettings — settings テーブルの DB row[] をアプリが使いやすい
 * 正規化済み型に変換したドメインオブジェクト。
 *
 * DB の都合（key/value_num/value_str）をここで吸収し、
 * UI / page は AppSettings のフィールドを直接参照する。
 *
 * canonical source: src/lib/schemas/settingsSchema.ts (NUMERIC_SETTING_KEYS / STRING_SETTING_KEYS)
 */

import type { MonthlyGoalOverride } from "@/lib/utils/monthlyGoalPlan";

// ─── AppSettings 型 ──────────────────────────────────────────────────────────

export interface AppSettings {
  // 文字列系 (value_str)
  /** "YYYY-MM-DD" 形式のコンテスト日 */
  contestDate: string | null;
  /** 現在のシーズン名 (例: "2025_Summer") */
  currentSeason: string | null;
  /** 現在のフェーズ: "Cut" | "Bulk" */
  currentPhase: string | null;
  /** 性別: "male" | "female" */
  gender: string | null;

  // 数値系 (value_num)
  /** 目標体重 (kg) */
  targetWeight: number | null;
  /** 目標カロリー (kcal/day) — settingsSchema: target_calories_kcal */
  goalCalories: number | null;
  /** 目標タンパク質 (g/day) */
  proteinTarget: number | null;
  /** 目標脂質 (g/day) */
  fatTarget: number | null;
  /** 目標炭水化物 (g/day) */
  carbsTarget: number | null;
  /** 年齢 */
  age: number | null;
  /** 身長 (cm) */
  height: number | null;
  /** 活動係数 */
  activityFactor: number | null;
  /** 月次目標体重の手動 override リスト。DB: monthly_plan_overrides (value_str に JSON 格納) */
  monthlyPlanOverrides: MonthlyGoalOverride[] | null;
}

// ─── mapper ──────────────────────────────────────────────────────────────────

type SettingsRow = {
  key: string;
  value_num: number | null;
  value_str: string | null;
};

/**
 * mapToAppSettings — DB row[] を AppSettings に変換する。
 *
 * - 欠損キー: null を返す（undefined にしない）
 * - 型変換: value_num / value_str の判定をここで行う
 * - 不正値: NaN などの不正な数値は null を返す（例外を投げない）
 * - default 値: アプリ固有の default は呼び出し側で解決する
 *   （mapper は「DB に何が入っているか」を正直に返す）
 */
export function mapToAppSettings(rows: SettingsRow[]): AppSettings {
  const numMap = new Map<string, number | null>();
  const strMap = new Map<string, string | null>();

  for (const row of rows) {
    // value_num: NaN・Infinity などの不正値は null に落とす
    if (row.value_num !== null) {
      numMap.set(row.key, Number.isFinite(row.value_num) ? row.value_num : null);
    } else {
      numMap.set(row.key, null);
    }
    strMap.set(row.key, row.value_str);
  }

  const getNum = (key: string): number | null => numMap.get(key) ?? null;
  const getStr = (key: string): string | null => strMap.get(key) ?? null;

  return {
    // 文字列系 — value_str を参照
    contestDate:    getStr("contest_date"),
    currentSeason:  getStr("current_season"),
    currentPhase:   getStr("current_phase"),
    gender:         getStr("sex"),

    // 数値系 — value_num を参照
    targetWeight:   getNum("goal_weight"),
    goalCalories:   getNum("target_calories_kcal"),
    proteinTarget:  getNum("target_protein_g"),
    fatTarget:      getNum("target_fat_g"),
    carbsTarget:    getNum("target_carbs_g"),
    age:            getNum("age"),
    height:         getNum("height_cm"),
    activityFactor: getNum("activity_factor"),

    // JSON 配列文字列 — value_str を JSON.parse して返す
    monthlyPlanOverrides: (() => {
      const raw = getStr("monthly_plan_overrides");
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed as MonthlyGoalOverride[];
      } catch {
        return null;
      }
    })(),
  };
}
