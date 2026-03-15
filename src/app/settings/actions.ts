"use server";

/**
 * Settings 保存処理の canonical source はここ。
 *
 * UI から直接 Supabase に書き込む処理はこのファイルに集約する。
 * バリデーションは src/lib/schemas/settingsSchema.ts の parseSettings に委譲する。
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseSettings } from "@/lib/schemas/settingsSchema";
import type { SettingsInput } from "@/lib/schemas/settingsSchema";

/** saveSettings の戻り値 */
export type SaveSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

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
  const supabase = createClient();
  const { error } = await supabase
    .from("settings")
    .upsert(parsed.records as never);

  if (error) {
    console.error("settings upsert error:", error.message);
    return { ok: false, error: "保存に失敗しました。しばらく後に再試行してください。" };
  }

  // 3. On-demand revalidation（設定依存ページのキャッシュを破棄）
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/macro");
  revalidatePath("/tdee");
  revalidatePath("/settings");

  return { ok: true };
}
