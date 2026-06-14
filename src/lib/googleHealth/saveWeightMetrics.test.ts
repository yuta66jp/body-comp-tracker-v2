import { saveGoogleHealthWeightMetrics } from "./saveWeightMetrics";
import type {
  GoogleHealthWeightMetric,
  GoogleHealthWeightSkippedMetric,
} from "./dailyMetrics";

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
    if (table === "daily_logs") return { select: selectMock, upsert: upsertMock };
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

const metrics: GoogleHealthWeightMetric[] = [
  {
    date: "2026-06-02",
    weightKg: 72.5,
    sampleTime: "2026-06-01T23:00:00.000Z",
    dataPointName: "weight-1",
  },
  {
    date: "2026-06-03",
    weightKg: 72.3,
    sampleTime: "2026-06-02T23:00:00.000Z",
    dataPointName: "weight-2",
  },
];

describe("saveGoogleHealthWeightMetrics", () => {
  it("体重ログを daily_logs に upsert し、作成日と更新日を分類する", async () => {
    const mock = makeSupabaseMock({ existingDates: ["2026-06-02"] });
    const skipped: GoogleHealthWeightSkippedMetric[] = [
      {
        date: "2026-06-04",
        reason: "multiple_weight_logs",
        count: 2,
        message: "Google Health の体重ログが同日に2件あるためスキップしました。",
      },
    ];

    const result = await saveGoogleHealthWeightMetrics(mock.supabase as never, {
      userId: "user-id",
      metrics,
      skipped,
    });

    expect(result).toEqual({
      ok: true,
      syncedCount: 2,
      createdCount: 1,
      updatedCount: 1,
      skippedCount: 1,
      createdDates: ["2026-06-03"],
      updatedDates: ["2026-06-02"],
      skipped,
    });
    expect(mock.fromMock).toHaveBeenCalledWith("daily_logs");
    expect(mock.selectMock).toHaveBeenCalledWith("log_date");
    expect(mock.eqMock).toHaveBeenCalledWith("user_id", "user-id");
    expect(mock.inMock).toHaveBeenCalledWith("log_date", ["2026-06-02", "2026-06-03"]);
    expect(mock.upsertMock).toHaveBeenCalledWith(
      [
        {
          user_id: "user-id",
          log_date: "2026-06-02",
          weight: 72.5,
        },
        {
          user_id: "user-id",
          log_date: "2026-06-03",
          weight: 72.3,
        },
      ],
      { onConflict: "user_id,log_date" },
    );
  });

  it("有効な体重ログがない場合は upsert しない", async () => {
    const mock = makeSupabaseMock({ existingDates: [] });

    const result = await saveGoogleHealthWeightMetrics(mock.supabase as never, {
      userId: "user-id",
      metrics: [],
      skipped: [
        {
          date: "2026-06-04",
          reason: "multiple_weight_logs",
          count: 2,
          message: "Google Health の体重ログが同日に2件あるためスキップしました。",
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      syncedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      createdDates: [],
      updatedDates: [],
      skipped: [
        {
          date: "2026-06-04",
          reason: "multiple_weight_logs",
          count: 2,
          message: "Google Health の体重ログが同日に2件あるためスキップしました。",
        },
      ],
    });
    expect(mock.upsertMock).not.toHaveBeenCalled();
  });

  it("upsert 失敗時はエラーを返す", async () => {
    const mock = makeSupabaseMock({
      existingDates: ["2026-06-02"],
      upsertError: { message: "constraint violation" },
    });

    const result = await saveGoogleHealthWeightMetrics(mock.supabase as never, {
      userId: "user-id",
      metrics: [metrics[0]!],
    });

    expect(result).toEqual({
      ok: false,
      message: "Google Health 体重ログの保存に失敗しました: constraint violation",
    });
  });
});
