import { NextRequest, NextResponse } from "next/server";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import {
  GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES,
  fetchGoogleHealthDailyMetrics,
} from "@/lib/googleHealth/dailyMetrics";
import { resolveGoogleHealthPocRange } from "@/lib/googleHealth/poc";
import type { GoogleHealthPocTargetResult } from "@/lib/googleHealth/poc";
import { saveGoogleHealthDailyMetrics } from "@/lib/googleHealth/saveDailyMetrics";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const REQUIRED_SOURCE_KEYS = new Set(["sleep", "heartRateVariability", "restingHeartRate"]);

function getBearerToken(headers: Headers): string | null {
  const authorization = headers.get("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isRequiredSourceError(
  result: GoogleHealthPocTargetResult,
): result is Extract<GoogleHealthPocTargetResult, { ok: false }> {
  return !result.ok && REQUIRED_SOURCE_KEYS.has(result.key);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = getBearerToken(req.headers);
  if (!accessToken) {
    return NextResponse.json(
      {
        error: "Google Health API の access token が必要です。Authorization: Bearer <token> を指定してください。",
        requiredScopes: GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES,
      },
      { status: 401 },
    );
  }

  const rangeResult = resolveGoogleHealthPocRange(req.nextUrl.searchParams);
  if (!rangeResult.ok) {
    return NextResponse.json({ error: rangeResult.message }, { status: 400 });
  }

  const dailyResult = await fetchGoogleHealthDailyMetrics({
    range: rangeResult.range,
    accessToken,
  });

  if (!dailyResult.stepsResult.ok) {
    return NextResponse.json(
      {
        error: "Google Health 歩数の取得に失敗しました。",
        stepsResult: dailyResult.stepsResult,
      },
      { status: dailyResult.stepsResult.status === 403 ? 403 : 502 },
    );
  }

  const sourceErrors = dailyResult.sourceResults.filter(isRequiredSourceError);
  if (sourceErrors.length > 0) {
    return NextResponse.json(
      {
        error: "Google Health 日次メトリクスの取得に失敗しました。",
        results: sourceErrors,
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
