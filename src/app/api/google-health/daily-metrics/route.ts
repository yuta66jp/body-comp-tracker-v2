import { NextRequest, NextResponse } from "next/server";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import { fetchGoogleHealthDailyMetrics } from "@/lib/googleHealth/dailyMetrics";
import {
  markGoogleHealthConnectionSynced,
  resolveGoogleHealthStoredAccessToken,
} from "@/lib/googleHealth/connections";
import { resolveGoogleHealthPocRange } from "@/lib/googleHealth/poc";
import type { GoogleHealthPocTargetResult } from "@/lib/googleHealth/poc";
import { saveGoogleHealthDailyMetrics } from "@/lib/googleHealth/saveDailyMetrics";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const REQUIRED_SOURCE_KEYS = new Set(["sleep", "heartRateVariability", "restingHeartRate"]);

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
    return NextResponse.json(
      {
        error: "Google Health 歩数の取得に失敗しました。",
        status: "google_health_api_error",
        stepsResult: {
          dataType: dailyResult.stepsResult.dataType,
          source: dailyResult.stepsResult.source,
          status: dailyResult.stepsResult.status,
          message: dailyResult.stepsResult.message,
        },
      },
      { status: dailyResult.stepsResult.status === 403 ? 403 : 502 },
    );
  }

  const sourceErrors = dailyResult.sourceResults.filter(isRequiredSourceError);
  if (sourceErrors.length > 0) {
    return NextResponse.json(
      {
        error: "Google Health 日次メトリクスの取得に失敗しました。",
        status: "google_health_api_error",
        results: sourceErrors.map(sanitizeSourceError),
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
    return NextResponse.json({ error: saveResult.message }, { status: 500 });
  }

  try {
    await markGoogleHealthConnectionSynced({ userId: user.id });
  } catch {
    return NextResponse.json(
      {
        error: "Google Health sync timestamp update failed.",
        status: "error",
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
    savedCount: saveResult.savedCount,
    skippedCount: saveResult.skippedCount,
    savedDates: saveResult.savedDates,
    skippedDates: saveResult.skippedDates,
  });
}
