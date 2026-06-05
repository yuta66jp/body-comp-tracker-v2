import { saveGoogleHealthDailyMetrics } from "./saveDailyMetrics";
import type { GoogleHealthDailyMetric } from "./dailyMetrics";

function makeSupabaseMock(args: {
  existingDates?: string[];
  dailyLogsError?: { message: string } | null;
  upsertError?: { message: string } | null;
}) {
  const inMock = jest.fn().mockResolvedValue({
    data: (args.existingDates ?? []).map((log_date) => ({ log_date })),
    error: args.dailyLogsError ?? null,
  });
  const eqMock = jest.fn().mockReturnValue({ in: inMock });
  const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
  const upsertMock = jest.fn().mockResolvedValue({ error: args.upsertError ?? null });
  const fromMock = jest.fn((table: string) => {
    if (table === "daily_logs") return { select: selectMock };
    if (table === "google_health_daily_metrics") return { upsert: upsertMock };
    throw new Error("unexpected table: " + table);
  });

  return {
    supabase: { from: fromMock },
    fromMock,
    selectMock,
    eqMock,
    inMock,
    upsertMock,
  };
}

const metrics: GoogleHealthDailyMetric[] = [
  {
    date: "2026-06-02",
    stepCount: 4211,
    sleepMinutes: 450,
    deepSleepMinutes: 90,
    sleepBedAt: "2026-06-01T15:00:00.000Z",
    sleepWakeAt: "2026-06-01T22:30:00.000Z",
    hrvMs: 120.5,
    rhrBpm: 45,
  },
  {
    date: "2026-06-03",
    stepCount: 972,
    sleepMinutes: null,
    deepSleepMinutes: null,
    sleepBedAt: null,
    sleepWakeAt: null,
    hrvMs: null,
    rhrBpm: 43,
  },
];

describe("saveGoogleHealthDailyMetrics", () => {
  it("daily_logs が存在する日だけ google_health_daily_metrics に upsert する", async () => {
    const mock = makeSupabaseMock({ existingDates: ["2026-06-02"] });

    const result = await saveGoogleHealthDailyMetrics(mock.supabase as never, {
      userId: "user-id",
      metrics,
      stepsSource: "reconcile",
      syncedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(result).toEqual({
      ok: true,
      savedCount: 1,
      skippedCount: 1,
      savedDates: ["2026-06-02"],
      skippedDates: ["2026-06-03"],
    });
    expect(mock.fromMock).toHaveBeenCalledWith("daily_logs");
    expect(mock.selectMock).toHaveBeenCalledWith("log_date");
    expect(mock.eqMock).toHaveBeenCalledWith("user_id", "user-id");
    expect(mock.inMock).toHaveBeenCalledWith("log_date", ["2026-06-02", "2026-06-03"]);
    expect(mock.upsertMock).toHaveBeenCalledWith(
      [
        {
          user_id: "user-id",
          metric_date: "2026-06-02",
          step_count: 4211,
          sleep_minutes: 450,
          deep_sleep_minutes: 90,
          sleep_bed_at: "2026-06-01T15:00:00.000Z",
          sleep_wake_at: "2026-06-01T22:30:00.000Z",
          hrv_ms: 120.5,
          rhr_bpm: 45,
          google_health_steps_source: "reconcile",
          synced_at: "2026-06-05T00:00:00.000Z",
        },
      ],
      { onConflict: "user_id,metric_date" },
    );
  });

  it("daily_logs が存在しない場合は upsert しない", async () => {
    const mock = makeSupabaseMock({ existingDates: [] });

    const result = await saveGoogleHealthDailyMetrics(mock.supabase as never, {
      userId: "user-id",
      metrics,
      stepsSource: "dailyRollUp",
    });

    expect(result).toEqual({
      ok: true,
      savedCount: 0,
      skippedCount: 2,
      savedDates: [],
      skippedDates: ["2026-06-02", "2026-06-03"],
    });
    expect(mock.upsertMock).not.toHaveBeenCalled();
  });

  it("upsert 失敗時はエラーを返す", async () => {
    const mock = makeSupabaseMock({
      existingDates: ["2026-06-02", "2026-06-03"],
      upsertError: { message: "constraint violation" },
    });

    const result = await saveGoogleHealthDailyMetrics(mock.supabase as never, {
      userId: "user-id",
      metrics,
      stepsSource: "listFallback",
    });

    expect(result).toEqual({
      ok: false,
      message: "Google Health 日次メトリクスの保存に失敗しました: constraint violation",
    });
  });
});
