/**
 * settings query layer テスト
 *
 * Supabase client をモックして、各クエリ関数の戻り値・エラー処理を検証する。
 */

import { fetchSettings, fetchSettingsRows, fetchMacroTargets } from "./settings";

// ── Mock ──────────────────────────────────────────────────────────────────────

const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// ── fetchSettings ─────────────────────────────────────────────────────────────
// fetchSettings: .from("settings").select("key, value_num, value_str")  → Promise<{data, error}>

describe("fetchSettings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: value_num があるキーは数値、value_str があるキーは文字列を返す", async () => {
    const rows = [
      { key: "goal_weight",   value_num: 72.5, value_str: null },
      { key: "contest_date",  value_num: null,  value_str: "2026-10-01" },
      { key: "current_phase", value_num: null,  value_str: "Cut" },
    ];
    const selectFn = jest.fn().mockResolvedValue({ data: rows, error: null });
    mockFrom.mockReturnValue({ select: selectFn });

    const result = await fetchSettings();
    expect(result["goal_weight"]).toBe(72.5);
    expect(result["contest_date"]).toBe("2026-10-01");
    expect(result["current_phase"]).toBe("Cut");
  });

  it("正常系: データが空のとき空オブジェクトを返す", async () => {
    const selectFn = jest.fn().mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue({ select: selectFn });
    const result = await fetchSettings();
    expect(result).toEqual({});
  });

  it("正常系: データが null のとき空オブジェクトを返す", async () => {
    const selectFn = jest.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({ select: selectFn });
    const result = await fetchSettings();
    expect(result).toEqual({});
  });

  it("value_num が 0 (falsy) のとき 0 を返す", async () => {
    const rows = [{ key: "some_num", value_num: 0, value_str: null }];
    const selectFn = jest.fn().mockResolvedValue({ data: rows, error: null });
    mockFrom.mockReturnValue({ select: selectFn });
    const result = await fetchSettings();
    expect(result["some_num"]).toBe(0);
  });

  it("value_num も value_str も null のとき null を返す", async () => {
    const rows = [{ key: "empty_key", value_num: null, value_str: null }];
    const selectFn = jest.fn().mockResolvedValue({ data: rows, error: null });
    mockFrom.mockReturnValue({ select: selectFn });
    const result = await fetchSettings();
    expect(result["empty_key"]).toBeNull();
  });

  it("DB エラーのとき空オブジェクトを返す（エラーを握りつぶす）", async () => {
    const selectFn = jest.fn().mockResolvedValue({ data: null, error: { message: "DB error" } });
    mockFrom.mockReturnValue({ select: selectFn });
    const result = await fetchSettings();
    expect(result).toEqual({});
  });
});

// ── fetchSettingsRows ─────────────────────────────────────────────────────────
// fetchSettingsRows: .from("settings").select("*") → Promise<{data, error}>

describe("fetchSettingsRows", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: Setting[] をそのまま返す", async () => {
    const rows = [
      { key: "goal_weight", value_num: 72.5, value_str: null },
      { key: "contest_date", value_num: null, value_str: "2026-10-01" },
    ];
    const selectFn = jest.fn().mockResolvedValue({ data: rows, error: null });
    mockFrom.mockReturnValue({ select: selectFn });
    const result = await fetchSettingsRows();
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe("goal_weight");
  });

  it("正常系: データが空のとき空配列を返す", async () => {
    const selectFn = jest.fn().mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue({ select: selectFn });
    const result = await fetchSettingsRows();
    expect(result).toEqual([]);
  });

  it("異常系: DB エラーのとき空配列を返す", async () => {
    const selectFn = jest.fn().mockResolvedValue({ data: null, error: { message: "DB error" } });
    mockFrom.mockReturnValue({ select: selectFn });
    const result = await fetchSettingsRows();
    expect(result).toEqual([]);
  });
});

// ── fetchMacroTargets ─────────────────────────────────────────────────────────
// fetchMacroTargets: .from("settings").select("key, value_num").in("key", keys)
//   → Promise<{data, error}>

describe("fetchMacroTargets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: 各マクロ目標キーを正しくマッピングする", async () => {
    const rows = [
      { key: "target_calories_kcal", value_num: 2000 },
      { key: "target_protein_g",     value_num: 160 },
      { key: "target_fat_g",         value_num: 60 },
      { key: "target_carbs_g",       value_num: 200 },
    ];
    const inFn = jest.fn().mockResolvedValue({ data: rows, error: null });
    const selectFn = jest.fn().mockReturnValue({ in: inFn });
    mockFrom.mockReturnValue({ select: selectFn });

    const result = await fetchMacroTargets();
    expect(result.calories).toBe(2000);
    expect(result.protein).toBe(160);
    expect(result.fat).toBe(60);
    expect(result.carbs).toBe(200);
    expect(result.calTarget).toBe(2000);
  });

  it("正常系: 全キーが未設定のとき全て null を返す", async () => {
    const inFn = jest.fn().mockResolvedValue({ data: [], error: null });
    const selectFn = jest.fn().mockReturnValue({ in: inFn });
    mockFrom.mockReturnValue({ select: selectFn });

    const result = await fetchMacroTargets();
    expect(result.calories).toBeNull();
    expect(result.protein).toBeNull();
    expect(result.fat).toBeNull();
    expect(result.carbs).toBeNull();
    expect(result.calTarget).toBeNull();
  });

  it("後方互換: target_calories_kcal がなく goal_calories があるとき calTarget に goal_calories を使う", async () => {
    const rows = [{ key: "goal_calories", value_num: 1800 }];
    const inFn = jest.fn().mockResolvedValue({ data: rows, error: null });
    const selectFn = jest.fn().mockReturnValue({ in: inFn });
    mockFrom.mockReturnValue({ select: selectFn });

    const result = await fetchMacroTargets();
    expect(result.calTarget).toBe(1800);
    expect(result.calories).toBeNull();
  });

  it("data が null のとき全て null を返す", async () => {
    const inFn = jest.fn().mockResolvedValue({ data: null, error: null });
    const selectFn = jest.fn().mockReturnValue({ in: inFn });
    mockFrom.mockReturnValue({ select: selectFn });

    const result = await fetchMacroTargets();
    expect(result.calories).toBeNull();
    expect(result.calTarget).toBeNull();
  });
});
