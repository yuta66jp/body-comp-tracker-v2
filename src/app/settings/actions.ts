"use server";

/**
 * Settings 保存処理の canonical source はここ。
 *
 * UI から直接 Supabase に書き込む処理はこのファイルに集約する。
 * バリデーションは src/lib/schemas/settingsSchema.ts の parseSettings に委譲する。
 */

import { createClient } from "@/lib/supabase/server";
import { revalidateAfterSettingsMutation } from "@/lib/cache/revalidate";
import { parseSettings } from "@/lib/schemas/settingsSchema";
import type { SettingsInput } from "@/lib/schemas/settingsSchema";
import { toJstDateStr, parseLocalDateStr } from "@/lib/utils/date";
import { normalizeMonthlyGoalOverrides } from "@/lib/utils/monthlyGoalPlan";

/** saveSettings の戻り値 */
export type SaveSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

export function normalizeMonthlyPlanOverridesBeforeSave(
  input: SettingsInput,
  today: string = toJstDateStr()
): SettingsInput {
  const rawOverrides = input.monthly_plan_overrides.trim();
  const contestDate = input.contest_date.trim();

  if (rawOverrides === "" || parseLocalDateStr(contestDate) === null) {
    return input;
  }

  try {
    const parsed = JSON.parse(rawOverrides);
    if (!Array.isArray(parsed)) return input;

    const normalized = normalizeMonthlyGoalOverrides({
      overrides: parsed,
      today,
      goalDeadlineDate: contestDate,
    });

    return {
      ...input,
      monthly_plan_overrides:
        normalized.length > 0 ? JSON.stringify(normalized) : "",
    };
  } catch {
    return input;
  }
}

/**
 * 設定値を検証して Supabase の settings テーブルに upsert する。
 *
 * @param input - SettingsInput (各フィールドは文字列 or null / 省略可)
 * @returns ok: true | ok: false + エラーメッセージ
 */
export async function saveSettings(
  input: SettingsInput
): Promise<SaveSettingsResult> {
  const normalizedInput = normalizeMonthlyPlanOverridesBeforeSave(input);

  // 1. バリデーション・変換（settingsSchema が canonical source）
  const parsed = parseSettings(normalizedInput);
  if (!parsed.ok) {
    const messages = parsed.errors.map((e) => `${e.field}: ${e.message}`).join(", ");
    return { ok: false, error: `入力値が不正です。${messages}` };
  }

  // 2. DB 保存
  const supabase = createClient();
  const { error } = await supabase
    .from("settings")
    .upsert(parsed.records as never);

  if (error) {
    console.error("settings upsert error:", error.message);
    return { ok: false, error: "保存に失敗しました。しばらく後に再試行してください。" };
  }

  // 3. On-demand revalidation（設定依存ページのキャッシュを破棄）
  revalidateAfterSettingsMutation();

  return { ok: true };
}
