/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MealLogger } from "./MealLogger";
import { saveDailyLog } from "@/app/actions/saveDailyLog";
import { RECIPE_FOOD, TEST_RECIPE } from "@/test/recipeFixtures";
import { toJstDateStr } from "@/lib/utils/date";

jest.mock("@/app/actions/saveDailyLog", () => ({ saveDailyLog: jest.fn() }));
jest.mock("@/lib/hooks/useFoodList", () => ({ useFoodList: () => ({ data: [RECIPE_FOOD], isLoading: false }) }));
jest.mock("@/lib/hooks/useMenuList", () => ({ useMenuList: () => ({ data: [], isLoading: false }) }));
const mockRecipeState = { data: [TEST_RECIPE], error: undefined as Error | undefined, isLoading: false, mutate: jest.fn() };
jest.mock("@/lib/hooks/useRecipeList", () => ({ useRecipeList: () => mockRecipeState }));
const mockLogs = [{ log_date: toJstDateStr(), weight: 70, calories: 2000, protein: 100, fat: 60, carbs: 260 }];
jest.mock("@/lib/hooks/useDailyLogs", () => ({
  useDailyLogs: () => ({ data: mockLogs, mutate: jest.fn() }),
  useDailyLogByDate: () => ({ data: null, isLoading: false }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRecipeState.error = undefined;
  mockRecipeState.data = [TEST_RECIPE];
  (saveDailyLog as jest.Mock).mockResolvedValue({ ok: true });
});
function openRecipes() {
  fireEvent.click(screen.getByRole("button", { name: "食品を追加" }));
  fireEvent.click(screen.getByRole("tab", { name: "料理" }));
}

it("料理1.5食と単品の合計だけで日次栄養を置換し、保存後閉じる", async () => {
  const onSaved = jest.fn();
  render(<MealLogger sidebar onSaveSuccess={onSaved} />);
  openRecipes();
  fireEvent.click(screen.getByRole("button", { name: `${TEST_RECIPE.name}を1食追加` }));
  fireEvent.change(screen.getByLabelText(`${TEST_RECIPE.name}の食数`), { target: { value: "1.5" } });
  fireEvent.click(screen.getByRole("tab", { name: "単品" }));
  fireEvent.click(screen.getByRole("button", { name: "鶏むね肉を追加" }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  const input = (saveDailyLog as jest.Mock).mock.calls[0][0];
  expect(input).toMatchObject({ calories: 367, protein: 75, fat: 6, carbs: 0 });
  expect(input).not.toHaveProperty("ingredients");
  expect(input).not.toHaveProperty("recipe");
  expect(input).not.toHaveProperty("servings");
  expect(screen.queryByLabelText(`${TEST_RECIPE.name}の食数`)).not.toBeInTheDocument();
});

it("不正食数は保存を防ぎ、開閉や並び替えでも入力を保持する", () => {
  render(<MealLogger sidebar />);
  openRecipes();
  fireEvent.click(screen.getByRole("button", { name: `${TEST_RECIPE.name}を1食追加` }));
  fireEvent.change(screen.getByLabelText(`${TEST_RECIPE.name}の食数`), { target: { value: "" } });
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "食品を追加" }));
  expect(screen.getByLabelText(`${TEST_RECIPE.name}の食数`)).toHaveValue(null);
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(`${TEST_RECIPE.name}の食数`), { target: { value: "0.5" } });
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
});

it("料理を追加後すべて外したら栄養をNULLにする", async () => {
  render(<MealLogger sidebar />);
  openRecipes();
  fireEvent.click(screen.getByRole("button", { name: `${TEST_RECIPE.name}を1食追加` }));
  fireEvent.click(screen.getByRole("button", { name: `${TEST_RECIPE.name}をカートから削除` }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(saveDailyLog).toHaveBeenCalledWith(expect.objectContaining({ calories: null, protein: null, fat: null, carbs: null })));
});

it("料理未操作の体重保存は既存の栄養を保持する", async () => {
  render(<MealLogger sidebar />);
  fireEvent.change(screen.getByLabelText("体重 (kg)"), { target: { value: "69.5" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(saveDailyLog).toHaveBeenCalledWith(expect.objectContaining({ calories: undefined, protein: undefined, fat: undefined, carbs: undefined })));
});

it("保存失敗なら料理の入力と食数を保持する", async () => {
  (saveDailyLog as jest.Mock).mockResolvedValue({ ok: false, message: "保存失敗" });
  const onSaved = jest.fn();
  render(<MealLogger sidebar onSaveSuccess={onSaved} />);
  openRecipes();
  fireEvent.click(screen.getByRole("button", { name: `${TEST_RECIPE.name}を1食追加` }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText("保存失敗");
  expect(screen.getByLabelText(`${TEST_RECIPE.name}の食数`)).toHaveValue(1);
  expect(onSaved).not.toHaveBeenCalled();
});

it("料理の取得失敗を未登録と区別し、非表示料理は追加できない", () => {
  mockRecipeState.error = new Error("offline");
  const view = render(<MealLogger sidebar />);
  openRecipes();
  expect(screen.getByRole("alert")).toHaveTextContent("料理を取得できませんでした");
  expect(screen.queryByRole("button", { name: `${TEST_RECIPE.name}を1食追加` })).not.toBeInTheDocument();
  mockRecipeState.error = undefined;
  mockRecipeState.data = [{ ...TEST_RECIPE, is_archived: true }];
  view.rerender(<MealLogger sidebar />);
  expect(screen.getByText(/料理が未登録です/)).toBeVisible();
});
