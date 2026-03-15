/**
 * analytics query layer テスト
 *
 * Supabase client をモックして、以下を検証する:
 *   - 正常系: データ取得 + 新鮮さ判定の伝播
 *   - 行なし (PGRST116): unavailable を返す
 *   - DB エラー: error を返す
 *   - stale 判定: updated_at が古いとき stale を返す
 */

import { fetchEnrichedLogs, fetchFactorAnalysis } from "./analytics";

// ── Mock ──────────────────────────────────────────────────────────────────────

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function setupChain(result: { data: unknown; error: unknown }) {
  mockSingle.mockResolvedValue(result);
  mockEq.mockReturnValue({ single: mockSingle });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
}

// ── fetchEnrichedLogs ─────────────────────────────────────────────────────────

describe("fetchEnrichedLogs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: fresh — rows を返し status = fresh", async () => {
    const rows = [
      { log_date: "2026-03-14", weight_sma7: 72.0, tdee_estimated: 2400 },
    ];
    setupChain({
      data: { payload: rows, updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("fresh");
    expect(result.rows).toHaveLength(1);
    expect(result.updatedAt).toBe("2026-03-14T03:00:00Z");
  });

  it("正常系: stale — cacheUpdatedAt が latestRawLogUpdatedAt より古いとき status = stale", async () => {
    const rows = [{ log_date: "2026-03-12", weight_sma7: 72.2, tdee_estimated: 2380 }];
    setupChain({
      data: { payload: rows, updated_at: "2026-03-12T03:00:00Z" },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-14T10:00:00Z");
    expect(result.availability.status).toBe("stale");
    expect(result.availability.staleDays).toBe(2);
    expect(result.rows).toHaveLength(1);
  });

  it("過去日更新: 最新 log_date は変わらないが MAX(updated_at) が cache より新しいとき stale", async () => {
    // 2026-03-10 の行を 2026-03-15 に編集した場合のシナリオ
    // cache: 2026-03-14T18:00:00Z (バッチ実行)
    // MAX(updated_at): 2026-03-15T01:00:00Z (過去日の行を翌日編集)
    // 最新 log_date は 2026-03-14 で変わっていないが、updated_at が新しいので stale になること
    const rows = [{ log_date: "2026-03-10", weight_sma7: 73.0, tdee_estimated: 2350 }];
    setupChain({
      data: { payload: rows, updated_at: "2026-03-14T18:00:00Z" },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-15T01:00:00Z");
    expect(result.availability.status).toBe("stale");
  });

  it("行なし (PGRST116): status = unavailable / rows = []", async () => {
    setupChain({ data: null, error: { code: "PGRST116", message: "not found" } });
    const result = await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("unavailable");
    expect(result.rows).toEqual([]);
    expect(result.updatedAt).toBeNull();
  });

  it("DB エラー (PGRST116 以外): status = error / rows = []", async () => {
    setupChain({ data: null, error: { code: "500", message: "server error" } });
    const result = await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("error");
    expect(result.rows).toEqual([]);
    expect(result.updatedAt).toBeNull();
  });

  it("data が null: status = unavailable / rows = []", async () => {
    setupChain({ data: null, error: null });
    const result = await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("unavailable");
    expect(result.rows).toEqual([]);
  });

  it("latestRawLogUpdatedAt が null のとき cacheUpdatedAt のみで判定 → fresh", async () => {
    setupChain({
      data: { payload: [], updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    const result = await fetchEnrichedLogs(null);
    expect(result.availability.status).toBe("fresh");
  });
});

// ── fetchFactorAnalysis ───────────────────────────────────────────────────────

describe("fetchFactorAnalysis", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: fresh — payload / meta を返し status = fresh", async () => {
    const payload = {
      cal_lag1: { label: "前日カロリー", importance: 0.3, pct: 30 },
      _meta: { sample_count: 100, date_from: "2025-01-01", date_to: "2026-03-14", total_rows: 100 },
    };
    setupChain({
      data: { payload, updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    const result = await fetchFactorAnalysis("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("fresh");
    expect(result.payload).not.toBeNull();
    expect(result.payload!["cal_lag1"]).toBeDefined();
    // _meta は payload から除外されている
    expect(result.payload!["_meta"]).toBeUndefined();
    expect(result.meta).not.toBeNull();
    expect(result.updatedAt).toBe("2026-03-14T03:00:00Z");
  });

  it("正常系: stale — cacheUpdatedAt が latestRawLogUpdatedAt より古いとき status = stale", async () => {
    const payload = { cal_lag1: { label: "前日カロリー", importance: 0.3, pct: 30 } };
    setupChain({
      data: { payload, updated_at: "2026-03-10T03:00:00Z" },
      error: null,
    });
    const result = await fetchFactorAnalysis("2026-03-14T10:00:00Z");
    expect(result.availability.status).toBe("stale");
    expect(result.availability.staleDays).toBe(4);
    expect(result.payload).not.toBeNull();
  });

  it("過去日更新: 最新 log_date は変わらないが MAX(updated_at) が cache より新しいとき stale", async () => {
    // 2026-03-10 の行を 2026-03-15 に編集した場合のシナリオ
    // cache: 2026-03-14T18:00:00Z (バッチ実行)
    // MAX(updated_at): 2026-03-15T01:00:00Z (過去日の行を翌日編集)
    const payload = { cal_lag1: { label: "前日カロリー", importance: 0.3, pct: 30 } };
    setupChain({
      data: { payload, updated_at: "2026-03-14T18:00:00Z" },
      error: null,
    });
    const result = await fetchFactorAnalysis("2026-03-15T01:00:00Z");
    expect(result.availability.status).toBe("stale");
    expect(result.payload).not.toBeNull();
  });

  it("_stability がある場合: stability / cv が各エントリにマージされる", async () => {
    const payload = {
      cal_lag1: { label: "前日カロリー", importance: 0.3, pct: 30 },
      _stability: { cal_lag1: { stability: "high", cv: 0.1 } },
    };
    setupChain({
      data: { payload, updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    const result = await fetchFactorAnalysis("2026-03-14T03:00:00Z");
    expect(result.payload!["cal_lag1"].stability).toBe("high");
    expect(result.payload!["cal_lag1"].cv).toBe(0.1);
    // _stability はエントリから除外されている
    expect(result.payload!["_stability"]).toBeUndefined();
  });

  it("_stability がない場合（旧バッチ）: stability = unavailable になる", async () => {
    const payload = {
      cal_lag1: { label: "前日カロリー", importance: 0.3, pct: 30 },
    };
    setupChain({
      data: { payload, updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    const result = await fetchFactorAnalysis("2026-03-14T03:00:00Z");
    expect(result.payload!["cal_lag1"].stability).toBe("unavailable");
    expect(result.payload!["cal_lag1"].cv).toBeNull();
  });

  it("行なし (PGRST116): status = unavailable / payload = null", async () => {
    setupChain({ data: null, error: { code: "PGRST116", message: "not found" } });
    const result = await fetchFactorAnalysis("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("unavailable");
    expect(result.payload).toBeNull();
    expect(result.meta).toBeNull();
    expect(result.updatedAt).toBeNull();
  });

  it("DB エラー: status = error / payload = null", async () => {
    setupChain({ data: null, error: { code: "500", message: "server error" } });
    const result = await fetchFactorAnalysis("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("error");
    expect(result.payload).toBeNull();
  });

  it("data が null: status = unavailable / payload = null", async () => {
    setupChain({ data: null, error: null });
    const result = await fetchFactorAnalysis("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("unavailable");
    expect(result.payload).toBeNull();
  });

  it("latestRawLogUpdatedAt が null のとき cacheUpdatedAt のみで判定 → fresh", async () => {
    const payload = { cal_lag1: { label: "前日カロリー", importance: 0.3, pct: 30 } };
    setupChain({
      data: { payload, updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    const result = await fetchFactorAnalysis(null);
    expect(result.availability.status).toBe("fresh");
  });
});
