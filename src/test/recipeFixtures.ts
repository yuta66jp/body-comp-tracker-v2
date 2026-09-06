import type { Recipe, RecipeIngredient } from "@/lib/recipes";
import type { FoodMaster } from "@/lib/supabase/types";

export const RECIPE_OWNER = "78800000-0000-0000-0000-000000000001";
export const RECIPE_FOOD: FoodMaster = {
  id: "78800000-0000-0000-0000-000000000002", user_id: RECIPE_OWNER,
  name: "鶏むね肉", calories: 113, protein: 23.3, fat: 1.9, carbs: 0,
  category: "肉", created_at: null,
};
export const RECIPE_INGREDIENT: RecipeIngredient = {
  name: RECIPE_FOOD.name, grams: 150,
  calories: 113, protein: 23.3, fat: 1.9, carbs: 0,
};
export const TEST_RECIPE: Recipe = {
  id: "78800000-0000-0000-0000-000000000003", user_id: RECIPE_OWNER,
  name: "いつもの照り焼き", ingredients: [RECIPE_INGREDIENT], note: "弱火で焼く",
  is_archived: false, created_at: "2026-09-06T00:00:00+00:00", updated_at: "2026-09-06T00:00:00+00:00",
};
