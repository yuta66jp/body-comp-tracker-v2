import { calcRecipeNutrition, ingredientFromFood, isRecipeIngredient, parseRecipe, positiveRecipeAmount, recipeCartKey } from "./recipes";
import { RECIPE_FOOD, RECIPE_INGREDIENT, TEST_RECIPE } from "@/test/recipeFixtures";
import type { Tables } from "@/lib/supabase/types";

describe("料理の栄養計算とスナップショット", () => {
  it("材料の合計と食数の乗算が終わるまで丸めない", () => {
    const items = [
      { ...RECIPE_INGREDIENT, grams: 0.4, calories: 100, protein: 100, fat: 100, carbs: 100 },
      { ...RECIPE_INGREDIENT, name: "other", grams: 0.4, calories: 100, protein: 100, fat: 100, carbs: 100 },
    ];
    expect(calcRecipeNutrition(items, 1, true)).toEqual({ calories: 1, protein: 1, fat: 1, carbs: 1 });
    expect(calcRecipeNutrition(items, 0.5, true)).toEqual({ calories: 0, protein: 0, fat: 0, carbs: 0 });
    expect(calcRecipeNutrition(items, 1.5, true)).toEqual({ calories: 1, protein: 1, fat: 1, carbs: 1 });
  });

  it("食品の後日の変更が選択済み材料に伝播しない", () => {
    const food = { ...RECIPE_FOOD };
    const ingredient = ingredientFromFood(food, 150)!;
    food.calories = 999;
    expect(ingredient).toEqual(RECIPE_INGREDIENT);
    expect(calcRecipeNutrition([ingredient], 1.5, true)).toEqual({ calories: 254, protein: 52, fat: 4, carbs: 0 });
  });

  it.each(["", " ", "0", "-1", "NaN", "Infinity", "1e999", "2g"])("不正な量 %s を拒否する", (value) => {
    expect(positiveRecipeAmount(value)).toBeNull();
  });
  it.each(["0.5", "1", "1.5", "0.001"])("正の小数 %s を許可する", (value) => {
    expect(positiveRecipeAmount(value)).toBe(Number(value));
  });

  it.each([null, {}, { ...RECIPE_INGREDIENT, grams: 0 }, { ...RECIPE_INGREDIENT, calories: null }, { ...RECIPE_INGREDIENT, fat: -1 }, { ...RECIPE_INGREDIENT, protein: NaN }])("不正な材料をゼロ扱いで取り込まない", (item) => {
    expect(isRecipeIngredient(item)).toBe(false);
  });
  it("欠損栄養値を持つ食品を材料として選べない", () => {
    expect(ingredientFromFood({ ...RECIPE_FOOD, calories: null }, 100)).toBeNull();
  });
  it("DBの不正・重複材料は料理全体をエラーにする", () => {
    expect(parseRecipe(TEST_RECIPE as unknown as Tables<"recipe_master">)).toEqual(TEST_RECIPE);
    for (const ingredients of [[], null, [RECIPE_INGREDIENT, RECIPE_INGREDIENT], [{ ...RECIPE_INGREDIENT, grams: 1e308 }]]) {
      expect(() => parseRecipe({ ...TEST_RECIPE, ingredients } as unknown as Tables<"recipe_master">)).toThrow();
    }
  });
  it("料理の同一内容と編集前後を識別する", () => {
    expect(recipeCartKey(TEST_RECIPE)).toBe(recipeCartKey({ ...TEST_RECIPE, updated_at: "later" }));
    const { grams, ...nutrition } = RECIPE_INGREDIENT;
    expect(recipeCartKey(TEST_RECIPE)).toBe(recipeCartKey({ ...TEST_RECIPE, ingredients: [{ grams, ...nutrition }] }));
    expect(recipeCartKey(TEST_RECIPE)).not.toBe(recipeCartKey({ ...TEST_RECIPE, name: "改訂版" }));
    expect(recipeCartKey(TEST_RECIPE)).not.toBe(recipeCartKey({ ...TEST_RECIPE, ingredients: [{ ...RECIPE_INGREDIENT, grams: 200 }] }));
  });
});
