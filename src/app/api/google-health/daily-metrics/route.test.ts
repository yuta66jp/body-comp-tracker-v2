jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/googleHealth/dailyMetrics", () => ({
  GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES: ["scope-a", "scope-b"],
  fetchGoogleHealthDailyMetrics: jest.fn(),
}));

jest.mock("@/lib/googleHealth/saveDailyMetrics", () => ({
  saveGoogleHealthDailyMetrics: jest.fn(),
}));

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateAfterDailyLogMutation: jest.fn(),
}));

import { NextRequest } from "next/server";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import { fetchGoogleHealthDailyMetrics } from "@/lib/googleHealth/dailyMetrics";
import { saveGoogleHealthDailyMetrics } from "@/lib/googleHealth/saveDailyMetrics";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { POST } from "./route";

const mockCreateClient = createClient as jest.Mock;
const mockGetCurrentUser = getCurrentUser as jest.Mock;
const mockFetchGoogleHealthDailyMetrics = fetchGoogleHealthDailyMetrics as jest.Mock;
const mockSaveGoogleHealthDailyMetrics = saveGoogleHealthDailyMetrics as jest.Mock;
const mockRevalidate = revalidateAfterDailyLogMutation as jest.Mock;

function makeRequest(args?: {
  start?: string;
  end?: string;
  authorization?: string;
}): NextRequest {
  const url = new URL("http://localhost/api/google-health/daily-metrics");
  if (args?.start) url.searchParams.set("start", args.start);
  if (args?.end) url.searchParams.set("end", args.end);

  return new NextRequest(url.toString(), {
    method: "POST",
    headers: args?.authorization ? { Authorization: args.authorization } : undefined,
  });
}

describe("POST /api/google-health/daily-metrics", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    mockGetCurrentUser.mockReset();
    mockFetchGoogleHealthDailyMetrics.mockReset();
    mockSaveGoogleHealthDailyMetrics.mockReset();
    mockRevalidate.mockReset();
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(makeRequest({ authorization: "Bearer google-token" }));

    expect(response.status).toBe(401);
    expect(mockFetchGoogleHealthDailyMetrics).not.toHaveBeenCalled();
    expect(mockSaveGoogleHealthDailyMetrics).not.toHaveBeenCalled();
  });

  it("Google Health access token がない場合は 401 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.requiredScopes).toEqual(["scope-a", "scope-b"]);
    expect(mockFetchGoogleHealthDailyMetrics).not.toHaveBeenCalled();
  });

  it("Google Health 日次メトリクスを取得して保存する", async () => {
    const supabase = { from: jest.fn() };
    const dailyMetrics = [
      {
        date: "2026-06-02",
        stepCount: 4211,
        sleepMinutes: null,
        deepSleepMinutes: null,
        sleepBedAt: null,
        sleepWakeAt: null,
        hrvMs: null,
        rhrBpm: 45,
      },
    ];

    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockCreateClient.mockResolvedValue(supabase);
    mockFetchGoogleHealthDailyMetrics.mockResolvedValue({
      sourceResults: [
        { ok: true, key: "sleep", dataPoints: [] },
        { ok: true, key: "heartRateVariability", dataPoints: [] },
        { ok: true, key: "restingHeartRate", dataPoints: [] },
      ],
      stepsResult: { ok: true, source: "reconcile" },
      dailyMetrics,
    });
    mockSaveGoogleHealthDailyMetrics.mockResolvedValue({
      ok: true,
      savedCount: 1,
      skippedCount: 0,
      savedDates: ["2026-06-02"],
      skippedDates: [],
    });

    const response = await POST(makeRequest({
      start: "2026-06-02",
      end: "2026-06-02",
      authorization: "Bearer google-token",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFetchGoogleHealthDailyMetrics).toHaveBeenCalledWith({
      range: {
        startDate: "2026-06-02",
        endDate: "2026-06-02",
        endExclusiveDate: "2026-06-03",
      },
      accessToken: "google-token",
    });
    expect(mockSaveGoogleHealthDailyMetrics).toHaveBeenCalledWith(supabase, {
      userId: "user-id",
      metrics: dailyMetrics,
      stepsSource: "reconcile",
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
    expect(body).toEqual({
      ok: true,
      range: {
        startDate: "2026-06-02",
        endDate: "2026-06-02",
        endExclusiveDate: "2026-06-03",
      },
      stepsSource: "reconcile",
      savedCount: 1,
      skippedCount: 0,
      savedDates: ["2026-06-02"],
      skippedDates: [],
    });
  });

  it("歩数取得が失敗した場合は保存しない", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockFetchGoogleHealthDailyMetrics.mockResolvedValue({
      sourceResults: [],
      stepsResult: {
        ok: false,
        dataType: "steps",
        source: "reconcile",
        status: 403,
        message: "Required OAuth scope(s) are missing for this operation.",
      },
      dailyMetrics: [],
    });

    const response = await POST(makeRequest({
      start: "2026-06-02",
      end: "2026-06-02",
      authorization: "Bearer google-token",
    }));

    expect(response.status).toBe(403);
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockSaveGoogleHealthDailyMetrics).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
