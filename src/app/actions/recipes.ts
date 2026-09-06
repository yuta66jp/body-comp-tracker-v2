"use server";

import { createClient, requireCurrentUser } from "@/lib/supabase/server";
import { AUTH_REQUIRED_MESSAGE, isAuthRequiredError } from "@/lib/auth/actionErrors";
import { revalidateAfterFoodMutation } from "@/lib/cache/revalidate";
import { calcRecipeNutrition, ingredientFromFood, isRecipeIngredient, NUTRIENT_KEYS, parseRecipe, sameIngredientNutrition } from "@/lib/recipes";
import type { Recipe, RecipeSaveInput } from "@/lib/recipes";
import type { Json } from "@/lib/supabase/types";

type RecipeActionResult = { ok: true; data: Recipe } | { ok: false; error: string };
const CONFLICT_MESSAGE = "料理が別の画面で更新されています。一覧を更新してから編集し直してください。";
const isId = (value: unknown): value is string => typeof value === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);

function actionError(error: unknown): RecipeActionResult {
  if (isAuthRequiredError(error)) return { ok: false, error: AUTH_REQUIRED_MESSAGE };
  console.error("[recipes] action failed:", error);
  return { ok: false, error: "料理を保存できませんでした。時間をおいて再試行してください。" };
}

export async function saveRecipe(input: RecipeSaveInput): Promise<RecipeActionResult> {
  try {
    const user = await requireCurrentUser();
    if (!input || typeof input.name !== "string" || !input.name.trim()) return { ok: false, error: "料理名は必須です" };
    if (typeof input.note !== "string" || !Array.isArray(input.ingredients) || input.ingredients.length === 0
      || !input.ingredients.every(isRecipeIngredient)
      || new Set(input.ingredients.map((item) => item.name)).size !== input.ingredients.length) {
      return { ok: false, error: "材料と使用量を確認してください" };
    }
    const totals = calcRecipeNutrition(input.ingredients);
    if (!NUTRIENT_KEYS.every((key) => Number.isFinite(totals[key]))) return { ok: false, error: "使用量が大きすぎます" };
    if ((input.id !== undefined && !isId(input.id)) || (input.sourceId !== undefined && !isId(input.sourceId))
      || (input.id && input.sourceId)) return { ok: false, error: "料理の指定が不正です" };

    const supabase = await createClient();
    let source: Recipe | undefined;
    const sourceId = input.id ?? input.sourceId;
    if (sourceId) {
      const { data, error } = await supabase.from("recipe_master").select("*").eq("user_id", user.id).eq("id", sourceId).maybeSingle();
      if (error) return actionError(error);
      if (!data) return { ok: false, error: "料理が見つかりません" };
      source = parseRecipe(data);
      if (input.updatedAt !== source.updated_at) return { ok: false, error: CONFLICT_MESSAGE };
    }

    // 保存済み材料はサーバーのスナップショット、新規・選び直し材料は所有する食品で照合する。
    const newIngredients = input.ingredients.filter((item) => !source?.ingredients.some((saved) => sameIngredientNutrition(saved, item)));
    if (newIngredients.length > 0) {
      const { data: foods, error } = await supabase.from("food_master").select("*").eq("user_id", user.id).in("name", newIngredients.map((item) => item.name));
      if (error) return actionError(error);
      for (const item of newIngredients) {
        const food = foods?.find((candidate) => candidate.name === item.name);
        const snapshot = food && ingredientFromFood(food, item.grams);
        if (!snapshot || !sameIngredientNutrition(snapshot, item)) {
          return { ok: false, error: `「${item.name}」の食品情報が変更または削除されています。材料を選び直してください。` };
        }
      }
    }

    const payload = {
      name: input.name.trim(),
      note: input.note.trim(),
      ingredients: input.ingredients.map(({ name, grams, calories, protein, fat, carbs }) => ({ name, grams, calories, protein, fat, carbs })) as unknown as Json,
    };
    const result = input.id
      ? await supabase.from("recipe_master").update(payload).eq("user_id", user.id).eq("id", input.id).eq("updated_at", source!.updated_at).select("*").maybeSingle()
      : await supabase.from("recipe_master").insert({ ...payload, user_id: user.id }).select("*").single();
    if (result.error?.code === "23505") return { ok: false, error: "同じ名前の料理が登録されています（非表示の料理も含みます）" };
    if (result.error) return actionError(result.error);
    if (!result.data) return { ok: false, error: CONFLICT_MESSAGE };
    revalidateAfterFoodMutation();
    return { ok: true, data: parseRecipe(result.data) };
  } catch (error) {
    return actionError(error);
  }
}

export async function setRecipeArchived(id: string, isArchived: boolean, updatedAt: string): Promise<RecipeActionResult> {
  try {
    const user = await requireCurrentUser();
    if (!isId(id) || typeof isArchived !== "boolean" || typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) {
      return { ok: false, error: "料理の指定が不正です" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase.from("recipe_master").update({ is_archived: isArchived })
      .eq("user_id", user.id).eq("id", id).eq("updated_at", updatedAt).select("*").maybeSingle();
    if (error) return actionError(error);
    if (!data) return { ok: false, error: CONFLICT_MESSAGE };
    revalidateAfterFoodMutation();
    return { ok: true, data: parseRecipe(data) };
  } catch (error) {
    return actionError(error);
  }
}
