import { validateMealItemInput } from "./mealEntryPayload";

describe("validateMealItemInput", () => {
  it("有効な food_master 明細をDB insert形に正規化する", () => {
    expect(validateMealItemInput({
      source_type: "food_master",
      source_name: " chicken ",
      food_name: " chicken ",
      amount_g: 120,
      calories_kcal: 198,
      protein_g: 37,
      fat_g: 4,
      carbs_g: 0,
      calories_per_100g: 165,
      protein_per_100g: 31,
      fat_per_100g: 3.6,
      carbs_per_100g: 0,
    })).toEqual({
      user_id: "",
      meal_entry_id: "",
      source_type: "food_master",
      source_name: "chicken",
      food_name: "chicken",
      amount_g: 120,
      calories_kcal: 198,
      protein_g: 37,
      fat_g: 4,
      carbs_g: 0,
      calories_per_100g: 165,
      protein_per_100g: 31,
      fat_per_100g: 3.6,
      carbs_per_100g: 0,
    });
  });

  it("空の食品名はエラーにする", () => {
    expect(validateMealItemInput({
      source_type: "temp",
      food_name: " ",
      calories_kcal: 100,
    })).toEqual({ error: "食品名は1〜100文字で入力してください" });
  });

  it("負数の栄養値はエラーにする", () => {
    expect(validateMealItemInput({
      source_type: "temp",
      food_name: "test",
      calories_kcal: -1,
    })).toEqual({ error: "食事明細の数値は0以上で入力してください" });
  });
});
