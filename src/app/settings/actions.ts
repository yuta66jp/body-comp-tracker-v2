"use server";

/**
 * Settings 保存処理の canonical source はここ。
 *
 * UI から直接 Supabase に書き込む処理はこのファイルに集約する。
 * バリデーションは src/lib/schemas/settingsSchema.ts の parseSettings に委譲する。
 */

import { createClient, requireCurrentUser } from "@/lib/supabase/server";
import { authRequiredMessage } from "@/lib/auth/actionErrors";
import { revalidateAfterSettingsMutation } from "@/lib/cache/revalidate";
import { parseSettings } from "@/lib/schemas/settingsSchema";
import type { SettingsInput } from "@/lib/schemas/settingsSchema";

/** saveSettings の戻り値 */
export type SaveSettingsResult =
  | { ok: true }
  | { ok: false; error: string; reason?: "auth_required" };

// #742以降、これらはseason lifecycle RPCだけがsettings mirrorへ書き込む。
// 通常設定保存から除外し、古いタブや二重送信でcanonical seasonを巻き戻さない。
const SEASON_MANAGED_SETTING_KEYS = new Set([
  "current_season",
  "current_phase",
  "contest_date",
  "goal_weight",
  "monthly_plan_start_month",
  "monthly_plan_start_weight",
  "monthly_plan_overrides",
]);

/**
 * 設定値を検証して Supabase の settings テーブルに upsert する。
 *
 * @param input - SettingsInput (各フィールドは文字列 or null / 省略可)
 * @returns ok: true | ok: false + エラーメッセージ
 */
export async function saveSettings(
  input: SettingsInput
): Promise<SaveSettingsResult> {
  // 1. バリデーション・変換（settingsSchema が canonical source）
  const parsed = parseSettings(input);
  if (!parsed.ok) {
    const messages = parsed.errors.map((e) => `${e.field}: ${e.message}`).join(", ");
    return { ok: false, error: `入力値が不正です。${messages}` };
  }

  // 2. DB 保存
  let userId: string;
  try {
    const user = await requireCurrentUser();
    userId = user.id;
  } catch (error) {
    const message = authRequiredMessage(error);
    if (message) return { ok: false, error: message, reason: "auth_required" };
    throw error;
  }

  const supabase = await createClient();
  const records = parsed.records
    .filter((record) => !SEASON_MANAGED_SETTING_KEYS.has(record.key))
    .map((record) => ({ ...record, user_id: userId }));
  const { error } = await supabase
    .from("settings")
    .upsert(records as never);

  if (error) {
    console.error("settings upsert error:", error.message);
    return { ok: false, error: "保存に失敗しました。しばらく後に再試行してください。" };
  }

  // 3. On-demand revalidation（設定依存ページのキャッシュを破棄）
  revalidateAfterSettingsMutation();

  return { ok: true };
}
