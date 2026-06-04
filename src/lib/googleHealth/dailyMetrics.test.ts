import {
  buildGoogleHealthDailyRollupBody,
  buildGoogleHealthDailyRollupUrl,
  buildGoogleHealthStepsListUrl,
  fetchGoogleHealthSteps,
  fetchGoogleHealthStepsDailyRollup,
  normalizeGoogleHealthDailyMetrics,
} from "./dailyMetrics";
import type { GoogleHealthPocRange, GoogleHealthPocTargetResult } from "./poc";

const range: GoogleHealthPocRange = {
  startDate: "2026-06-02",
  endDate: "2026-06-04",
  endExclusiveDate: "2026-06-05",
};

function okResult(
  key: "sleep" | "heartRateVariability" | "restingHeartRate",
  dataPoints: unknown[],
): GoogleHealthPocTargetResult {
  return {
    ok: true,
    key,
    label: key,
    dataType: key,
    filter: "",
    pageCount: 1,
    dataPoints,
    nextPageToken: null,
  };
}

describe("Google Health daily metrics", () => {
  it("steps dailyRollUp のURLとbodyを組み立てる", () => {
    expect(buildGoogleHealthDailyRollupUrl("steps")).toBe(
      "https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp",
    );

    expect(buildGoogleHealthDailyRollupBody(range)).toEqual({
      range: {
        start: { date: { year: 2026, month: 6, day: 2 } },
        end: { date: { year: 2026, month: 6, day: 5 } },
      },
      windowSizeDays: 1,
      pageSize: 10000,
      dataSourceFamily: "users/me/dataSourceFamilies/all-sources",
    });
  });

  it("steps list fallback のURLを組み立てる", () => {
    const url = new URL(buildGoogleHealthStepsListUrl(range));

    expect(url.origin + url.pathname).toBe(
      "https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints",
    );
    expect(url.searchParams.get("pageSize")).toBe("10000");
    expect(url.searchParams.get("filter")).toBe(
      "steps.interval.civil_start_time >= \"2026-06-02\" AND steps.interval.civil_start_time < \"2026-06-05\"",
    );
  });

  it("steps dailyRollUp をPOSTで取得する", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({
        rollupDataPoints: [{ steps: { countSum: "1234" } }],
      }), { status: 200 }),
    );

    const result = await fetchGoogleHealthStepsDailyRollup({
      range,
      accessToken: "access-token",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.source === "dailyRollUp") {
      expect(result.source).toBe("dailyRollUp");
      expect(result.rollupDataPoints).toEqual([{ steps: { countSum: "1234" } }]);
      expect(result.nextPageToken).toBeNull();
    }

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("steps dailyRollUp が400の場合はlistでフォールバック取得する", async () => {
    const details = [{ reason: "invalidRange" }];
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          error: {
            message: "Invalid argument in request.",
            details,
          },
        }), { status: 400 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          dataPoints: [
            {
              steps: {
                count: "123",
                interval: {
                  civilStartTime: { date: { year: 2026, month: 6, day: 2 } },
                },
              },
            },
          ],
        }), { status: 200 }),
      );

    const result = await fetchGoogleHealthSteps({
      range,
      accessToken: "access-token",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.source === "listFallback") {
      expect(result.source).toBe("listFallback");
      expect(result.fallbackFrom).toEqual({
        source: "dailyRollUp",
        status: 400,
        message: "Invalid argument in request.",
        details,
      });
      expect(result.dataPoints).toEqual([
        {
          steps: {
            count: "123",
            interval: {
              civilStartTime: { date: { year: 2026, month: 6, day: 2 } },
            },
          },
        },
      ]);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/users/me/dataTypes/steps/dataPoints?"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          Accept: "application/json",
        }),
      }),
    );
  });

  it("steps dailyRollUp が400以外で失敗した場合はフォールバックしない", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: {
          message: "Required OAuth scope(s) are missing for this operation.",
        },
      }), { status: 403 }),
    );

    const result = await fetchGoogleHealthSteps({
      range,
      accessToken: "access-token",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      dataType: "steps",
      source: "dailyRollUp",
      status: 403,
      message: "Required OAuth scope(s) are missing for this operation.",
    });
  });

  it("raw response を日次メトリクスへ正規化する", () => {
    const sourceResults: GoogleHealthPocTargetResult[] = [
      okResult("sleep", [
        {
          sleep: {
            interval: {
              endTime: "2026-06-02T20:29:00Z",
              endUtcOffset: "32400s",
            },
            summary: {
              minutesAsleep: "290",
              stagesSummary: [
                { type: "LIGHT", minutes: "162", count: "6" },
                { type: "DEEP", minutes: "54", count: "2" },
                { type: "REM", minutes: "74", count: "3" },
              ],
            },
          },
        },
        {
          sleep: {
            interval: {
              endTime: "2026-06-03T20:38:00Z",
              endUtcOffset: "32400s",
            },
            summary: {
              minutesAsleep: "327",
              stagesSummary: [
                { type: "DEEP", minutes: "63", count: "4" },
              ],
            },
          },
        },
      ]),
      okResult("heartRateVariability", [
        {
          dailyHeartRateVariability: {
            date: { year: 2026, month: 6, day: 3 },
            averageHeartRateVariabilityMilliseconds: 125.8,
          },
        },
        {
          dailyHeartRateVariability: {
            date: { year: 2026, month: 6, day: 4 },
            averageHeartRateVariabilityMilliseconds: 128.8,
          },
        },
      ]),
      okResult("restingHeartRate", [
        {
          dailyRestingHeartRate: {
            date: { year: 2026, month: 6, day: 2 },
            beatsPerMinute: "45",
          },
        },
        {
          dailyRestingHeartRate: {
            date: { year: 2026, month: 6, day: 4 },
            beatsPerMinute: "43",
          },
        },
      ]),
    ];

    const result = normalizeGoogleHealthDailyMetrics({
      range,
      stepsRollupDataPoints: [
        {
          civilStartTime: { date: { year: 2026, month: 6, day: 2 } },
          steps: { countSum: "12000" },
        },
        {
          civilStartTime: { date: { year: 2026, month: 6, day: 4 } },
          steps: { countSum: "8000" },
        },
      ],
      sourceResults,
    });

    expect(result).toEqual([
      {
        date: "2026-06-02",
        stepCount: 12000,
        sleepMinutes: null,
        deepSleepMinutes: null,
        hrvMs: null,
        rhrBpm: 45,
      },
      {
        date: "2026-06-03",
        stepCount: null,
        sleepMinutes: 290,
        deepSleepMinutes: 54,
        hrvMs: 125.8,
        rhrBpm: null,
      },
      {
        date: "2026-06-04",
        stepCount: 8000,
        sleepMinutes: 327,
        deepSleepMinutes: 63,
        hrvMs: 128.8,
        rhrBpm: 43,
      },
    ]);
  });

  it("steps list dataPoints は日付ごとに合算する", () => {
    const result = normalizeGoogleHealthDailyMetrics({
      range: {
        startDate: "2026-06-02",
        endDate: "2026-06-02",
        endExclusiveDate: "2026-06-03",
      },
      sourceResults: [],
      stepsRollupDataPoints: [
        {
          steps: {
            count: "100",
            interval: {
              civilStartTime: { date: { year: 2026, month: 6, day: 2 } },
            },
          },
        },
        {
          steps: {
            count: "250",
            interval: {
              startTime: "2026-06-01T15:00:00Z",
              startUtcOffset: "32400s",
            },
          },
        },
      ],
    });

    expect(result).toEqual([
      {
        date: "2026-06-02",
        stepCount: 350,
        sleepMinutes: null,
        deepSleepMinutes: null,
        hrvMs: null,
        rhrBpm: null,
      },
    ]);
  });

  it("stagesSummary がない睡眠は stages のDEEP区間から深い睡眠時間を算出する", () => {
    const result = normalizeGoogleHealthDailyMetrics({
      range: {
        startDate: "2026-06-04",
        endDate: "2026-06-04",
        endExclusiveDate: "2026-06-05",
      },
      sourceResults: [
        okResult("sleep", [
          {
            sleep: {
              interval: {
                endTime: "2026-06-03T20:38:00Z",
                endUtcOffset: "32400s",
              },
              stages: [
                {
                  type: "LIGHT",
                  startTime: "2026-06-03T15:00:00Z",
                  endTime: "2026-06-03T15:30:00Z",
                },
                {
                  type: "DEEP",
                  startTime: "2026-06-03T15:30:00Z",
                  endTime: "2026-06-03T16:00:00Z",
                },
                {
                  type: "DEEP",
                  startTime: "2026-06-03T16:00:00Z",
                  endTime: "2026-06-03T16:15:00Z",
                },
                {
                  type: "AWAKE",
                  startTime: "2026-06-03T16:15:00Z",
                  endTime: "2026-06-03T16:20:00Z",
                },
              ],
            },
          },
        ]),
      ],
    });

    expect(result[0]).toEqual({
      date: "2026-06-04",
      stepCount: null,
      sleepMinutes: 75,
      deepSleepMinutes: 45,
      hrvMs: null,
      rhrBpm: null,
    });
  });
});
