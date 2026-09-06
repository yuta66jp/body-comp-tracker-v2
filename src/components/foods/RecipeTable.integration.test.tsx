/** @jest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SWRConfig } from "swr";
import { RecipeTable } from "./RecipeTable";
import { saveRecipe, setRecipeArchived } from "@/app/actions/recipes";
import { RECIPE_FOOD, RECIPE_INGREDIENT, TEST_RECIPE } from "@/test/recipeFixtures";
import type { Recipe } from "@/lib/recipes";

jest.mock("@/app/actions/recipes", () => ({ saveRecipe: jest.fn(), setRecipeArchived: jest.fn() }));
jest.mock("@/lib/clientData/fetchJson", () => ({ fetchClientData: jest.fn() }));
import { fetchClientData } from "@/lib/clientData/fetchJson";

function mount(recipes: Recipe[] = []) {
  (fetchClientData as jest.Mock).mockResolvedValue(recipes);
  return render(<SWRConfig value={{ provider: () => new Map(), revalidateOnMount: false }}>
    <main><section><h2>食品マスタ</h2></section><RecipeTable initialRecipes={recipes} foods={[RECIPE_FOOD]} /><section><h2>セットメニュー</h2></section></main>
  </SWRConfig>);
}
function addIngredient(grams = "150") {
  fireEvent.change(screen.getByLabelText("追加する材料"), { target: { value: RECIPE_FOOD.name } });
  fireEvent.change(screen.getByLabelText("使用量 (g)"), { target: { value: grams } });
  fireEvent.click(screen.getByRole("button", { name: "材料を追加" }));
}
beforeEach(() => jest.clearAllMocks());

it("新規→編集→複製→非表示→復帰を同じページで続けても一覧と件数が一致する", async () => {
  let saved = TEST_RECIPE;
  (saveRecipe as jest.Mock).mockImplementation(async (input) => {
    saved = { ...TEST_RECIPE, ...input, id: input.sourceId ? "copy" : TEST_RECIPE.id };
    return { ok: true, data: saved };
  });
  (setRecipeArchived as jest.Mock).mockImplementation(async (id, archived) => ({ ok: true, data: { ...saved, id, is_archived: archived } }));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "新規料理" }));
  fireEvent.change(screen.getByLabelText("料理名"), { target: { value: TEST_RECIPE.name } });
  addIngredient("100");
  addIngredient("50");
  expect(screen.getByLabelText("鶏むね肉の使用量")).toHaveValue(150);
  fireEvent.click(screen.getByRole("button", { name: "料理を保存" }));
  await screen.findByText("料理を保存しました");
  expect(saveRecipe).toHaveBeenCalledWith(expect.objectContaining({ ingredients: [RECIPE_INGREDIENT] }));
  fireEvent.click(screen.getByRole("button", { name: `${TEST_RECIPE.name}を編集` }));
  fireEvent.change(screen.getByLabelText("料理名"), { target: { value: "照り焼き改" } });
  fireEvent.change(screen.getByLabelText("鶏むね肉の使用量"), { target: { value: "200.5" } });
  fireEvent.click(screen.getByRole("button", { name: "料理を保存" }));
  await screen.findByRole("button", { name: "照り焼き改を複製" });
  expect(screen.queryByText(TEST_RECIPE.name)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "照り焼き改を複製" }));
  expect(screen.getByLabelText("鶏むね肉の使用量")).toHaveValue(200.5);
  fireEvent.change(screen.getByLabelText("料理名"), { target: { value: "照り焼き別版" } });
  fireEvent.click(screen.getByRole("button", { name: "料理を保存" }));
  await screen.findByRole("button", { name: "照り焼き別版を非表示" });
  expect(screen.getByText("登録 2件 · 非表示 0件")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "照り焼き別版を非表示" }));
  await screen.findByText("登録 1件 · 非表示 1件");
  expect(screen.queryByText("照り焼き別版")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("非表示の料理を表示"));
  fireEvent.click(screen.getByRole("button", { name: "照り焼き別版を再表示" }));
  await screen.findByText("登録 2件 · 非表示 0件");
  expect(screen.getAllByRole("heading", { name: "食品マスタ" })).toHaveLength(1);
  expect(screen.getAllByRole("heading", { name: "セットメニュー" })).toHaveLength(1);
  expect(within(screen.getByRole("region", { name: "料理" })).getAllByRole("button", { name: /を編集$/ })).toHaveLength(2);
});

it("項目の入力不備と保存失敗時に入力内容を保持する", async () => {
  (saveRecipe as jest.Mock).mockResolvedValue({ ok: false, error: "同じ名前です" });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "新規料理" }));
  fireEvent.click(screen.getByRole("button", { name: "料理を保存" }));
  expect(screen.getByText("料理名は必須です")).toBeVisible();
  expect(screen.getByText("材料を1品以上追加してください")).toBeVisible();
  fireEvent.change(screen.getByLabelText("料理名"), { target: { value: "照り焼き" } });
  addIngredient();
  fireEvent.change(screen.getByLabelText("鶏むね肉の使用量"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "料理を保存" }));
  expect(screen.getByLabelText("鶏むね肉の使用量")).toHaveAttribute("aria-invalid", "true");
  expect(saveRecipe).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("鶏むね肉の使用量"), { target: { value: "150" } });
  fireEvent.click(screen.getByRole("button", { name: "料理を保存" }));
  await screen.findByText("同じ名前です");
  expect(screen.getByLabelText("料理名")).toHaveValue("照り焼き");
  expect(screen.getByLabelText("鶏むね肉の使用量")).toHaveValue(150);
});

it("材料が削除された料理も詳細の栄養値と分量を表示する", () => {
  (fetchClientData as jest.Mock).mockResolvedValue([TEST_RECIPE]);
  render(<SWRConfig value={{ provider: () => new Map(), revalidateOnMount: false }}><RecipeTable initialRecipes={[TEST_RECIPE]} foods={[]} /></SWRConfig>);
  fireEvent.click(screen.getByText(TEST_RECIPE.name));
  expect(screen.getByText("鶏むね肉：150g")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: `${TEST_RECIPE.name}を編集` }));
  expect(screen.getByLabelText("鶏むね肉の使用量")).toHaveValue(150);
});

it("非表示の料理を除外し、名前検索する", () => {
  mount([TEST_RECIPE, { ...TEST_RECIPE, id: "archived", name: "非表示料理", is_archived: true }]);
  expect(screen.queryByText("非表示料理")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("料理名で検索"), { target: { value: "見つからない" } });
  expect(screen.getByText("該当する料理がありません")).toBeVisible();
});
