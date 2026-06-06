import { NextRequest, NextResponse } from "next/server";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import {
  fetchGoogleHealthDailyMetrics,
  type GoogleHealthDailyMetric,
  type GoogleHealthStepsAttempt,
  type GoogleHealthStepsResult,
} from "@/lib/googleHealth/dailyMetrics";
import {
  markGoogleHealthConnectionError,
  markGoogleHealthConnectionSynced,
  resolveGoogleHealthStoredAccessToken,
} from "@/lib/googleHealth/connections";
import { resolveGoogleHealthPocRange } from "@/lib/googleHealth/poc";
import type { GoogleHealthPocTargetResult } from "@/lib/googleHealth/poc";
import { saveGoogleHealthDailyMetrics } from "@/lib/googleHealth/saveDailyMetrics";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const REQUIRED_SOURCE_KEYS = new Set(["sleep", "heartRateVariability", "restingHeartRate"]);

type GoogleHealthSyncLogPayload = Record<string, unknown>;

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      return new URL(origin).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      return new URL(referer).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  return false;
}

function isRequiredSourceError(
  result: GoogleHealthPocTargetResult,
): result is Extract<GoogleHealthPocTargetResult, { ok: false }> {
  return !result.ok && REQUIRED_SOURCE_KEYS.has(result.key);
}

function sanitizeSourceError(result: Extract<GoogleHealthPocTargetResult, { ok: false }>) {
  return {
    key: result.key,
    status: result.status,
    message: result.message,
  };
}

function sanitizeStepsAttempts(attempts: GoogleHealthStepsAttempt[]) {
  return attempts.map((attempt) => ({
    source: attempt.source,
    ok: attempt.ok,
    status: attempt.status,
    ...(attempt.message ? { message: attempt.message } : {}),
  }));
}

function buildStepsApiErrorCode(result: Extract<GoogleHealthStepsResult, { ok: false }>): string {
  return result.status === 403
    ? "google_health_steps_api_forbidden"
    : "google_health_steps_api_error";
}

function buildRequiredSourceApiErrorCode(results: Extract<GoogleHealthPocTargetResult, { ok: false }>[]): string {
  return results.some((result) => result.status === 403)
    ? "google_health_required_sources_api_forbidden"
    : "google_health_required_sources_api_error";
}

function apiErrorHttpStatus(status: number): number {
  return status === 403 ? 403 : 502;
}

function countEmptyMetrics(metrics: GoogleHealthDailyMetric[]): number {
  return metrics.filter((metric) =>
    metric.stepCount === null &&
    metric.sleepMinutes === null &&
    metric.deepSleepMinutes === null &&
    metric.sleepBedAt === null &&
    metric.sleepWakeAt === null &&
    metric.hrvMs === null &&
    metric.rhrBpm === null
  ).length;
}

function logGoogleHealthSync(
  level: "info" | "warn" | "error",
  event: string,
  payload: GoogleHealthSyncLogPayload,
): void {
  console[level]("[google-health-sync]", { event, ...payload });
}

async function markConnectionErrorSafely(args: {
  userId: string;
  code: string;
  message?: string | null;
}): Promise<void> {
  try {
    await markGoogleHealthConnectionError(args);
  } catch {
    logGoogleHealthSync("error", "connection_error_update_failed", { code: args.code });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rangeResult = resolveGoogleHealthPocRange(req.nextUrl.searchParams);
  if (!rangeResult.ok) {
    return NextResponse.json({ error: rangeResult.message }, { status: 400 });
  }

  let tokenResult;
  try {
    tokenResult = await resolveGoogleHealthStoredAccessToken(user.id);
  } catch {
    return NextResponse.json(
      {
        error: "Google Health connection lookup failed.",
        status: "error",
      },
      { status: 500 },
    );
  }

  if (!tokenResult.ok) {
    return NextResponse.json(
      {
        error: tokenResult.message,
        status: tokenResult.status,
        requiredScopes: tokenResult.requiredScopes,
        missingScopes: tokenResult.missingScopes,
      },
      { status: tokenResult.statusCode },
    );
  }

  const dailyResult = await fetchGoogleHealthDailyMetrics({
    range: rangeResult.range,
    accessToken: tokenResult.accessToken,
  });

  if (!dailyResult.stepsResult.ok) {
    const code = buildStepsApiErrorCode(dailyResult.stepsResult);
    const stepsAttempts = sanitizeStepsAttempts(dailyResult.stepsResult.attempts);

    await markConnectionErrorSafely({
      userId: user.id,
      code,
      message: dailyResult.stepsResult.message,
    });
    logGoogleHealthSync("warn", "steps_fetch_failed", {
      code,
      range: rangeResult.range,
      stepsAttempts,
    });

    return NextResponse.json(
      {
        error: "Google Health 歩数の取得に失敗しました。",
        status: "google_health_api_error",
        code,
        stepsResult: {
          dataType: dailyResult.stepsResult.dataType,
          source: dailyResult.stepsResult.source,
          status: dailyResult.stepsResult.status,
          message: dailyResult.stepsResult.message,
          attempts: stepsAttempts,
        },
      },
      { status: apiErrorHttpStatus(dailyResult.stepsResult.status) },
    );
  }

  const stepsAttempts = sanitizeStepsAttempts(dailyResult.stepsResult.attempts);
  const stepsFallbackUsed = dailyResult.stepsResult.source !== "reconcile";
  if (stepsFallbackUsed) {
    logGoogleHealthSync("info", "steps_fallback_used", {
      range: rangeResult.range,
      stepsSource: dailyResult.stepsResult.source,
      stepsAttempts,
    });
  }

  const sourceErrors = dailyResult.sourceResults.filter(isRequiredSourceError);
  if (sourceErrors.length > 0) {
    const code = buildRequiredSourceApiErrorCode(sourceErrors);
    const sanitizedSourceErrors = sourceErrors.map(sanitizeSourceError);

    await markConnectionErrorSafely({
      userId: user.id,
      code,
      message: sanitizedSourceErrors
        .map((result) => `${result.key}:${result.status}`)
        .join(", "),
    });
    logGoogleHealthSync("warn", "required_sources_fetch_failed", {
      code,
      range: rangeResult.range,
      results: sanitizedSourceErrors.map((result) => ({
        key: result.key,
        status: result.status,
      })),
    });

    return NextResponse.json(
      {
        error: "Google Health 日次メトリクスの取得に失敗しました。",
        status: "google_health_api_error",
        code,
        results: sanitizedSourceErrors,
      },
      { status: sourceErrors.some((result) => result.status === 403) ? 403 : 502 },
    );
  }

  const supabase = await createClient();
  const saveResult = await saveGoogleHealthDailyMetrics(supabase, {
    userId: user.id,
    metrics: dailyResult.dailyMetrics,
    stepsSource: dailyResult.stepsResult.source,
  });

  if (!saveResult.ok) {
    const code = "google_health_daily_metrics_save_failed";

    await markConnectionErrorSafely({
      userId: user.id,
      code,
      message: saveResult.message,
    });
    logGoogleHealthSync("error", "daily_metrics_save_failed", {
      code,
      range: rangeResult.range,
    });

    return NextResponse.json({
      error: saveResult.message,
      status: "error",
      code,
    }, { status: 500 });
  }

  try {
    await markGoogleHealthConnectionSynced({ userId: user.id });
  } catch {
    const code = "google_health_sync_timestamp_update_failed";

    await markConnectionErrorSafely({
      userId: user.id,
      code,
      message: "Google Health sync timestamp update failed.",
    });
    logGoogleHealthSync("error", "sync_timestamp_update_failed", {
      code,
      range: rangeResult.range,
    });

    return NextResponse.json(
      {
        error: "Google Health sync timestamp update failed.",
        status: "error",
        code,
      },
      { status: 500 },
    );
  }

  if (saveResult.savedCount > 0) {
    revalidateAfterDailyLogMutation();
  }

  return NextResponse.json({
    ok: true,
    range: rangeResult.range,
    stepsSource: dailyResult.stepsResult.source,
    stepsFallbackUsed,
    stepsAttempts,
    emptyMetricCount: countEmptyMetrics(dailyResult.dailyMetrics),
    savedCount: saveResult.savedCount,
    skippedCount: saveResult.skippedCount,
    savedDates: saveResult.savedDates,
    skippedDates: saveResult.skippedDates,
  });
}
