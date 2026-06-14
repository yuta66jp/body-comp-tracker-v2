import type { Database, MealItemSourceType } from "@/lib/supabase/types";

type MealItemInsert = Database["public"]["Tables"]["meal_items"]["Insert"];

const MEAL_ITEM_SOURCE_TYPES = ["food_master", "menu_master", "temp", "manual", "legacy_total"] as const satisfies readonly MealItemSourceType[];

export type SaveMealItemInput = {
  source_type: MealItemSourceType;
  source_name?: string | null;
  food_name: string;
  amount_g?: number | null;
  calories_kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  calories_per_100g?: number | null;
  protein_per_100g?: number | null;
  fat_per_100g?: number | null;
  carbs_per_100g?: number | null;
};

function isMealItemSourceType(value: string): value is MealItemSourceType {
  return (MEAL_ITEM_SOURCE_TYPES as readonly string[]).includes(value);
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function normalizeFoodName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > 100) return null;
  return trimmed;
}

function normalizeNullableNonNegative(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
}

export function validateMealItemInput(item: SaveMealItemInput): MealItemInsert | { error: string } {
  if (!isMealItemSourceType(item.source_type)) {
    return { error: "食事明細の入力元が不正です" };
  }

  const foodName = normalizeFoodName(item.food_name);
  if (foodName === null) {
    return { error: "食品名は1〜100文字で入力してください" };
  }

  const normalized = {
    amount_g: normalizeNullableNonNegative(item.amount_g),
    calories_kcal: normalizeNullableNonNegative(item.calories_kcal),
    protein_g: normalizeNullableNonNegative(item.protein_g),
    fat_g: normalizeNullableNonNegative(item.fat_g),
    carbs_g: normalizeNullableNonNegative(item.carbs_g),
    calories_per_100g: normalizeNullableNonNegative(item.calories_per_100g),
    protein_per_100g: normalizeNullableNonNegative(item.protein_per_100g),
    fat_per_100g: normalizeNullableNonNegative(item.fat_per_100g),
    carbs_per_100g: normalizeNullableNonNegative(item.carbs_per_100g),
  };

  if (Object.values(normalized).some((value) => Number.isNaN(value))) {
    return { error: "食事明細の数値は0以上で入力してください" };
  }

  return {
    user_id: "",
    meal_entry_id: "",
    source_type: item.source_type,
    source_name: normalizeText(item.source_name),
    food_name: foodName,
    ...normalized,
  };
}
