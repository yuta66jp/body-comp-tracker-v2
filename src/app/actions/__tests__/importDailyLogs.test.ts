jest.mock("@/app/actions/saveDailyLog", () => ({
  saveDailyLog: jest.fn(),
}));
jest.mock("@/lib/cache/revalidate", () => ({
  revalidateAfterDailyLogMutation: jest.fn(),
}));

import { importDailyLogs } from "@/app/actions/importDailyLogs";
import { saveDailyLog } from "@/app/actions/saveDailyLog";
import type { ParsedRow } from "@/lib/utils/csvParser";

const mockSaveDailyLog = saveDailyLog as jest.Mock;

function makeRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    log_date: "2026-04-01",
    weight: 70.0,
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
    note: null,
    is_cheat_day: false,
    is_refeed_day: false,
    is_eating_out: false,
    is_travel_day: false,
    is_tanning_day: false,
    is_posing_day: false,
    had_bowel_movement: null,
    training_type: null,
    work_mode: null,
    leg_flag: null,
    ...overrides,
  };
}

describe("importDailyLogs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("空配列を渡すと count=0, skipped=0 を返す", async () => {
    const result = await importDailyLogs([]);

    expect(result).toEqual({ ok: true, count: 0, skipped: 0 });
    expect(mockSaveDailyLog).not.toHaveBeenCalled();
  });

  it("saveDailyLog が呼ばれる", async () => {
    mockSaveDailyLog.mockResolvedValue({ ok: true });
    const row = makeRow();

    const result = await importDailyLogs([row]);

    expect(result).toEqual({ ok: true, count: 1, skipped: 0 });
    expect(mockSaveDailyLog).toHaveBeenCalledWith(
      {
        log_date: "2026-04-01",
        weight: 70.0,
        calories: null,
        protein: null,
        fat: null,
        carbs: null,
        note: null,
        is_cheat_day: false,
        is_refeed_day: false,
        is_eating_out: false,
        is_travel_day: false,
        is_tanning_day: false,
        is_posing_day: false,
        had_bowel_movement: null,
        training_type: null,
        work_mode: null,
      },
      { skipRevalidate: true },
    );
  });

  it("saveDailyLog 失敗時は skipped をインクリメントする", async () => {
    mockSaveDailyLog.mockResolvedValue({ ok: false, message: "invalid" });

    const result = await importDailyLogs([makeRow()]);

    expect(result).toEqual({ ok: true, count: 0, skipped: 1 });
  });

  it("saveDailyLog の認証切れはインポート全体のエラーとして返す", async () => {
    mockSaveDailyLog.mockResolvedValue({
      ok: false,
      message: "ログインし直してください",
      reason: "auth_required",
    });

    const result = await importDailyLogs([makeRow()]);

    expect(result).toEqual({ ok: false, message: "ログインし直してください" });
  });

  it("複数行の成功・失敗件数を集計する", async () => {
    mockSaveDailyLog
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, message: "invalid" })
      .mockResolvedValueOnce({ ok: true });

    const result = await importDailyLogs([
      makeRow({ log_date: "2026-04-01" }),
      makeRow({ log_date: "2026-04-02" }),
      makeRow({ log_date: "2026-04-03" }),
    ]);

    expect(result).toEqual({ ok: true, count: 2, skipped: 1 });
  });
});
