jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn(), requireCurrentUser: jest.fn() }));
jest.mock("@/lib/cache/revalidate", () => ({ revalidateAfterFoodMutation: jest.fn() }));

import { createClient, requireCurrentUser } from "@/lib/supabase/server";
import { revalidateAfterFoodMutation } from "@/lib/cache/revalidate";
import { saveRecipe, setRecipeArchived } from "../recipes";
import { RECIPE_FOOD, RECIPE_INGREDIENT, RECIPE_OWNER, TEST_RECIPE } from "@/test/recipeFixtures";

const create = createClient as jest.Mock;
const requireUser = requireCurrentUser as jest.Mock;
const draft = { name: "  いつもの照り焼き  ", note: " メモ ", ingredients: [RECIPE_INGREDIENT] };
function db(...results: Array<{ data?: unknown; error?: unknown }>) {
  const builders = results.map((result) => {
    const builder: Record<string, jest.Mock> = {};
    for (const method of ["select", "eq", "in", "insert", "update", "single", "maybeSingle"]) builder[method] = jest.fn(() => builder);
    builder.then = jest.fn((resolve) => Promise.resolve({ data: null, error: null, ...result }).then(resolve));
    return builder;
  });
  const from = jest.fn();
  builders.forEach((builder) => from.mockReturnValueOnce(builder));
  create.mockResolvedValue({ from });
  return { from, builders };
}

beforeEach(() => { jest.clearAllMocks(); requireUser.mockResolvedValue({ id: RECIPE_OWNER }); });

it("未認証の登録・非表示を拒否する", async () => {
  requireUser.mockRejectedValue(new Error("auth_required"));
  expect(await saveRecipe(draft)).toEqual({ ok: false, error: "ログインし直してください" });
  expect(await setRecipeArchived(TEST_RECIPE.id, true, TEST_RECIPE.updated_at)).toEqual({ ok: false, error: "ログインし直してください" });
  expect(create).not.toHaveBeenCalled();
});

it("新規材料を所有者の食品で照合し、名前をtrimして料理定義だけ保存する", async () => {
  const { from, builders } = db({ data: [RECIPE_FOOD] }, { data: TEST_RECIPE });
  expect(await saveRecipe(draft)).toEqual({ ok: true, data: TEST_RECIPE });
  expect(from.mock.calls).toEqual([["food_master"], ["recipe_master"]]);
  expect(builders[0]!.eq).toHaveBeenCalledWith("user_id", RECIPE_OWNER);
  expect(builders[1]!.insert).toHaveBeenCalledWith({ name: TEST_RECIPE.name, note: "メモ", ingredients: [RECIPE_INGREDIENT], user_id: RECIPE_OWNER });
  expect(revalidateAfterFoodMutation).toHaveBeenCalledTimes(1);
});

it.each(["edit", "copy"])("食品が削除されても保存済みの栄養値を保って%sできる", async (mode) => {
  const input = { ...draft, [mode === "edit" ? "id" : "sourceId"]: TEST_RECIPE.id, updatedAt: TEST_RECIPE.updated_at, ingredients: [{ ...RECIPE_INGREDIENT, grams: 200 }] };
  const { from, builders } = db({ data: TEST_RECIPE }, { data: TEST_RECIPE });
  expect((await saveRecipe(input)).ok).toBe(true);
  expect(from.mock.calls).toEqual([["recipe_master"], ["recipe_master"]]);
  expect(builders[0]!.eq).toHaveBeenCalledWith("user_id", RECIPE_OWNER);
  const method = mode === "edit" ? "update" : "insert";
  expect(builders[1]![method]).toHaveBeenCalledWith(expect.objectContaining({ ingredients: input.ingredients }));
  if (mode === "edit") expect(builders[1]!.eq).toHaveBeenCalledWith("updated_at", TEST_RECIPE.updated_at);
});

it("材料を選び直した場合は現在の食品で照合する", async () => {
  const ingredient = { ...RECIPE_INGREDIENT, calories: 120 };
  const { from } = db({ data: TEST_RECIPE }, { data: [{ ...RECIPE_FOOD, calories: 120 }] }, { data: TEST_RECIPE });
  expect((await saveRecipe({ ...draft, id: TEST_RECIPE.id, updatedAt: TEST_RECIPE.updated_at, ingredients: [ingredient] })).ok).toBe(true);
  expect(from.mock.calls).toEqual([["recipe_master"], ["food_master"], ["recipe_master"]]);
});

it.each([{ foods: [] }, { foods: [{ ...RECIPE_FOOD, calories: 999 }] }])("存在しない食品や選択後に変更された栄養値を拒否する", async ({ foods }) => {
  const { from } = db({ data: foods });
  expect((await saveRecipe(draft)).ok).toBe(false);
  expect(from).toHaveBeenCalledTimes(1);
  expect(revalidateAfterFoodMutation).not.toHaveBeenCalled();
});

it.each([
  { ...draft, name: " " }, { ...draft, ingredients: [] },
  { ...draft, ingredients: [{ ...RECIPE_INGREDIENT, grams: -1 }] },
  { ...draft, ingredients: [RECIPE_INGREDIENT, RECIPE_INGREDIENT] },
  { ...draft, ingredients: [{ ...RECIPE_INGREDIENT, grams: 1e308 }] },
  { ...draft, id: "bad-id" },
])("不正入力はDB書き込み前に拒否する", async (input) => {
  expect((await saveRecipe(input)).ok).toBe(false);
  expect(create).not.toHaveBeenCalled();
});

it("他人の料理を編集・複製できない", async () => {
  const { builders } = db({ data: null });
  expect(await saveRecipe({ ...draft, sourceId: TEST_RECIPE.id, updatedAt: TEST_RECIPE.updated_at })).toEqual({ ok: false, error: "料理が見つかりません" });
  expect(builders[0]!.eq).toHaveBeenCalledWith("user_id", RECIPE_OWNER);
});

it("古い料理で上書きしない", async () => {
  db({ data: { ...TEST_RECIPE, updated_at: "newer" } });
  expect(await saveRecipe({ ...draft, id: TEST_RECIPE.id, updatedAt: TEST_RECIPE.updated_at })).toEqual({ ok: false, error: expect.stringContaining("別の画面") });
});

it("同名料理は非表示も含めて重複エラーにする", async () => {
  db({ data: [RECIPE_FOOD] }, { error: { code: "23505" } });
  expect(await saveRecipe(draft)).toEqual({ ok: false, error: expect.stringContaining("非表示の料理も含みます") });
});

it("更新直前の競合でも成功扱いしない", async () => {
  db({ data: TEST_RECIPE }, { data: null });
  expect((await saveRecipe({ ...draft, id: TEST_RECIPE.id, updatedAt: TEST_RECIPE.updated_at })).ok).toBe(false);
  expect(revalidateAfterFoodMutation).not.toHaveBeenCalled();
});

it.each([true, false])("非表示・復帰は料理の所有者と版を条件に更新する (%s)", async (archived) => {
  const { builders } = db({ data: { ...TEST_RECIPE, is_archived: archived } });
  expect((await setRecipeArchived(TEST_RECIPE.id, archived, TEST_RECIPE.updated_at)).ok).toBe(true);
  expect(builders[0]!.update).toHaveBeenCalledWith({ is_archived: archived });
  expect(builders[0]!.eq).toHaveBeenCalledWith("user_id", RECIPE_OWNER);
  expect(builders[0]!.eq).toHaveBeenCalledWith("updated_at", TEST_RECIPE.updated_at);
});

it("通信例外をエラーとして返しキャッシュを更新しない", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  create.mockRejectedValueOnce(new Error("offline"));
  expect((await saveRecipe(draft)).ok).toBe(false);
  expect(revalidateAfterFoodMutation).not.toHaveBeenCalled();
  log.mockRestore();
});
