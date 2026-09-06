import { addRecipeToCart, calcCartTotals, isValidRecipeCartItem, normalizeGrams, sortCartItemsByCalories } from "./Cart";
import type { CartItem } from "./Cart";
import type { FoodMaster } from "@/lib/supabase/types";
import { TEST_RECIPE, RECIPE_FOOD, RECIPE_INGREDIENT } from "@/test/recipeFixtures";

function regularItem(name: string, calories: number, grams: number): CartItem {
  return {
    kind: "regular",
    food: { name, calories, protein: 0, fat: 0, carbs: 0 } as FoodMaster,
    grams,
  };
}

describe("normalizeGrams", () => {
  // ── 空文字 / 不正入力 → fallback に戻す ───────────────────────────────────

  it("空文字は fallback を返す", () => {
    expect(normalizeGrams("", 100)).toBe(100);
  });

  it("空白のみも fallback を返す", () => {
    expect(normalizeGrams("  ", 100)).toBe(100);
  });

  it("アルファベット文字列は fallback を返す", () => {
    expect(normalizeGrams("abc", 100)).toBe(100);
  });

  it("NaN になる文字列 (--5) は fallback を返す", () => {
    expect(normalizeGrams("--5", 100)).toBe(100);
  });

  it("Infinity 文字列は fallback を返す", () => {
    expect(normalizeGrams("Infinity", 100)).toBe(100);
  });

  // ── 有効な数値 ────────────────────────────────────────────────────────────

  it("正の整数はそのまま返す", () => {
    expect(normalizeGrams("250", 100)).toBe(250);
  });

  it("0 はそのまま返す（カートに残したまま 0g にできる）", () => {
    expect(normalizeGrams("0", 100)).toBe(0);
  });

  it("小数はそのまま返す（小数入力を許容）", () => {
    expect(normalizeGrams("150.5", 100)).toBe(150.5);
  });

  // ── 負数 → 0 にクランプ ──────────────────────────────────────────────────

  it("負数は 0 にクランプする", () => {
    expect(normalizeGrams("-5", 100)).toBe(0);
  });

  it("-0 は 0 を返す", () => {
    expect(normalizeGrams("-0", 100)).toBe(0);
  });

  // ── fallback が 0 のとき ──────────────────────────────────────────────────

  it("fallback が 0 で空文字を渡すと 0 を返す", () => {
    expect(normalizeGrams("", 0)).toBe(0);
  });

  it("fallback が 0 で不正文字列を渡すと 0 を返す", () => {
    expect(normalizeGrams("xyz", 0)).toBe(0);
  });

  // ── 全消し → 再入力のシナリオ ────────────────────────────────────────────

  it("100 から全消しして 250 と打った場合: normalizeGrams('250', 100) === 250", () => {
    // 全消し中は editingGrams に '' が保持される（テスト対象外: UI state）
    // blur 時点では新しい値 '250' が渡る
    expect(normalizeGrams("250", 100)).toBe(250);
  });

  it("全消し後に未入力のまま blur した場合は元の値に戻る", () => {
    expect(normalizeGrams("", 100)).toBe(100);
  });
});

describe("sortCartItemsByCalories", () => {
  it("数量・量を反映した合計カロリーの降順で並べる", () => {
    const items: CartItem[] = [
      regularItem("低カロリー食品", 100, 100),
      regularItem("高カロリー食品", 200, 250),
      { kind: "temp", food: { tempId: "temp-1", name: "一時食品", grams: 200, calories: 400, protein: 0, fat: 0, carbs: 0 } },
      regularItem("中カロリー食品", 150, 200),
    ];

    expect(sortCartItemsByCalories(items).map((item) => item.kind === "recipe" ? item.recipe.name : item.food.name)).toEqual([
      "高カロリー食品",
      "一時食品",
      "中カロリー食品",
      "低カロリー食品",
    ]);
    expect(items.map((item) => item.kind === "recipe" ? item.recipe.name : item.food.name)).toEqual([
      "低カロリー食品",
      "高カロリー食品",
      "一時食品",
      "中カロリー食品",
    ]);
  });

  it("量の変更後の合計カロリーに応じて並び順を更新する", () => {
    const before = [
      regularItem("食品A", 200, 100),
      regularItem("食品B", 150, 100),
    ];
    const after = [
      regularItem("食品A", 200, 50),
      regularItem("食品B", 150, 100),
    ];

    expect(sortCartItemsByCalories(before).map((item) => item.kind === "recipe" ? item.recipe.name : item.food.name)).toEqual(["食品A", "食品B"]);
    expect(sortCartItemsByCalories(after).map((item) => item.kind === "recipe" ? item.recipe.name : item.food.name)).toEqual(["食品B", "食品A"]);
  });

  it("合計カロリーが同じ商品は元のカート順を維持する", () => {
    const items = [
      regularItem("先に追加した食品", 200, 100),
      { kind: "temp" as const, food: { tempId: "temp-1", name: "次に追加した食品", grams: 100, calories: 200, protein: 0, fat: 0, carbs: 0 } },
      regularItem("低カロリー食品", 100, 100),
    ];

    expect(sortCartItemsByCalories(items).map((item) => item.kind === "recipe" ? item.recipe.name : item.food.name)).toEqual([
      "先に追加した食品",
      "次に追加した食品",
      "低カロリー食品",
    ]);
  });
});

describe("料理を含むカート", () => {
  it("料理1.5食と材料の単品・一時食品をそれぞれ合算する", () => {
    const items: CartItem[] = [
      { kind: "recipe", recipe: TEST_RECIPE, servings: 1.5 },
      { kind: "regular", food: RECIPE_FOOD, grams: 100 },
      { kind: "temp", food: { tempId: "temp", name: "一時", grams: 0, calories: 50, protein: 1, fat: 2, carbs: 3 } },
    ];
    expect(calcCartTotals(items)).toEqual({ calories: 417, protein: 76, fat: 8, carbs: 3 });
    expect(sortCartItemsByCalories(items)).toEqual(items);
  });
  it("同一内容だけ食数を加算し、編集前後の内容は別行に保持する", () => {
    const first = addRecipeToCart([], TEST_RECIPE);
    const second = addRecipeToCart(first, { ...TEST_RECIPE, updated_at: "later" });
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ servings: 2 });
    expect(first[0]).toMatchObject({ servings: 1 });
    const edited = { ...TEST_RECIPE, ingredients: [{ ...RECIPE_INGREDIENT, grams: 300 }] };
    const third = addRecipeToCart(second, edited);
    expect(third).toHaveLength(2);
    expect(third[0]).toEqual(second[0]);
  });
  it.each(["", "0", "-1", "1e308"])("不正な食数入力中は保存対象にできない (%s)", (raw) => {
    expect(isValidRecipeCartItem({ kind: "recipe", recipe: TEST_RECIPE, servings: 1, servingsInput: raw })).toBe(false);
  });
});
