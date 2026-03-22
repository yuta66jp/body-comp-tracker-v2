/**
 * MenuTable UI 結合テスト
 *
 * テスト戦略:
 * - insertMenu / updateMenu / deleteMenu (server actions) を jest.mock() でモックする
 * - lucide-react はアイコン名を持つ span に差し替えてレンダリングを単純化する
 *
 * 検証内容:
 * 1. 初期データ表示: initialMenus がリストに表示される
 * 2. 新規セットフォーム: 新規セットボタンでフォームが開く
 * 3. バリデーション: セット名必須 / 食品 1 品以上必須 のエラー
 * 4. 保存成功（新規）: insertMenu が呼ばれリストに追加される
 * 5. 保存成功（更新）: updateMenu が呼ばれリストが更新される
 * 6. 削除: deleteMenu が呼ばれリストから消える
 */

// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

jest.mock("@/app/actions/foods", () => ({
  insertMenu: jest.fn(),
  updateMenu: jest.fn(),
  deleteMenu: jest.fn(),
}));

jest.mock("lucide-react", () => ({
  Plus: () => <span data-testid="icon-plus" />,
  Trash2: () => <span data-testid="icon-trash" />,
  Save: () => <span data-testid="icon-save" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  ChevronUp: () => <span data-testid="icon-chevron-up" />,
  X: () => <span data-testid="icon-x" />,
}));

import { insertMenu, updateMenu, deleteMenu } from "@/app/actions/foods";
import { MenuTable } from "@/components/foods/MenuTable";
import type { FoodMaster } from "@/lib/supabase/types";
import type { MenuEntry } from "@/lib/hooks/useMenuList";

const mockInsertMenu = insertMenu as jest.MockedFunction<typeof insertMenu>;
const mockUpdateMenu = updateMenu as jest.MockedFunction<typeof updateMenu>;
const mockDeleteMenu = deleteMenu as jest.MockedFunction<typeof deleteMenu>;

const makeFoodMaster = (name: string, calories: number = 100): FoodMaster => ({
  id: "test-id",
  name,
  calories,
  protein: 10,
  fat: 5,
  carbs: 10,
  category: null,
  created_at: null,
});

const FOODS: FoodMaster[] = [
  makeFoodMaster("鶏むね肉", 113),
  makeFoodMaster("白米", 168),
];

const INITIAL_MENUS: MenuEntry[] = [
  { name: "鶏飯セット", recipe: [{ name: "鶏むね肉", amount: 200 }, { name: "白米", amount: 150 }] },
];

// ─── シナリオ 1: 初期データ表示 ────────────────────────────────────────────

describe("MenuTable — 初期データ表示", () => {
  it("initialMenus のセット名がリストに表示される", () => {
    render(<MenuTable initialMenus={INITIAL_MENUS} foods={FOODS} />);
    expect(screen.getAllByText("鶏飯セット").length).toBeGreaterThanOrEqual(1);
  });

  it("メニューがない場合は「セットメニューが登録されていません」を表示", () => {
    render(<MenuTable initialMenus={[]} foods={FOODS} />);
    expect(screen.getByText("セットメニューが登録されていません")).toBeInTheDocument();
  });
});

// ─── シナリオ 2: 新規セットフォーム ──────────────────────────────────────

describe("MenuTable — 新規セットフォーム", () => {
  it("新規セットボタンでフォームが表示される", () => {
    render(<MenuTable initialMenus={[]} foods={FOODS} />);
    fireEvent.click(screen.getByText("新規セット"));
    expect(screen.getByPlaceholderText("セット名（例: 鶏飯セット）")).toBeInTheDocument();
  });
});

// ─── シナリオ 3: バリデーション ──────────────────────────────────────────

describe("MenuTable — バリデーション", () => {
  beforeEach(() => {
    render(<MenuTable initialMenus={[]} foods={FOODS} />);
    fireEvent.click(screen.getByText("新規セット"));
  });

  it("セット名が空のとき「セット名は必須です」を表示", async () => {
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => {
      expect(screen.getByText("セット名は必須です")).toBeInTheDocument();
    });
  });

  it("食品が 0 品のとき「1品以上追加してください」を表示", async () => {
    const nameInput = screen.getByPlaceholderText("セット名（例: 鶏飯セット）");
    fireEvent.change(nameInput, { target: { value: "空セット" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => {
      expect(screen.getByText("1品以上追加してください")).toBeInTheDocument();
    });
  });
});

// ─── シナリオ 4: 保存成功（新規） ─────────────────────────────────────────

describe("MenuTable — 保存成功（新規）", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockInsertMenu.mockResolvedValue({ error: null });
    render(<MenuTable initialMenus={[]} foods={FOODS} />);
    fireEvent.click(screen.getByText("新規セット"));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("insertMenu が呼ばれ「セットを保存しました」が表示される", async () => {
    // セット名を入力
    const nameInput = screen.getByPlaceholderText("セット名（例: 鶏飯セット）");
    fireEvent.change(nameInput, { target: { value: "新セット" } });

    // 食品を選択して追加
    // combobox は food select（食品を選択...）のみ
    const foodSelect = screen.getByRole("combobox");
    fireEvent.change(foodSelect, { target: { value: "鶏むね肉" } });
    // Plus アイコンを持つボタンは「新規セット」ボタンと食品追加ボタンの 2 つあるため、最後を使用
    const plusButtons = screen.getAllByRole("button").filter(
      (b) => b.querySelector("[data-testid='icon-plus']")
    );
    fireEvent.click(plusButtons[plusButtons.length - 1]);

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mockInsertMenu).toHaveBeenCalledWith(
        expect.objectContaining({ name: "新セット" })
      );
    });

    await waitFor(() => {
      expect(screen.getByText("✓ セットを保存しました")).toBeInTheDocument();
    });
  });
});

// ─── シナリオ 5: 保存成功（更新） ─────────────────────────────────────────

describe("MenuTable — 保存成功（更新）", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUpdateMenu.mockResolvedValue({ error: null });
    render(<MenuTable initialMenus={INITIAL_MENUS} foods={FOODS} />);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("編集ボタンでフォームが開き updateMenu が呼ばれる", async () => {
    // 編集ボタンは複数ある（モバイル/デスクトップ）ので最初の1つを使う
    const editButtons = screen.getAllByText("編集");
    fireEvent.click(editButtons[0]);

    // 名前を変更
    const nameInput = screen.getByPlaceholderText("セット名（例: 鶏飯セット）");
    fireEvent.change(nameInput, { target: { value: "鶏飯セット改" } });

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mockUpdateMenu).toHaveBeenCalledWith(
        "鶏飯セット",
        expect.objectContaining({ name: "鶏飯セット改" })
      );
    });
  });
});

// ─── シナリオ 6: 削除 ─────────────────────────────────────────────────────

describe("MenuTable — 削除", () => {
  beforeEach(() => {
    mockDeleteMenu.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("削除ボタンで deleteMenu が呼ばれセットがリストから消える", async () => {
    render(<MenuTable initialMenus={INITIAL_MENUS} foods={FOODS} />);

    const deleteButtons = screen.getAllByLabelText("鶏飯セットを削除");
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    await waitFor(() => {
      expect(mockDeleteMenu).toHaveBeenCalledWith("鶏飯セット");
    });
    expect(screen.queryByText("鶏飯セット")).not.toBeInTheDocument();
  });
});
