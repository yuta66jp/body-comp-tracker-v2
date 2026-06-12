/**
 * analytics query layer テスト
 *
 * Supabase client をモックして、以下を検証する:
 *   - 正常系: データ取得 + 新鮮さ判定の伝播
 *   - 行なし (PGRST116): unavailable を返す
 *   - DB エラー: error を返す
 *   - stale 判定: updated_at が古いとき stale を返す
 */

import { fetchEnrichedLogs } from "./analytics";

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

  it("過去日更新(翌日): 最新 log_date は変わらないが MAX(updated_at) が翌日 → stale", async () => {
    // 2026-03-10 の行を 2026-03-15 に編集した場合のシナリオ
    // cache: 2026-03-14T18:00:00Z (バッチ実行)、MAX(updated_at): 2026-03-15T01:00:00Z
    const rows = [{ log_date: "2026-03-10", weight_sma7: 73.0, tdee_estimated: 2350 }];
    setupChain({
      data: { payload: rows, updated_at: "2026-03-14T18:00:00Z" },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-15T01:00:00Z");
    expect(result.availability.status).toBe("stale");
  });

  it("過去日更新(同日 intraday): バッチ後に同日中に過去日を修正した場合も stale", async () => {
    // cache: 2026-03-14T18:00:00Z (バッチ実行)
    // MAX(updated_at): 2026-03-14T20:00:00Z (同日中に過去日の行を編集)
    // 日付粒度では検知できないがタイムスタンプ比較で stale になること
    const rows = [{ log_date: "2026-03-10", weight_sma7: 73.0, tdee_estimated: 2350 }];
    setupChain({
      data: { payload: rows, updated_at: "2026-03-14T18:00:00Z" },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-14T20:00:00Z");
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

  // ── payload runtime validation ──────────────────────────────────────────────

  it("payload が配列でない場合: status = unavailable / rows = []", async () => {
    setupChain({
      data: { payload: { log_date: "2026-03-14" }, updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("unavailable");
    expect(result.rows).toEqual([]);
    expect(result.updatedAt).toBeNull();
  });

  it("payload が null の場合: status = unavailable / rows = []", async () => {
    setupChain({
      data: { payload: null, updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("unavailable");
    expect(result.rows).toEqual([]);
  });

  it("payload 要素が number の場合（不正 shape）: status = unavailable / rows = []", async () => {
    setupChain({
      data: { payload: [1, 2, 3], updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("unavailable");
    expect(result.rows).toEqual([]);
  });

  it("payload 要素が object だが必須 key が欠けている場合: status = unavailable", async () => {
    // { foo: "bar" } は log_date / weight_sma7 / tdee_estimated を持たない
    setupChain({
      data: { payload: [{ foo: "bar" }], updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("unavailable");
    expect(result.rows).toEqual([]);
    expect(result.updatedAt).toBeNull();
  });

  it("log_date が number の場合（string でない）: status = unavailable", async () => {
    setupChain({
      data: {
        payload: [{ log_date: 20260314, weight_sma7: 70.0, tdee_estimated: 2400 }],
        updated_at: "2026-03-14T03:00:00Z",
      },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("unavailable");
    expect(result.rows).toEqual([]);
  });

  it("weight_sma7 が null の正常行: status = fresh（null は有効値）", async () => {
    setupChain({
      data: {
        payload: [{ log_date: "2026-03-14", weight_sma7: null, tdee_estimated: null }],
        updated_at: "2026-03-14T03:00:00Z",
      },
      error: null,
    });
    const result = await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(result.availability.status).toBe("fresh");
    expect(result.rows).toHaveLength(1);
  });

  it("payload validation 失敗時は console.error が呼ばれる", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    setupChain({
      data: { payload: "invalid", updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("enriched_logs: payload validation failed"),
      expect.anything()
    );
    spy.mockRestore();
  });

  it("要素 shape validation 失敗時は console.error にインデックスが含まれる", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    setupChain({
      data: { payload: [{ foo: "bar" }], updated_at: "2026-03-14T03:00:00Z" },
      error: null,
    });
    await fetchEnrichedLogs("2026-03-14T03:00:00Z");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("row[0]")
    );
    spy.mockRestore();
  });
});
