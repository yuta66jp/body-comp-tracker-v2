import type { MealType } from "@/lib/supabase/types";

export const MEAL_TYPES = ["meal_1", "meal_2", "meal_3", "meal_4", "other"] as const satisfies readonly MealType[];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  meal_1: "MEAL 1",
  meal_2: "MEAL 2",
  meal_3: "MEAL 3",
  meal_4: "MEAL 4",
  other: "Other",
};

export function isMealType(value: string): value is MealType {
  return (MEAL_TYPES as readonly string[]).includes(value);
}
