import type { FoodMaster, Tables } from "@/lib/supabase/types";

export const NUTRIENT_KEYS = ["calories", "protein", "fat", "carbs"] as const;
export type RecipeNutrition = Record<(typeof NUTRIENT_KEYS)[number], number>;

/** 食品の変更・削除から独立した、材料選択時点の100gあたりの栄養値。 */
export interface RecipeIngredient extends RecipeNutrition {
  name: string;
  grams: number;
}

export type Recipe = Omit<Tables<"recipe_master">, "ingredients"> & {
  ingredients: RecipeIngredient[];
};

export interface RecipeSaveInput {
  id?: string;
  sourceId?: string;
  updatedAt?: string;
  name: string;
  note: string;
  ingredients: RecipeIngredient[];
}

export function isRecipeIngredient(value: unknown): value is RecipeIngredient {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.name === "string" && item.name.trim().length > 0
    && typeof item.grams === "number" && Number.isFinite(item.grams) && item.grams > 0
    && NUTRIENT_KEYS.every((key) => typeof item[key] === "number" && Number.isFinite(item[key]) && item[key] >= 0);
}

export function parseRecipe(row: Tables<"recipe_master">): Recipe {
  const ingredients: unknown = row.ingredients;
  if (!Array.isArray(ingredients) || ingredients.length === 0 || !ingredients.every(isRecipeIngredient)
    || new Set(ingredients.map((item) => item.name)).size !== ingredients.length) {
    throw new Error("料理の材料情報が不正です。食品データベースで確認してください。");
  }
  const recipe = { ...row, ingredients };
  const nutrition = calcRecipeNutrition(recipe.ingredients);
  if (!NUTRIENT_KEYS.every((key) => Number.isFinite(nutrition[key]))) {
    throw new Error("料理の栄養値が計算できません。");
  }
  return recipe;
}

export function ingredientFromFood(food: FoodMaster, grams: number): RecipeIngredient | null {
  const item = { name: food.name, grams, calories: food.calories, protein: food.protein, fat: food.fat, carbs: food.carbs };
  return isRecipeIngredient(item) ? item : null;
}

export function sameIngredientNutrition(a: RecipeIngredient, b: RecipeIngredient): boolean {
  return a.name === b.name && NUTRIENT_KEYS.every((key) => a[key] === b[key]);
}

export function calcRecipeNutrition(ingredients: RecipeIngredient[], servings = 1, rounded = false): RecipeNutrition {
  const totals: RecipeNutrition = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  for (const ingredient of ingredients) {
    for (const key of NUTRIENT_KEYS) totals[key] += ingredient[key] * ingredient.grams / 100;
  }
  for (const key of NUTRIENT_KEYS) {
    totals[key] *= servings;
    if (rounded) totals[key] = Math.round(totals[key]);
  }
  return totals;
}

export function positiveRecipeAmount(raw: string): number | null {
  if (!raw.trim()) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** 材料変更前後の料理は別のカート行にし、追加済みの内容を保持する。 */
export function recipeCartKey(recipe: Recipe): string {
  const ingredients = [...recipe.ingredients].sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => [item.name, item.grams, ...NUTRIENT_KEYS.map((key) => item[key])]);
  return `recipe-${recipe.id}-${JSON.stringify([recipe.name, recipe.note, ingredients])}`;
}
