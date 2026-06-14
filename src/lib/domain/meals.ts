import type { MealType } from "@/lib/supabase/types";

export const MEAL_TYPES = ["meal_1", "meal_2", "meal_3", "meal_4", "other"] as const satisfies readonly MealType[];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  meal_1: "食事1",
  meal_2: "食事2",
  meal_3: "食事3",
  meal_4: "食事4",
  other: "その他",
};

export function isMealType(value: string): value is MealType {
  return (MEAL_TYPES as readonly string[]).includes(value);
}
