/**
 * FoodTable UI 結合テスト
 *
 * テスト戦略:
 * - insertFood / deleteFood (server actions) を jest.mock() でモックし、ネットワーク依存を排除する
 * - lucide-react はアイコン名を持つ span に差し替えてレンダリングを単純化する
 *
 * 検証内容:
 * 1. 初期データ表示: initialFoods がテーブルに表示される
 * 2. 追加フォーム: 追加ボタンでフォームが開く / キャンセルで閉じる
 * 3. バリデーション: 食品名必須 / 数値必須 のエラー
 * 4. 保存成功: insertFood が呼ばれリストに追加される
 * 5. 保存失敗: エラーメッセージが表示される
 * 6. 削除: deleteFood が呼ばれリストから消える
 */

// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

jest.mock("@/app/actions/foods", () => ({
  insertFood: jest.fn(),
  deleteFood: jest.fn(),
}));

jest.mock("lucide-react", () => ({
  Trash2: () => <span data-testid="icon-trash" />,
  Plus: () => <span data-testid="icon-plus" />,
  Search: () => <span data-testid="icon-search" />,
  ChevronUp: () => <span data-testid="icon-chevron-up" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  ChevronsUpDown: () => <span data-testid="icon-chevrons" />,
}));

import { insertFood, deleteFood } from "@/app/actions/foods";
import { FoodTable } from "@/components/foods/FoodTable";
import type { FoodMaster } from "@/lib/supabase/types";

const mockInsertFood = insertFood as jest.MockedFunction<typeof insertFood>;
const mockDeleteFood = deleteFood as jest.MockedFunction<typeof deleteFood>;

const makeFoodMaster = (overrides: Partial<FoodMaster> & { name: string }): FoodMaster => ({
  id: "test-id",
  name: overrides.name,
  calories: overrides.calories ?? 100,
  protein: overrides.protein ?? 10,
  fat: overrides.fat ?? 5,
  carbs: overrides.carbs ?? 10,
  category: overrides.category ?? null,
  created_at: null,
});

const INITIAL_FOODS: FoodMaster[] = [
  makeFoodMaster({ name: "鶏むね肉", calories: 113, protein: 23, fat: 1, carbs: 0, category: "肉類" }),
  makeFoodMaster({ name: "白米", calories: 168, protein: 3, fat: 0, carbs: 37, category: "主食" }),
];

// ─── シナリオ 1: 初期データ表示 ────────────────────────────────────────────

describe("FoodTable — 初期データ表示", () => {
  it("initialFoods の食品名がリストに表示される", () => {
    render(<FoodTable initialFoods={INITIAL_FOODS} />);
    expect(screen.getAllByText("鶏むね肉").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("白米").length).toBeGreaterThanOrEqual(1);
  });

  it("食品がない場合は「食品が登録されていません」を表示", () => {
    render(<FoodTable initialFoods={[]} />);
    expect(screen.getAllByText("食品が登録されていません").length).toBeGreaterThanOrEqual(1);
  });
});

// ─── シナリオ 2: 追加フォーム ──────────────────────────────────────────────

describe("FoodTable — 追加フォーム", () => {
  it("追加ボタンをクリックするとフォームが表示される", () => {
    render(<FoodTable initialFoods={[]} />);
    fireEvent.click(screen.getByText("追加"));
    expect(screen.getByText("新規食品を追加 (100g あたり)")).toBeInTheDocument();
  });

  it("キャンセルボタンでフォームが閉じる", () => {
    render(<FoodTable initialFoods={[]} />);
    fireEvent.click(screen.getByText("追加"));
    fireEvent.click(screen.getByText("キャンセル"));
    expect(screen.queryByText("新規食品を追加 (100g あたり)")).not.toBeInTheDocument();
  });
});

// ─── シナリオ 3: バリデーション ──────────────────────────────────────────

describe("FoodTable — バリデーション", () => {
  beforeEach(() => {
    render(<FoodTable initialFoods={[]} />);
    fireEvent.click(screen.getByText("追加"));
  });

  it("食品名が空のとき「食品名は必須です」を表示", async () => {
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => {
      expect(screen.getByText("食品名は必須です")).toBeInTheDocument();
    });
  });

  it("kcal が空のとき「kcal は必須です」を表示", async () => {
    // textbox[0]=検索ボックス, textbox[1]=食品名入力
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[1], { target: { value: "テスト食品" } });
    // kcal は空のまま保存
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => {
      expect(screen.getByText("kcal は必須です")).toBeInTheDocument();
    });
  });
});

// ─── シナリオ 4: 保存成功 ──────────────────────────────────────────────────

describe("FoodTable — 保存成功", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockInsertFood.mockResolvedValue({ error: null });
    render(<FoodTable initialFoods={[]} />);
    fireEvent.click(screen.getByText("追加"));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("insertFood が呼ばれ「保存しました」が表示される", async () => {
    // textbox[0]=検索ボックス, textbox[1]=食品名入力
    const textInputs = screen.getAllByRole("textbox");
    const numberInputs = screen.getAllByRole("spinbutton");

    fireEvent.change(textInputs[1], { target: { value: "テスト食品" } });
    fireEvent.change(numberInputs[0], { target: { value: "200" } }); // calories
    fireEvent.change(numberInputs[1], { target: { value: "10" } });  // protein
    fireEvent.change(numberInputs[2], { target: { value: "5" } });   // fat
    fireEvent.change(numberInputs[3], { target: { value: "30" } });  // carbs

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mockInsertFood).toHaveBeenCalledWith(expect.objectContaining({ name: "テスト食品" }));
    });

    await waitFor(() => {
      expect(screen.getByText("✓ 保存しました")).toBeInTheDocument();
    });
  });
});

// ─── シナリオ 5: 保存失敗 ──────────────────────────────────────────────────

describe("FoodTable — 保存失敗", () => {
  beforeEach(() => {
    mockInsertFood.mockResolvedValue({ error: "duplicate key value" });
    render(<FoodTable initialFoods={[]} />);
    fireEvent.click(screen.getByText("追加"));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("insertFood がエラーを返すとエラーメッセージが表示される", async () => {
    // textbox[0]=検索ボックス, textbox[1]=食品名入力
    const textInputs = screen.getAllByRole("textbox");
    const numberInputs = screen.getAllByRole("spinbutton");

    fireEvent.change(textInputs[1], { target: { value: "重複食品" } });
    fireEvent.change(numberInputs[0], { target: { value: "100" } });
    fireEvent.change(numberInputs[1], { target: { value: "10" } });
    fireEvent.change(numberInputs[2], { target: { value: "5" } });
    fireEvent.change(numberInputs[3], { target: { value: "10" } });

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(screen.getByText("duplicate key value")).toBeInTheDocument();
    });
  });
});

// ─── シナリオ 6: 削除 ─────────────────────────────────────────────────────

describe("FoodTable — 削除", () => {
  beforeEach(() => {
    mockDeleteFood.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("削除ボタンで deleteFood が呼ばれ食品がリストから消える", async () => {
    render(<FoodTable initialFoods={[makeFoodMaster({ name: "削除対象" })]} />);

    // mobile/desktop 両方にボタンがあるので最初のものを使用
    const [deleteButton] = screen.getAllByLabelText("削除対象を削除");
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    await waitFor(() => {
      expect(mockDeleteFood).toHaveBeenCalledWith("削除対象");
    });
    expect(screen.queryByText("削除対象")).not.toBeInTheDocument();
  });
});

// ─── シナリオ 7: 検索フィルター ──────────────────────────────────────────

describe("FoodTable — 検索フィルター", () => {
  it("検索ボックスに入力すると一致しない食品が非表示になる", () => {
    render(<FoodTable initialFoods={INITIAL_FOODS} />);
    const searchInput = screen.getByPlaceholderText("食品名で検索...");
    fireEvent.change(searchInput, { target: { value: "鶏" } });
    expect(screen.getAllByText("鶏むね肉").length).toBeGreaterThanOrEqual(1);
    // 白米はモバイル/デスクトップ両方で非表示になるはず
    expect(screen.queryByText("白米")).not.toBeInTheDocument();
  });
});
