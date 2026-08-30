/**
 * dailyLogs query layer テスト
 *
 * Supabase client をモックして、各クエリ関数の戻り値・エラー処理を検証する。
 */

import {
  fetchDashboardDailyLogs,
  fetchMacroDailyLogs,
  fetchTdeeDailyLogs,
  fetchLatestUpdatedAt,
  fetchSeasonHistoryDailyLogs,
  fetchDailyLogsForSettings,
  fetchCareerLogs,
  fetchCareerLogsForDashboard,
  fetchPredictions,
} from "./dailyLogs";

// fetchMacroDailyLogs, fetchTdeeDailyLogs, fetchSeasonHistoryDailyLogs,
// fetchDailyLogsForSettings, fetchCareerLogs は QueryResult<T> を返す。
// fetchLatestUpdatedAt, fetchCareerLogsForDashboard, fetchPredictions はベストエフォートで null/空配列を返す。

// ── Mock ──────────────────────────────────────────────────────────────────────

const mockLimit = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// ── ヘルパー ──────────────────────────────────────────────────────────────────

type ChainResult = { data: unknown; error: unknown };

/**
 * .from().select().order() チェーンの
 * 最終 await 値を設定する。order() が直接 await される（limit なし）クエリ用。
 */
function setupChain(result: ChainResult) {
  const terminal = Promise.resolve(result);
  mockOrder.mockReturnValue(terminal);
  mockSelect.mockReturnValue({ order: mockOrder });
  mockFrom.mockReturnValue({ select: mockSelect });
}

/**
 * .from().select().order().limit() チェーンの最終 await 値を設定する。
 * fetchMacroDailyLogs / fetchTdeeDailyLogs / fetchLatestUpdatedAt 用。
 */
function setupLimitChain(result: ChainResult) {
  const terminal = Promise.resolve(result);
  mockLimit.mockReturnValue(terminal);
  mockOrder.mockReturnValue({ limit: mockLimit });
  mockSelect.mockReturnValue({ order: mockOrder });
  mockFrom.mockReturnValue({ select: mockSelect });
}

describe("fetchDashboardDailyLogs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("所属IDと未所属のnullを含む17列を取得し、日付昇順で返す", async () => {
    const rows = [
      { log_date: "2026-06-01", weight: 70, season_id: 6 },
      { log_date: "2026-08-24", weight: 70, season_id: null },
    ];
    setupChain({ data: rows, error: null });
    expect(await fetchDashboardDailyLogs()).toEqual({ kind: "ok", data: rows });
    expect(mockFrom).toHaveBeenCalledWith("daily_logs");
    expect(mockSelect).toHaveBeenCalledWith(
      "log_date, weight, calories, protein, fat, carbs, " +
      "is_cheat_day, is_refeed_day, is_eating_out, is_travel_day, " +
      "is_tanning_day, is_posing_day, " +
      "had_bowel_movement, training_type, work_mode, updated_at, season_id"
    );
    expect(mockOrder).toHaveBeenCalledWith("log_date", { ascending: true });
  });

  it("取得失敗を空の記録として扱わない", async () => {
    setupChain({ data: null, error: { message: "DB error", code: "PGRST000" } });
    await expect(fetchDashboardDailyLogs()).resolves.toEqual({ kind: "error", message: "DB error" });
  });

  it("正常取得のnullデータは空配列を返す", async () => {
    setupChain({ data: null, error: null });
    await expect(fetchDashboardDailyLogs()).resolves.toEqual({ kind: "ok", data: [] });
  });
});

// ── fetchMacroDailyLogs ───────────────────────────────────────────────────────

describe("fetchMacroDailyLogs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: kind=ok で MacroDailyLog[] を昇順で返す", async () => {
    // DESC LIMIT で返ってくるデータ（降順）を渡す → 関数内で昇順に reverse される
    const rows = [
      { log_date: "2026-03-02", weight: 72.3, calories: 1900, protein: 150, fat: 60, carbs: 200 },
      { log_date: "2026-03-01", weight: 72.5, calories: 2000, protein: 155, fat: 65, carbs: 210 },
    ];
    setupLimitChain({ data: rows, error: null });
    const result = await fetchMacroDailyLogs(60);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.log_date).toBe("2026-03-01"); // reverse 後は昇順
    }
  });

  it("正常系: データが null のとき kind=ok で空配列を返す", async () => {
    setupLimitChain({ data: null, error: null });
    const result = await fetchMacroDailyLogs();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual([]);
    }
  });

  it("異常系: DB エラーのとき kind=error を返す", async () => {
    setupLimitChain({ data: null, error: { message: "connection error", code: "PGRST000" } });
    const result = await fetchMacroDailyLogs();
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("connection error");
    }
  });
});

// ── fetchTdeeDailyLogs ────────────────────────────────────────────────────────

describe("fetchTdeeDailyLogs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: kind=ok で TdeeDailyLog[] を昇順で返す", async () => {
    const rows = [
      { log_date: "2026-03-02", weight: 72.3, calories: 1900 },
      { log_date: "2026-03-01", weight: 72.5, calories: 2000 },
    ];
    setupLimitChain({ data: rows, error: null });
    const result = await fetchTdeeDailyLogs(30);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.log_date).toBe("2026-03-01");
    }
  });

  it("正常系: データが null のとき kind=ok で空配列を返す", async () => {
    setupLimitChain({ data: null, error: null });
    const result = await fetchTdeeDailyLogs();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual([]);
    }
  });

  it("異常系: DB エラーのとき kind=error を返す", async () => {
    setupLimitChain({ data: null, error: { message: "DB error", code: "PGRST000" } });
    const result = await fetchTdeeDailyLogs();
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("DB error");
    }
  });
});

// ── fetchLatestUpdatedAt ──────────────────────────────────────────────────────

describe("fetchLatestUpdatedAt", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: updated_at 文字列を返す", async () => {
    const rows = [{ updated_at: "2026-03-21T10:00:00Z" }];
    setupLimitChain({ data: rows, error: null });
    const result = await fetchLatestUpdatedAt();
    expect(result).toBe("2026-03-21T10:00:00Z");
  });

  it("正常系: データが空のとき null を返す", async () => {
    setupLimitChain({ data: [], error: null });
    const result = await fetchLatestUpdatedAt();
    expect(result).toBeNull();
  });

  it("異常系: DB エラーのとき null を返す", async () => {
    setupLimitChain({ data: null, error: { message: "DB error" } });
    const result = await fetchLatestUpdatedAt();
    expect(result).toBeNull();
  });
});

describe("fetchSeasonHistoryDailyLogs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("season_id nullを含む履歴用projectionをQueryResultで返す", async () => {
    const rows = [
      { log_date: "2026-03-01", weight: 72.5, season_id: 1 },
      { log_date: "2026-03-02", weight: 72.3, season_id: null },
    ];
    setupChain({ data: rows, error: null });

    await expect(fetchSeasonHistoryDailyLogs()).resolves.toEqual({
      kind: "ok",
      data: rows,
    });
    expect(mockSelect).toHaveBeenCalledWith("log_date, weight, season_id");
  });

  it("DBエラーをQueryResult errorとして返す", async () => {
    setupChain({ data: null, error: { message: "DB error", code: "PGRST000" } });
    await expect(fetchSeasonHistoryDailyLogs()).resolves.toEqual({
      kind: "error",
      message: "DB error",
    });
  });
});

// ── fetchDailyLogsForSettings ─────────────────────────────────────────────────

describe("fetchDailyLogsForSettings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: kind=ok でログ行を返す", async () => {
    const rows = [
      { log_date: "2026-03-01", weight: 72.5, calories: 2000 },
    ];
    setupChain({ data: rows, error: null });
    const result = await fetchDailyLogsForSettings();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toHaveLength(1);
    }
  });

  it("正常系: データが null のとき kind=ok で空配列を返す", async () => {
    setupChain({ data: null, error: null });
    const result = await fetchDailyLogsForSettings();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual([]);
    }
  });

  it("異常系: DB エラーのとき kind=error を返す", async () => {
    setupChain({ data: null, error: { message: "DB error", code: "PGRST000" } });
    const result = await fetchDailyLogsForSettings();
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("DB error");
    }
  });
});

// ── fetchCareerLogs ───────────────────────────────────────────────────────────

describe("fetchCareerLogs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("正常系: kind=ok で CareerLog[] を返す", async () => {
    const rows = [
      { id: 1, log_date: "2025-01-01", weight: 75.0, season: "2025_Spring", target_date: "2025-06-01", note: null },
    ];
    setupChain({ data: rows, error: null });
    const result = await fetchCareerLogs();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.season).toBe("2025_Spring");
    }
  });

  it("正常系: データが null のとき kind=ok で空配列を返す", async () => {
    setupChain({ data: null, error: null });
    const result = await fetchCareerLogs();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual([]);
    }
  });

  it("異常系: DB エラーのとき kind=error を返す", async () => {
    setupChain({ data: null, error: { message: "DB error", code: "PGRST000" } });
    const result = await fetchCareerLogs();
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("DB error");
    }
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
    expect(result[0]!.season).toBe("2025_Spring");
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
    expect(result[0]!.ds).toBe("2026-03-15");
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
