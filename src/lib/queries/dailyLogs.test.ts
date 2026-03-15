/**
 * dailyLogs query layer テスト
 *
 * Supabase client をモックして、各クエリ関数の戻り値・エラー処理を検証する。
 */

import {
  fetchDailyLogs,
  fetchWeightLogs,
  fetchDailyLogsForSettings,
  fetchCareerLogs,
  fetchCareerLogsForDashboard,
  fetchPredictions,
} from "./dailyLogs";

// ── Mock ──────────────────────────────────────────────────────────────────────

const mockOrder = jest.fn();
const mockNot = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// ── ヘルパー ──────────────────────────────────────────────────────────────────

type ChainResult = { data: unknown; error: unknown };

/**
 * .from().select().order() または .from().select().not().order() チェーンの
 * 最終 await 値を設定する。
 */
function setupChain(result: ChainResult) {
  const terminal = Promise.resolve(result);
  mockOrder.mockReturnValue(terminal);
  mockNot.mockReturnValue({ order: mockOrder });
  mockSelect.mockReturnValue({
    order: mockOrder,
    not: mockNot,
  });
  mockFrom.mockReturnValue({ select: mockSelect });
}

// ── fetchDailyLogs ────────────────────────────────────────────────────────────

describe("fetchDailyLogs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: kind=ok で DailyLog[] を返す", async () => {
    const rows = [
      { log_date: "2026-03-01", weight: 72.5, calories: 2000 },
      { log_date: "2026-03-02", weight: 72.3, calories: 1900 },
    ];
    setupChain({ data: rows, error: null });
    const result = await fetchDailyLogs();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].log_date).toBe("2026-03-01");
    }
  });

  it("正常系: データが null のとき kind=ok で空配列を返す", async () => {
    setupChain({ data: null, error: null });
    const result = await fetchDailyLogs();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual([]);
    }
  });

  it("異常系: DB エラーのとき kind=error を返す", async () => {
    setupChain({ data: null, error: { message: "connection error", code: "PGRST000" } });
    const result = await fetchDailyLogs();
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("connection error");
    }
  });
});

// ── fetchWeightLogs ───────────────────────────────────────────────────────────

describe("fetchWeightLogs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: log_date と weight のみを返す", async () => {
    const rows = [
      { log_date: "2026-03-01", weight: 72.5 },
      { log_date: "2026-03-02", weight: 72.3 },
    ];
    setupChain({ data: rows, error: null });
    const result = await fetchWeightLogs();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("log_date");
    expect(result[0]).toHaveProperty("weight");
  });

  it("異常系: DB エラーのとき空配列を返す", async () => {
    setupChain({ data: null, error: { message: "DB error" } });
    const result = await fetchWeightLogs();
    expect(result).toEqual([]);
  });
});

// ── fetchDailyLogsForSettings ─────────────────────────────────────────────────

describe("fetchDailyLogsForSettings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: ログ行を返す", async () => {
    const rows = [
      { log_date: "2026-03-01", weight: 72.5, calories: 2000 },
    ];
    setupChain({ data: rows, error: null });
    const result = await fetchDailyLogsForSettings();
    expect(result).toHaveLength(1);
  });

  it("異常系: DB エラーのとき空配列を返す", async () => {
    setupChain({ data: null, error: { message: "DB error" } });
    const result = await fetchDailyLogsForSettings();
    expect(result).toEqual([]);
  });
});

// ── fetchCareerLogs ───────────────────────────────────────────────────────────

describe("fetchCareerLogs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: CareerLog[] を返す", async () => {
    const rows = [
      { id: 1, log_date: "2025-01-01", weight: 75.0, season: "2025_Spring", target_date: "2025-06-01", note: null },
    ];
    setupChain({ data: rows, error: null });
    const result = await fetchCareerLogs();
    expect(result).toHaveLength(1);
    expect(result[0].season).toBe("2025_Spring");
  });

  it("異常系: DB エラーのとき空配列を返す", async () => {
    setupChain({ data: null, error: { message: "DB error" } });
    const result = await fetchCareerLogs();
    expect(result).toEqual([]);
  });
});

// ── fetchCareerLogsForDashboard ───────────────────────────────────────────────

describe("fetchCareerLogsForDashboard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: log_date / season / target_date を含む行を返す", async () => {
    const rows = [
      { log_date: "2025-01-01", season: "2025_Spring", target_date: "2025-06-01" },
    ];
    // .from().select().order() チェーン
    const orderFn = jest.fn().mockResolvedValue({ data: rows, error: null });
    const selectFn = jest.fn().mockReturnValue({ order: orderFn });
    mockFrom.mockReturnValue({ select: selectFn });
    const result = await fetchCareerLogsForDashboard();
    expect(result).toHaveLength(1);
    expect(result[0].season).toBe("2025_Spring");
  });

  it("異常系: DB エラーのとき空配列を返す", async () => {
    const orderFn = jest.fn().mockResolvedValue({ data: null, error: { message: "err" } });
    const selectFn = jest.fn().mockReturnValue({ order: orderFn });
    mockFrom.mockReturnValue({ select: selectFn });
    const result = await fetchCareerLogsForDashboard();
    expect(result).toEqual([]);
  });
});

// ── fetchPredictions ──────────────────────────────────────────────────────────

describe("fetchPredictions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: Prediction[] を返す", async () => {
    const rows = [
      { id: 1, ds: "2026-03-15", yhat: 72.0, model_version: "v1", created_at: "2026-03-14T00:00:00Z" },
    ];
    setupChain({ data: rows, error: null });
    const result = await fetchPredictions();
    expect(result).toHaveLength(1);
    expect(result[0].ds).toBe("2026-03-15");
  });

  it("正常系: データが空のとき空配列を返す", async () => {
    setupChain({ data: [], error: null });
    const result = await fetchPredictions();
    expect(result).toEqual([]);
  });

  it("異常系: DB エラーのとき空配列を返す", async () => {
    setupChain({ data: null, error: { message: "DB error" } });
    const result = await fetchPredictions();
    expect(result).toEqual([]);
  });
});
