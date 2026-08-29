import {
  fetchActiveSeason,
  fetchSeasonResolutionForDate,
  fetchSeasons,
} from "./seasons";

const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mockFrom }),
}));

const baseRow = {
  id: 1,
  user_id: "11111111-1111-1111-1111-111111111111",
  name: "2026_Cut",
  phase: "Cut",
  start_date: "2026-04-01",
  start_weight: 75,
  target_date: "2026-08-30",
  target_weight: 68,
  status: "active",
  end_date: null,
  end_weight: null,
  monthly_plan_start_month: "2026-04",
  monthly_plan_start_weight: 75,
  monthly_plan_overrides: [],
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
};

function setup(result: { data: unknown; error: unknown }) {
  mockOrder.mockResolvedValue(result);
  mockSelect.mockReturnValue({ order: mockOrder });
  mockFrom.mockReturnValue({ select: mockSelect });
}

describe("season queries", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetchSeasons は開始日昇順の domain data を返す", async () => {
    setup({ data: [baseRow], error: null });
    const result = await fetchSeasons();

    expect(mockFrom).toHaveBeenCalledWith("seasons");
    expect(mockOrder).toHaveBeenCalledWith("start_date", { ascending: true });
    expect(result).toMatchObject({
      kind: "ok",
      data: [{ id: 1, phase: "Cut", startDate: "2026-04-01" }],
    });
  });

  it("fetchSeasons は DB error を QueryResult error にする", async () => {
    setup({ data: null, error: { message: "DB error", code: "PGRST000" } });
    await expect(fetchSeasons()).resolves.toEqual({
      kind: "error",
      message: "DB error",
    });
  });

  it("fetchActiveSeason は active 1件を返す", async () => {
    setup({ data: [baseRow], error: null });
    const result = await fetchActiveSeason();
    expect(result).toMatchObject({ kind: "ok", data: { id: 1 } });
  });

  it("fetchActiveSeason は active 複数件をデータ異常として扱う", async () => {
    setup({
      data: [baseRow, { ...baseRow, id: 2, name: "duplicate" }],
      error: null,
    });
    await expect(fetchActiveSeason()).resolves.toEqual({
      kind: "error",
      message: "multiple_active_seasons",
    });
  });

  it("日付が期間外なら unassigned を返す", async () => {
    setup({ data: [baseRow], error: null });
    await expect(fetchSeasonResolutionForDate("2026-03-31")).resolves.toEqual({
      kind: "ok",
      data: { kind: "unassigned" },
    });
  });
});
