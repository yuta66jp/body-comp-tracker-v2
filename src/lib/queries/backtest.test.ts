/**
 * backtest query layer テスト
 *
 * Supabase client をモックして、fetchLatestRuns / fetchMetrics の
 * 成功・空・エラーケースを検証する。
 */

import { fetchLatestRuns, fetchMetrics } from "./backtest";

// ── Mock ──────────────────────────────────────────────────────────────────────

const mockLimit = jest.fn();
const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mockFrom }),
}));

type ChainResult = { data: unknown; error: unknown };

// ── fetchLatestRuns ───────────────────────────────────────────────────────────

describe("fetchLatestRuns", () => {
  beforeEach(() => jest.clearAllMocks());

  function setupRunsChain(result: ChainResult) {
    mockLimit.mockReturnValue(Promise.resolve(result));
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockSelect.mockReturnValue({ order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  }

  it("正常系: kind=ok で dailyRun / sma7Run を返す", async () => {
    const rows = [
      { id: "run-1", config: { series_type: "daily" }, created_at: "2026-03-01T00:00:00Z" },
      { id: "run-2", config: { series_type: "sma7" },  created_at: "2026-03-01T00:00:00Z" },
    ];
    setupRunsChain({ data: rows, error: null });
    const result = await fetchLatestRuns();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data.dailyRun?.id).toBe("run-1");
      expect(result.data.sma7Run?.id).toBe("run-2");
    }
  });

  it("正常系: series_type なしの run は daily として扱う", async () => {
    const rows = [
      { id: "run-legacy", config: {}, created_at: "2026-03-01T00:00:00Z" },
    ];
    setupRunsChain({ data: rows, error: null });
    const result = await fetchLatestRuns();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data.dailyRun?.id).toBe("run-legacy");
      expect(result.data.sma7Run).toBeNull();
    }
  });

  it("正常系: データが空のとき kind=ok で dailyRun / sma7Run が null", async () => {
    setupRunsChain({ data: [], error: null });
    const result = await fetchLatestRuns();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data.dailyRun).toBeNull();
      expect(result.data.sma7Run).toBeNull();
    }
  });

  it("正常系: データが null のとき kind=ok で dailyRun / sma7Run が null", async () => {
    setupRunsChain({ data: null, error: null });
    const result = await fetchLatestRuns();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data.dailyRun).toBeNull();
      expect(result.data.sma7Run).toBeNull();
    }
  });

  it("異常系: DB エラーのとき kind=error を返す（null フォールバックしない）", async () => {
    setupRunsChain({ data: null, error: { message: "connection error" } });
    const result = await fetchLatestRuns();
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("connection error");
    }
  });
});

// ── fetchMetrics ──────────────────────────────────────────────────────────────

describe("fetchMetrics", () => {
  beforeEach(() => jest.clearAllMocks());

  function setupMetricsChain(result: ChainResult) {
    mockOrder.mockReturnValue(Promise.resolve(result));
    mockEq.mockReturnValue({ order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
  }

  it("正常系: kind=ok でメトリクス配列を返す", async () => {
    const rows = [
      { id: "m-1", run_id: "run-1", horizon_days: 7, mae: 0.42, rmse: 0.55 },
      { id: "m-2", run_id: "run-1", horizon_days: 14, mae: 0.58, rmse: 0.71 },
    ];
    setupMetricsChain({ data: rows, error: null });
    const result = await fetchMetrics("run-1");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].horizon_days).toBe(7);
    }
  });

  it("正常系: データが null のとき kind=ok で空配列を返す", async () => {
    setupMetricsChain({ data: null, error: null });
    const result = await fetchMetrics("run-1");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual([]);
    }
  });

  it("正常系: 指標データ未生成のとき kind=ok で空配列（正常な空状態）", async () => {
    setupMetricsChain({ data: [], error: null });
    const result = await fetchMetrics("run-1");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual([]);
    }
  });

  it("異常系: DB エラーのとき kind=error を返す（空配列フォールバックしない）", async () => {
    setupMetricsChain({ data: null, error: { message: "DB error" } });
    const result = await fetchMetrics("run-1");
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("DB error");
    }
  });
});
