"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * フィールドの意味:
 *   undefined  — 今回更新しない（ペイロードに含めない）
 *   null       — 明示的に値を空にする
 *   値あり      — その値に更新する
 */
export type SaveDailyLogInput = {
  log_date: string;
  weight?: number | null;
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  note?: string | null;
  is_cheat_day?: boolean;
  is_refeed_day?: boolean;
  is_eating_out?: boolean;
  is_poor_sleep?: boolean;
};

/** DB に渡す更新ペイロード（undefined フィールドを除去したもの）*/
export type DailyLogPayload = Omit<SaveDailyLogInput, "log_date">;

export type SaveDailyLogResult =
  | { ok: true }
  | { ok: false; message: string };

/** ISO 8601 日付文字列 (YYYY-MM-DD) かどうか */
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

/**
 * input から undefined フィールドを除去した DB 更新ペイロードを構築する。
 *
 * ルール:
 *   - undefined → ペイロードに含めない（既存値を保持）
 *   - null      → ペイロードに含める（明示的クリア）
 *   - 値あり    → ペイロードに含める（上書き）
 */
export function buildUpdatePayload(
  input: Omit<SaveDailyLogInput, "log_date">
): DailyLogPayload {
  const payload: DailyLogPayload = {};
  if (input.weight !== undefined)        payload.weight        = input.weight;
  if (input.calories !== undefined)      payload.calories      = input.calories;
  if (input.protein !== undefined)       payload.protein       = input.protein;
  if (input.fat !== undefined)           payload.fat           = input.fat;
  if (input.carbs !== undefined)         payload.carbs         = input.carbs;
  if (input.note !== undefined)          payload.note          = input.note;
  if (input.is_cheat_day !== undefined)  payload.is_cheat_day  = input.is_cheat_day;
  if (input.is_refeed_day !== undefined) payload.is_refeed_day = input.is_refeed_day;
  if (input.is_eating_out !== undefined) payload.is_eating_out = input.is_eating_out;
  if (input.is_poor_sleep !== undefined) payload.is_poor_sleep = input.is_poor_sleep;
  return payload;
}

export async function saveDailyLog(
  input: SaveDailyLogInput
): Promise<SaveDailyLogResult> {
  // --- サーバー側バリデーション ---
  if (!isValidDate(input.log_date)) {
    return { ok: false, message: "日付の形式が正しくありません" };
  }

  if (input.weight !== undefined && input.weight !== null) {
    if (!isFinite(input.weight) || input.weight <= 0 || input.weight > 300) {
      return { ok: false, message: "体重は 0〜300 kg の範囲で入力してください" };
    }
  }

  for (const key of ["calories", "protein", "fat", "carbs"] as const) {
    const v = input[key];
    if (v !== undefined && v !== null && (!isFinite(v) || v < 0 || v > 99999)) {
      return { ok: false, message: `${key} の値が不正です` };
    }
  }

  if (input.note !== undefined && input.note !== null && input.note.length > 500) {
    return { ok: false, message: "メモは 500 文字以内で入力してください" };
  }

  // undefined フィールドを除去したペイロードを構築
  const payload = buildUpdatePayload(input);

  // 保存する値が何もない場合は弾く
  if (Object.keys(payload).length === 0) {
    return { ok: false, message: "保存するデータがありません" };
  }

  // --- Supabase: 既存レコードを確認して insert / partial update ---
  const supabase = createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("daily_logs")
    .select("log_date")
    .eq("log_date", input.log_date)
    .maybeSingle();

  if (fetchError) {
    console.error("[saveDailyLog] fetch error:", fetchError.message);
    return { ok: false, message: "保存に失敗しました: " + fetchError.message };
  }

  let saveError: { message: string } | null;

  if (existing) {
    // 既存レコードあり: 送られたフィールドのみ上書き（partial update）
    const { error } = await supabase
      .from("daily_logs")
      .update(payload)
      .eq("log_date", input.log_date);
    saveError = error;
  } else {
    // 新規レコード: insert
    const { error } = await supabase
      .from("daily_logs")
      .insert({ log_date: input.log_date, ...payload });
    saveError = error;
  }

  if (saveError) {
    console.error("[saveDailyLog] save error:", saveError.message);
    return { ok: false, message: "保存に失敗しました: " + saveError.message };
  }

  // --- On-demand revalidation ---
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/macro");
  revalidatePath("/tdee");

  return { ok: true };
}
