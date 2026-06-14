"use server";

import { createClient, requireCurrentUser } from "@/lib/supabase/server";
import { authRequiredMessage } from "@/lib/auth/actionErrors";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import { isMealType } from "@/lib/domain/meals";
import { validateMealItemInput, type SaveMealItemInput } from "@/lib/domain/mealEntryPayload";
import { parseLocalDateStr } from "@/lib/utils/date";
import type { Database, MealType } from "@/lib/supabase/types";

type MealEntryInsert = Database["public"]["Tables"]["meal_entries"]["Insert"];
type MealItemInsert = Database["public"]["Tables"]["meal_items"]["Insert"];
type MealItemUpdate = Database["public"]["Tables"]["meal_items"]["Update"];

export type AddMealEntryInput = {
  log_date: string;
  meal_type: MealType;
  items: SaveMealItemInput[];
};

export type UpdateMealItemInput = {
  id: string;
  amount_g?: number | null;
  calories_kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
};

export type MealActionResult =
  | { ok: true }
  | { ok: false; message: string; reason?: "auth_required" };

function validateUpdateNumber(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
}

async function requireUserForMealAction(): Promise<
  | { ok: true; userId: string }
  | { ok: false; message: string; reason: "auth_required" }
> {
  try {
    const user = await requireCurrentUser();
    return { ok: true, userId: user.id };
  } catch (error) {
    const message = authRequiredMessage(error);
    if (message) return { ok: false, message, reason: "auth_required" };
    throw error;
  }
}

export async function addMealEntry(input: AddMealEntryInput): Promise<MealActionResult> {
  if (parseLocalDateStr(input.log_date) === null) {
    return { ok: false, message: "日付の形式が正しくありません" };
  }
  if (!isMealType(input.meal_type)) {
    return { ok: false, message: "食事区分が不正です" };
  }
  if (input.items.length === 0) {
    return { ok: false, message: "食事明細がありません" };
  }

  const itemRows: MealItemInsert[] = [];
  for (const item of input.items) {
    const validated = validateMealItemInput(item);
    if ("error" in validated) return { ok: false, message: validated.error };
    itemRows.push(validated);
  }

  const auth = await requireUserForMealAction();
  if (!auth.ok) return { ok: false, message: auth.message, reason: auth.reason };

  const supabase = await createClient();

  const { data: existingLogs, error: dailyLogError } = await supabase
    .from("daily_logs")
    .select("log_date")
    .eq("user_id", auth.userId)
    .eq("log_date", input.log_date)
    .limit(1);

  if (dailyLogError) {
    return { ok: false, message: "日次ログの確認に失敗しました: " + dailyLogError.message };
  }
  if ((existingLogs ?? []).length === 0) {
    return { ok: false, message: "新しい日付に食事を追加するには先に体重を保存してください" };
  }

  const entryPayload: MealEntryInsert = {
    user_id: auth.userId,
    log_date: input.log_date,
    meal_type: input.meal_type,
  };

  const { data: entry, error: entryError } = await supabase
    .from("meal_entries")
    .insert(entryPayload)
    .select("id")
    .single();

  if (entryError || !entry) {
    return { ok: false, message: "食事の作成に失敗しました: " + (entryError?.message ?? "unknown error") };
  }

  const rows = itemRows.map((row, index) => ({
    ...row,
    user_id: auth.userId,
    meal_entry_id: entry.id,
    item_order: index,
  }));

  const { error: itemError } = await supabase.from("meal_items").insert(rows);
  if (itemError) {
    await supabase
      .from("meal_entries")
      .delete()
      .eq("user_id", auth.userId)
      .eq("id", entry.id);
    return { ok: false, message: "食事明細の保存に失敗しました: " + itemError.message };
  }

  revalidateAfterDailyLogMutation();
  return { ok: true };
}

export async function updateMealItem(input: UpdateMealItemInput): Promise<MealActionResult> {
  if (input.id.trim() === "") {
    return { ok: false, message: "食事明細IDが不正です" };
  }

  const payload: MealItemUpdate = {};
  for (const key of ["amount_g", "calories_kcal", "protein_g", "fat_g", "carbs_g"] as const) {
    const value = validateUpdateNumber(input[key]);
    if (Number.isNaN(value)) {
      return { ok: false, message: "食事明細の数値は0以上で入力してください" };
    }
    if (value !== undefined) payload[key] = value;
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, message: "更新するデータがありません" };
  }

  const auth = await requireUserForMealAction();
  if (!auth.ok) return { ok: false, message: auth.message, reason: auth.reason };

  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_items")
    .update(payload)
    .eq("user_id", auth.userId)
    .eq("id", input.id);

  if (error) {
    return { ok: false, message: "食事明細の更新に失敗しました: " + error.message };
  }

  revalidateAfterDailyLogMutation();
  return { ok: true };
}

export async function deleteMealItem(id: string): Promise<MealActionResult> {
  if (id.trim() === "") {
    return { ok: false, message: "食事明細IDが不正です" };
  }

  const auth = await requireUserForMealAction();
  if (!auth.ok) return { ok: false, message: auth.message, reason: auth.reason };

  const supabase = await createClient();
  const { data: deletedRows, error } = await supabase
    .from("meal_items")
    .delete()
    .eq("user_id", auth.userId)
    .eq("id", id)
    .select("meal_entry_id");

  if (error) {
    return { ok: false, message: "食事明細の削除に失敗しました: " + error.message };
  }

  const mealEntryId = deletedRows?.[0]?.meal_entry_id;
  if (mealEntryId) {
    const { data: remainingItems, error: remainingError } = await supabase
      .from("meal_items")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("meal_entry_id", mealEntryId)
      .limit(1);

    if (remainingError) {
      return { ok: false, message: "食事明細の削除後確認に失敗しました: " + remainingError.message };
    }

    if ((remainingItems ?? []).length === 0) {
      const { error: entryDeleteError } = await supabase
        .from("meal_entries")
        .delete()
        .eq("user_id", auth.userId)
        .eq("id", mealEntryId);

      if (entryDeleteError) {
        return { ok: false, message: "空の食事記録の削除に失敗しました: " + entryDeleteError.message };
      }
    }
  }

  revalidateAfterDailyLogMutation();
  return { ok: true };
}
