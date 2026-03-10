"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveDailyLogInput = {
  log_date: string;
  weight: number | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  note: string | null;
};

export type SaveDailyLogResult =
  | { ok: true }
  | { ok: false; message: string };

/** ISO 8601 日付文字列 (YYYY-MM-DD) かどうか */
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export async function saveDailyLog(
  input: SaveDailyLogInput
): Promise<SaveDailyLogResult> {
  // --- サーバー側バリデーション ---
  if (!isValidDate(input.log_date)) {
    return { ok: false, message: "日付の形式が正しくありません" };
  }

  if (input.weight !== null) {
    if (!isFinite(input.weight) || input.weight <= 0 || input.weight > 300) {
      return { ok: false, message: "体重は 0〜300 kg の範囲で入力してください" };
    }
  }

  for (const key of ["calories", "protein", "fat", "carbs"] as const) {
    const v = input[key];
    if (v !== null && (!isFinite(v) || v < 0 || v > 99999)) {
      return { ok: false, message: `${key} の値が不正です` };
    }
  }

  if (input.note !== null && input.note.length > 500) {
    return { ok: false, message: "メモは 500 文字以内で入力してください" };
  }

  // 保存する値が何もない場合は弾く
  const hasData =
    input.weight !== null ||
    input.calories !== null ||
    input.protein !== null ||
    input.fat !== null ||
    input.carbs !== null ||
    input.note !== null;

  if (!hasData) {
    return { ok: false, message: "保存するデータがありません" };
  }

  // --- Supabase upsert ---
  const supabase = createClient();
  const { error } = await supabase.from("daily_logs").upsert({
    log_date: input.log_date,
    weight: input.weight,
    calories: input.calories,
    protein: input.protein,
    fat: input.fat,
    carbs: input.carbs,
    note: input.note,
  });

  if (error) {
    console.error("[saveDailyLog] upsert error:", error.message);
    return { ok: false, message: "保存に失敗しました: " + error.message };
  }

  // --- On-demand revalidation ---
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/macro");
  revalidatePath("/tdee");

  return { ok: true };
}
