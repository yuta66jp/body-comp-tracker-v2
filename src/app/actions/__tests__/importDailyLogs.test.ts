/**
 * importDailyLogs — 睡眠セッション保存の統合テスト
 *
 * テスト構成:
 *   1. sleep データなし行 → saveDailyLog のみ呼ばれる
 *   2. sleep データあり行 → saveDailyLog の後に saveSleepSession が呼ばれる
 *   3. saveSleepSession 失敗 → sleepSkipped をインクリメント、count は変わらない
 *   4. saveDailyLog 失敗 → skipped をインクリメント、saveSleepSession は呼ばれない
 *   5. 空行リスト → count=0, skipped=0, sleepSkipped=0
 */

// モジュールモック（import より前にホイスト）
jest.mock("@/app/actions/saveDailyLog", () => ({
  saveDailyLog: jest.fn(),
}));
jest.mock("@/app/actions/saveSleepSession", () => ({
  saveSleepSession: jest.fn(),
}));
jest.mock("@/lib/cache/revalidate", () => ({
  revalidateAfterDailyLogMutation: jest.fn(),
}));

import { importDailyLogs } from "@/app/actions/importDailyLogs";
import { saveDailyLog } from "@/app/actions/saveDailyLog";
import { saveSleepSession } from "@/app/actions/saveSleepSession";
import type { ParsedRow } from "@/lib/utils/csvParser";

const mockSaveDailyLog    = saveDailyLog    as jest.Mock;
const mockSaveSleepSession = saveSleepSession as jest.Mock;

/** テスト用の最小 ParsedRow を作成するファクトリ */
function makeRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    log_date: "2026-04-01",
    weight: 70.0,
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
    note: null,
    is_cheat_day:   false,
    is_refeed_day:  false,
    is_eating_out:  false,
    is_travel_day:  false,
    is_tanning_day: false,
    is_posing_day:  false,
    sleep_hours: null,
    sleep_bed_time: null,
    sleep_wake_time: null,
    had_bowel_movement: null,
    training_type: null,
    work_mode: null,
    leg_flag: null,
    ...overrides,
  };
}

// ─── テスト ──────────────────────────────────────────────────────────────────

describe("importDailyLogs — 空行", () => {
  it("空配列を渡すと count=0, skipped=0, sleepSkipped=0", async () => {
    const result = await importDailyLogs([]);
    expect(result).toEqual({ ok: true, count: 0, skipped: 0, sleepSkipped: 0 });
    expect(mockSaveDailyLog).not.toHaveBeenCalled();
    expect(mockSaveSleepSession).not.toHaveBeenCalled();
  });
});

describe("importDailyLogs — sleep データなし行", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveDailyLog.mockResolvedValue({ ok: true });
  });

  it("saveDailyLog が呼ばれ saveSleepSession は呼ばれない", async () => {
    const row = makeRow({ sleep_bed_time: null, sleep_wake_time: null });
    const result = await importDailyLogs([row]);

    expect(result).toEqual({ ok: true, count: 1, skipped: 0, sleepSkipped: 0 });
    expect(mockSaveDailyLog).toHaveBeenCalledTimes(1);
    expect(mockSaveSleepSession).not.toHaveBeenCalled();
  });
});

describe("importDailyLogs — sleep データあり行", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveDailyLog.mockResolvedValue({ ok: true });
    mockSaveSleepSession.mockResolvedValue({ ok: true });
  });

  it("saveDailyLog の後に saveSleepSession が呼ばれる（順序保証）", async () => {
    const callOrder: string[] = [];
    mockSaveDailyLog.mockImplementation(async () => {
      callOrder.push("saveDailyLog");
      return { ok: true };
    });
    mockSaveSleepSession.mockImplementation(async () => {
      callOrder.push("saveSleepSession");
      return { ok: true };
    });

    const row = makeRow({ sleep_bed_time: "23:30", sleep_wake_time: "07:00" });
    await importDailyLogs([row]);

    expect(callOrder).toEqual(["saveDailyLog", "saveSleepSession"]);
  });

  it("saveSleepSession に正しい引数が渡される", async () => {
    const row = makeRow({
      log_date: "2026-04-01",
      sleep_bed_time: "23:30",
      sleep_wake_time: "07:00",
    });
    await importDailyLogs([row]);

    expect(mockSaveSleepSession).toHaveBeenCalledWith(
      { wake_date: "2026-04-01", bed_time: "23:30", wake_time: "07:00" },
      { skipRevalidate: true }
    );
  });

  it("count=1, sleepSkipped=0 を返す", async () => {
    const row = makeRow({ sleep_bed_time: "23:30", sleep_wake_time: "07:00" });
    const result = await importDailyLogs([row]);

    expect(result).toEqual({ ok: true, count: 1, skipped: 0, sleepSkipped: 0 });
  });

  it("saveSleepSession が skipRevalidate: true で呼ばれる（バッチ revalidate 対応）", async () => {
    const row = makeRow({ sleep_bed_time: "23:30", sleep_wake_time: "07:00" });
    await importDailyLogs([row]);

    const [, options] = mockSaveSleepSession.mock.calls[0]!;
    expect(options).toEqual({ skipRevalidate: true });
  });
});

describe("importDailyLogs — saveSleepSession 失敗", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveDailyLog.mockResolvedValue({ ok: true });
    mockSaveSleepSession.mockResolvedValue({ ok: false, message: "DB error" });
  });

  it("sleepSkipped をインクリメントし count は変わらない", async () => {
    const row = makeRow({ sleep_bed_time: "23:30", sleep_wake_time: "07:00" });
    const result = await importDailyLogs([row]);

    expect(result).toEqual({ ok: true, count: 1, skipped: 0, sleepSkipped: 1 });
  });

  it("複数行のうち一部だけ sleep 失敗: sleepSkipped は失敗件数分だけ増える", async () => {
    mockSaveSleepSession
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, message: "DB error" });

    const rows = [
      makeRow({ log_date: "2026-04-01", sleep_bed_time: "23:30", sleep_wake_time: "07:00" }),
      makeRow({ log_date: "2026-04-02", sleep_bed_time: "22:00", sleep_wake_time: "06:30" }),
    ];
    const result = await importDailyLogs(rows);

    expect(result).toEqual({ ok: true, count: 2, skipped: 0, sleepSkipped: 1 });
  });

  it("saveSleepSession の認証切れはインポート全体のエラーとして返す", async () => {
    mockSaveSleepSession.mockResolvedValueOnce({
      ok: false,
      message: "ログインし直してください",
      reason: "auth_required",
    });

    const row = makeRow({ sleep_bed_time: "23:30", sleep_wake_time: "07:00" });
    const result = await importDailyLogs([row]);

    expect(result).toEqual({ ok: false, message: "ログインし直してください" });
  });
});

describe("importDailyLogs — saveDailyLog 失敗", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveDailyLog.mockResolvedValue({ ok: false, message: "invalid" });
  });

  it("skipped をインクリメントし saveSleepSession は呼ばれない", async () => {
    const row = makeRow({ sleep_bed_time: "23:30", sleep_wake_time: "07:00" });
    const result = await importDailyLogs([row]);

    expect(result).toEqual({ ok: true, count: 0, skipped: 1, sleepSkipped: 0 });
    expect(mockSaveSleepSession).not.toHaveBeenCalled();
  });

  it("saveDailyLog の認証切れは skipped にせずインポート全体のエラーとして返す", async () => {
    mockSaveDailyLog.mockResolvedValueOnce({
      ok: false,
      message: "ログインし直してください",
      reason: "auth_required",
    });

    const row = makeRow({ sleep_bed_time: "23:30", sleep_wake_time: "07:00" });
    const result = await importDailyLogs([row]);

    expect(result).toEqual({ ok: false, message: "ログインし直してください" });
    expect(mockSaveSleepSession).not.toHaveBeenCalled();
  });
});

describe("importDailyLogs — 混在シナリオ", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sleep あり・なし・saveDailyLog 失敗が混在するとき各カウントが正確", async () => {
    mockSaveDailyLog
      .mockResolvedValueOnce({ ok: true })   // 行1: daily_log 成功
      .mockResolvedValueOnce({ ok: true })   // 行2: daily_log 成功
      .mockResolvedValueOnce({ ok: false, message: "err" }); // 行3: daily_log 失敗
    mockSaveSleepSession
      .mockResolvedValueOnce({ ok: true });  // 行1: sleep 成功

    const rows = [
      makeRow({ log_date: "2026-04-01", sleep_bed_time: "23:30", sleep_wake_time: "07:00" }),
      makeRow({ log_date: "2026-04-02", sleep_bed_time: null,    sleep_wake_time: null }),
      makeRow({ log_date: "2026-04-03", sleep_bed_time: "22:00", sleep_wake_time: "06:00" }),
    ];
    const result = await importDailyLogs(rows);

    expect(result).toEqual({ ok: true, count: 2, skipped: 1, sleepSkipped: 0 });
    expect(mockSaveSleepSession).toHaveBeenCalledTimes(1); // 行1 のみ
  });
});
