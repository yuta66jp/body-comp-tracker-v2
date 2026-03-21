/**
 * foods query layer テスト
 *
 * Supabase client をモックして、fetchFoods / fetchMenus の
 * 成功・空・エラーケースを検証する。
 */

import { fetchFoods, fetchMenus } from "./foods";

// ── Mock ──────────────────────────────────────────────────────────────────────

const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mockFrom }),
}));

type ChainResult = { data: unknown; error: unknown };

function setupChain(result: ChainResult) {
  const terminal = Promise.resolve(result);
  mockOrder.mockReturnValue(terminal);
  mockSelect.mockReturnValue({ order: mockOrder });
  mockFrom.mockReturnValue({ select: mockSelect });
}

// ── fetchFoods ────────────────────────────────────────────────────────────────

describe("fetchFoods", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: kind=ok で FoodMaster[] を返す", async () => {
    const rows = [
      { name: "鶏むね肉", calories: 108, protein: 22.3, fat: 1.5, carbs: 0, category: "肉類" },
      { name: "卵", calories: 151, protein: 12.3, fat: 10.3, carbs: 0.3, category: "卵・乳製品" },
    ];
    setupChain({ data: rows, error: null });
    const result = await fetchFoods();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe("鶏むね肉");
    }
  });

  it("正常系: データが null のとき kind=ok で空配列を返す", async () => {
    setupChain({ data: null, error: null });
    const result = await fetchFoods();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual([]);
    }
  });

  it("正常系: 空配列のとき kind=ok で空配列を返す（食品未登録 = 正常な空状態）", async () => {
    setupChain({ data: [], error: null });
    const result = await fetchFoods();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual([]);
    }
  });

  it("異常系: DB エラーのとき kind=error を返す（空配列フォールバックしない）", async () => {
    setupChain({ data: null, error: { message: "connection error" } });
    const result = await fetchFoods();
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("connection error");
    }
  });
});

// ── fetchMenus ────────────────────────────────────────────────────────────────

describe("fetchMenus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: kind=ok で MenuEntry[] を返す", async () => {
    const rows = [
      { name: "鶏むね肉定食", recipe: [{ food_name: "鶏むね肉", grams: 200 }] },
    ];
    setupChain({ data: rows, error: null });
    const result = await fetchMenus();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe("鶏むね肉定食");
      expect(result.data[0].recipe).toHaveLength(1);
    }
  });

  it("正常系: recipe が非配列のとき空配列にフォールバックする", async () => {
    const rows = [{ name: "不正メニュー", recipe: null }];
    setupChain({ data: rows, error: null });
    const result = await fetchMenus();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data[0].recipe).toEqual([]);
    }
  });

  it("正常系: データが null のとき kind=ok で空配列を返す", async () => {
    setupChain({ data: null, error: null });
    const result = await fetchMenus();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual([]);
    }
  });

  it("異常系: DB エラーのとき kind=error を返す（空配列フォールバックしない）", async () => {
    setupChain({ data: null, error: { message: "DB error" } });
    const result = await fetchMenus();
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("DB error");
    }
  });
});
