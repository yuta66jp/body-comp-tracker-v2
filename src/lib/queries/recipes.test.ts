jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
import { createClient } from "@/lib/supabase/server";
import { fetchRecipes } from "./recipes";
import { TEST_RECIPE } from "@/test/recipeFixtures";

it.each([{ data: [] }, { data: [TEST_RECIPE] }, { data: null }])("料理を取得し、空結果も成功として返す", async ({ data }) => {
  (createClient as jest.Mock).mockResolvedValue({ from: () => ({ select: () => ({ order: () => ({ data, error: null }) }) }) });
  expect(await fetchRecipes()).toEqual({ kind: "ok", data: data ?? [] });
});

it.each([
  { data: null, error: new Error("offline") },
  { data: [{ ...TEST_RECIPE, ingredients: [] }], error: null },
])("取得失敗や材料破損を未登録扱いしない", async (result) => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  (createClient as jest.Mock).mockResolvedValue({ from: () => ({ select: () => ({ order: () => result }) }) });
  expect((await fetchRecipes()).kind).toBe("error");
  log.mockRestore();
});
