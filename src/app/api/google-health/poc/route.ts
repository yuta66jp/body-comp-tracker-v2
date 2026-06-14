import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES,
  fetchGoogleHealthDailyMetrics,
} from "@/lib/googleHealth/dailyMetrics";
import {
  getGoogleHealthAccessToken,
  resolveGoogleHealthPocRange,
} from "@/lib/googleHealth/poc";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.GOOGLE_HEALTH_POC_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Google Health API PoC は無効です。GOOGLE_HEALTH_POC_ENABLED=true を設定してください。" },
      { status: 403 },
    );
  }

  const rangeResult = resolveGoogleHealthPocRange(req.nextUrl.searchParams);
  if (!rangeResult.ok) {
    return NextResponse.json({ error: rangeResult.message }, { status: 400 });
  }

  const accessToken = getGoogleHealthAccessToken(req.headers);
  if (!accessToken) {
    return NextResponse.json(
      {
        error: "Google Health API の access token が必要です。Authorization: Bearer <token> を指定してください。",
        requiredScopes: GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES,
      },
      { status: 401 },
    );
  }

  const dailyResult = await fetchGoogleHealthDailyMetrics({
    range: rangeResult.range,
    accessToken,
  });

  return NextResponse.json({
    range: rangeResult.range,
    requiredScopes: GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES,
    results: dailyResult.sourceResults,
    stepsResult: dailyResult.stepsResult,
    weightResult: dailyResult.weightResult,
    weightMetrics: dailyResult.weightMetrics,
    dailyMetrics: dailyResult.dailyMetrics,
  });
}
