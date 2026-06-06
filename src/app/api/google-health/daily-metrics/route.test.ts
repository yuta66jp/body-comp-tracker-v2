jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/googleHealth/dailyMetrics", () => ({
  GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES: ["scope-a", "scope-b"],
  fetchGoogleHealthDailyMetrics: jest.fn(),
}));

jest.mock("@/lib/googleHealth/connections", () => ({
  markGoogleHealthConnectionError: jest.fn(),
  markGoogleHealthConnectionSynced: jest.fn(),
  resolveGoogleHealthStoredAccessToken: jest.fn(),
}));

jest.mock("@/lib/googleHealth/saveDailyMetrics", () => ({
  saveGoogleHealthDailyMetrics: jest.fn(),
}));

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateAfterDailyLogMutation: jest.fn(),
}));

import { NextRequest } from "next/server";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import {
  markGoogleHealthConnectionError,
  markGoogleHealthConnectionSynced,
  resolveGoogleHealthStoredAccessToken,
} from "@/lib/googleHealth/connections";
import { fetchGoogleHealthDailyMetrics } from "@/lib/googleHealth/dailyMetrics";
import { saveGoogleHealthDailyMetrics } from "@/lib/googleHealth/saveDailyMetrics";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { POST } from "./route";

const mockCreateClient = createClient as jest.Mock;
const mockGetCurrentUser = getCurrentUser as jest.Mock;
const mockResolveStoredAccessToken = resolveGoogleHealthStoredAccessToken as jest.Mock;
const mockMarkConnectionError = markGoogleHealthConnectionError as jest.Mock;
const mockMarkConnectionSynced = markGoogleHealthConnectionSynced as jest.Mock;
const mockFetchGoogleHealthDailyMetrics = fetchGoogleHealthDailyMetrics as jest.Mock;
const mockSaveGoogleHealthDailyMetrics = saveGoogleHealthDailyMetrics as jest.Mock;
const mockRevalidate = revalidateAfterDailyLogMutation as jest.Mock;

function makeRequest(args?: {
  start?: string;
  end?: string;
  authorization?: string;
  origin?: string | null;
}): NextRequest {
  const url = new URL("http://localhost/api/google-health/daily-metrics");
  if (args?.start) url.searchParams.set("start", args.start);
  if (args?.end) url.searchParams.set("end", args.end);

  const headers = new Headers();
  if (args?.authorization) headers.set("Authorization", args.authorization);
  if (args?.origin !== null) headers.set("Origin", args?.origin ?? "http://localhost");

  return new NextRequest(url.toString(), {
    method: "POST",
    headers,
  });
}

describe("POST /api/google-health/daily-metrics", () => {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockCreateClient.mockReset();
    mockGetCurrentUser.mockReset();
    mockResolveStoredAccessToken.mockReset();
    mockMarkConnectionError.mockReset();
    mockMarkConnectionSynced.mockReset();
    mockFetchGoogleHealthDailyMetrics.mockReset();
    mockSaveGoogleHealthDailyMetrics.mockReset();
    mockRevalidate.mockReset();
    consoleInfoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockResolveStoredAccessToken).not.toHaveBeenCalled();
    expect(mockFetchGoogleHealthDailyMetrics).not.toHaveBeenCalled();
    expect(mockSaveGoogleHealthDailyMetrics).not.toHaveBeenCalled();
  });

  it("same-origin ではない POST は 403 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });

    const response = await POST(makeRequest({ origin: null }));

    expect(response.status).toBe(403);
    expect(mockResolveStoredAccessToken).not.toHaveBeenCalled();
    expect(mockFetchGoogleHealthDailyMetrics).not.toHaveBeenCalled();
  });

  it("Google Health 未連携の場合は 409 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockResolveStoredAccessToken.mockResolvedValue({
      ok: false,
      status: "not_connected",
      statusCode: 409,
      message: "Google Health is not connected.",
      requiredScopes: ["scope-a", "scope-b"],
    });

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.status).toBe("not_connected");
    expect(body.requiredScopes).toEqual(["scope-a", "scope-b"]);
    expect(mockResolveStoredAccessToken).toHaveBeenCalledWith("user-id");
    expect(mockFetchGoogleHealthDailyMetrics).not.toHaveBeenCalled();
  });

  it("保存済み token 取得で例外が出た場合は sanitized 500 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockResolveStoredAccessToken.mockRejectedValue(new Error("supabase_service_role_env_missing"));

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Google Health connection lookup failed.",
      status: "error",
    });
    expect(JSON.stringify(body)).not.toContain("supabase_service_role_env_missing");
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
    mockResolveStoredAccessToken.mockResolvedValue({
      ok: true,
      accessToken: "stored-google-token",
      refreshed: false,
      status: "connected",
    });
    mockCreateClient.mockResolvedValue(supabase);
    mockFetchGoogleHealthDailyMetrics.mockResolvedValue({
      sourceResults: [
        { ok: true, key: "sleep", dataPoints: [] },
        { ok: true, key: "heartRateVariability", dataPoints: [] },
        { ok: true, key: "restingHeartRate", dataPoints: [] },
      ],
      stepsResult: {
        ok: true,
        source: "reconcile",
        attempts: [{ source: "reconcile", ok: true, status: 200 }],
      },
      dailyMetrics,
    });
    mockSaveGoogleHealthDailyMetrics.mockResolvedValue({
      ok: true,
      savedCount: 1,
      skippedCount: 0,
      savedDates: ["2026-06-02"],
      skippedDates: [],
    });
    mockMarkConnectionSynced.mockResolvedValue(undefined);

    const response = await POST(makeRequest({
      start: "2026-06-02",
      end: "2026-06-02",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFetchGoogleHealthDailyMetrics).toHaveBeenCalledWith({
      range: {
        startDate: "2026-06-02",
        endDate: "2026-06-02",
        endExclusiveDate: "2026-06-03",
      },
      accessToken: "stored-google-token",
    });
    expect(mockSaveGoogleHealthDailyMetrics).toHaveBeenCalledWith(supabase, {
      userId: "user-id",
      metrics: dailyMetrics,
      stepsSource: "reconcile",
    });
    expect(mockMarkConnectionSynced).toHaveBeenCalledWith({ userId: "user-id" });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
    expect(body).toEqual({
      ok: true,
      range: {
        startDate: "2026-06-02",
        endDate: "2026-06-02",
        endExclusiveDate: "2026-06-03",
      },
      stepsSource: "reconcile",
      stepsFallbackUsed: false,
      stepsAttempts: [{ source: "reconcile", ok: true, status: 200 }],
      emptyMetricCount: 0,
      savedCount: 1,
      skippedCount: 0,
      savedDates: ["2026-06-02"],
      skippedDates: [],
    });
  });

  it("歩数取得がfallbackされた場合は採用sourceと試行履歴を返す", async () => {
    const supabase = { from: jest.fn() };
    const dailyMetrics = [
      {
        date: "2026-06-02",
        stepCount: null,
        sleepMinutes: null,
        deepSleepMinutes: null,
        sleepBedAt: null,
        sleepWakeAt: null,
        hrvMs: null,
        rhrBpm: null,
      },
    ];
    const stepsAttempts = [
      {
        source: "reconcile",
        ok: false,
        status: 500,
        message: "reconcile is temporarily unavailable",
      },
      {
        source: "dailyRollUp",
        ok: true,
        status: 200,
      },
    ];

    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockResolveStoredAccessToken.mockResolvedValue({
      ok: true,
      accessToken: "stored-google-token",
      refreshed: false,
      status: "connected",
    });
    mockCreateClient.mockResolvedValue(supabase);
    mockFetchGoogleHealthDailyMetrics.mockResolvedValue({
      sourceResults: [
        { ok: true, key: "sleep", dataPoints: [] },
        { ok: true, key: "heartRateVariability", dataPoints: [] },
        { ok: true, key: "restingHeartRate", dataPoints: [] },
      ],
      stepsResult: {
        ok: true,
        source: "dailyRollUp",
        attempts: stepsAttempts,
      },
      dailyMetrics,
    });
    mockSaveGoogleHealthDailyMetrics.mockResolvedValue({
      ok: true,
      savedCount: 1,
      skippedCount: 0,
      savedDates: ["2026-06-02"],
      skippedDates: [],
    });
    mockMarkConnectionSynced.mockResolvedValue(undefined);

    const response = await POST(makeRequest({
      start: "2026-06-02",
      end: "2026-06-02",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(consoleInfoSpy).toHaveBeenCalledWith("[google-health-sync]", expect.objectContaining({
      event: "steps_fallback_used",
      stepsSource: "dailyRollUp",
      stepsAttempts,
    }));
    expect(body).toEqual(expect.objectContaining({
      ok: true,
      stepsSource: "dailyRollUp",
      stepsFallbackUsed: true,
      stepsAttempts,
      emptyMetricCount: 1,
    }));
  });

  it("歩数取得が失敗した場合は保存しない", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockResolveStoredAccessToken.mockResolvedValue({
      ok: true,
      accessToken: "stored-google-token",
      refreshed: false,
      status: "connected",
    });
    mockFetchGoogleHealthDailyMetrics.mockResolvedValue({
      sourceResults: [],
      stepsResult: {
        ok: false,
        dataType: "steps",
        source: "reconcile",
        status: 403,
        message: "Required OAuth scope(s) are missing for this operation.",
        attempts: [
          {
            source: "reconcile",
            ok: false,
            status: 403,
            message: "Required OAuth scope(s) are missing for this operation.",
          },
        ],
      },
      dailyMetrics: [],
    });

    const response = await POST(makeRequest({
      start: "2026-06-02",
      end: "2026-06-02",
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(mockMarkConnectionError).toHaveBeenCalledWith({
      userId: "user-id",
      code: "google_health_steps_api_forbidden",
      message: "Required OAuth scope(s) are missing for this operation.",
    });
    expect(body.code).toBe("google_health_steps_api_forbidden");
    expect(body.stepsResult).toEqual({
      dataType: "steps",
      source: "reconcile",
      status: 403,
      message: "Required OAuth scope(s) are missing for this operation.",
      attempts: [
        {
          source: "reconcile",
          ok: false,
          status: 403,
          message: "Required OAuth scope(s) are missing for this operation.",
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("details");
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockSaveGoogleHealthDailyMetrics).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("必須sourceの取得に失敗した場合はconnection errorを更新して保存しない", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockResolveStoredAccessToken.mockResolvedValue({
      ok: true,
      accessToken: "stored-google-token",
      refreshed: false,
      status: "connected",
    });
    mockFetchGoogleHealthDailyMetrics.mockResolvedValue({
      sourceResults: [
        {
          ok: false,
          key: "sleep",
          status: 403,
          message: "Required OAuth scope(s) are missing for this operation.",
        },
      ],
      stepsResult: {
        ok: true,
        source: "reconcile",
        attempts: [{ source: "reconcile", ok: true, status: 200 }],
      },
      dailyMetrics: [],
    });

    const response = await POST(makeRequest({
      start: "2026-06-02",
      end: "2026-06-02",
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(mockMarkConnectionError).toHaveBeenCalledWith({
      userId: "user-id",
      code: "google_health_required_sources_api_forbidden",
      message: "sleep:403",
    });
    expect(body).toEqual({
      error: "Google Health 日次メトリクスの取得に失敗しました。",
      status: "google_health_api_error",
      code: "google_health_required_sources_api_forbidden",
      results: [
        {
          key: "sleep",
          status: 403,
          message: "Required OAuth scope(s) are missing for this operation.",
        },
      ],
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockSaveGoogleHealthDailyMetrics).not.toHaveBeenCalled();
  });

  it("保存に失敗した場合はconnection errorを更新してsanitized 500を返す", async () => {
    const supabase = { from: jest.fn() };

    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockResolveStoredAccessToken.mockResolvedValue({
      ok: true,
      accessToken: "stored-google-token",
      refreshed: false,
      status: "connected",
    });
    mockCreateClient.mockResolvedValue(supabase);
    mockFetchGoogleHealthDailyMetrics.mockResolvedValue({
      sourceResults: [
        { ok: true, key: "sleep", dataPoints: [] },
        { ok: true, key: "heartRateVariability", dataPoints: [] },
        { ok: true, key: "restingHeartRate", dataPoints: [] },
      ],
      stepsResult: {
        ok: true,
        source: "reconcile",
        attempts: [{ source: "reconcile", ok: true, status: 200 }],
      },
      dailyMetrics: [],
    });
    mockSaveGoogleHealthDailyMetrics.mockResolvedValue({
      ok: false,
      message: "Google Health 日次メトリクスの保存に失敗しました: duplicate key",
    });

    const response = await POST(makeRequest({
      start: "2026-06-02",
      end: "2026-06-02",
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockMarkConnectionError).toHaveBeenCalledWith({
      userId: "user-id",
      code: "google_health_daily_metrics_save_failed",
      message: "Google Health 日次メトリクスの保存に失敗しました: duplicate key",
    });
    expect(body).toEqual({
      error: "Google Health 日次メトリクスの保存に失敗しました: duplicate key",
      status: "error",
      code: "google_health_daily_metrics_save_failed",
    });
    expect(mockMarkConnectionSynced).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("last_sync_at の更新に失敗した場合は sanitized 500 を返す", async () => {
    const supabase = { from: jest.fn() };

    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockResolveStoredAccessToken.mockResolvedValue({
      ok: true,
      accessToken: "stored-google-token",
      refreshed: false,
      status: "connected",
    });
    mockCreateClient.mockResolvedValue(supabase);
    mockFetchGoogleHealthDailyMetrics.mockResolvedValue({
      sourceResults: [
        { ok: true, key: "sleep", dataPoints: [] },
        { ok: true, key: "heartRateVariability", dataPoints: [] },
        { ok: true, key: "restingHeartRate", dataPoints: [] },
      ],
      stepsResult: {
        ok: true,
        source: "reconcile",
        attempts: [{ source: "reconcile", ok: true, status: 200 }],
      },
      dailyMetrics: [],
    });
    mockSaveGoogleHealthDailyMetrics.mockResolvedValue({
      ok: true,
      savedCount: 0,
      skippedCount: 0,
      savedDates: [],
      skippedDates: [],
    });
    mockMarkConnectionSynced.mockRejectedValue(new Error("supabase_service_role_env_missing"));

    const response = await POST(makeRequest({
      start: "2026-06-02",
      end: "2026-06-02",
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockMarkConnectionError).toHaveBeenCalledWith({
      userId: "user-id",
      code: "google_health_sync_timestamp_update_failed",
      message: "Google Health sync timestamp update failed.",
    });
    expect(body).toEqual({
      error: "Google Health sync timestamp update failed.",
      status: "error",
      code: "google_health_sync_timestamp_update_failed",
    });
    expect(JSON.stringify(body)).not.toContain("supabase_service_role_env_missing");
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
