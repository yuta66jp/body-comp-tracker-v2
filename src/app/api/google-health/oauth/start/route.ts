import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_HEALTH_OAUTH_STATE_COOKIE,
  GOOGLE_HEALTH_OAUTH_STATE_TTL_SECONDS,
  buildGoogleHealthOAuthAuthorizationUrl,
  createGoogleHealthOAuthStateCookieValue,
  generateGoogleHealthOAuthState,
  generateGoogleHealthPkcePair,
  getGoogleHealthOAuthConfig,
  parseGoogleHealthOAuthPrompt,
} from "@/lib/googleHealth/oauth";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function setStateCookie(response: NextResponse, value: string): NextResponse {
  response.cookies.set(GOOGLE_HEALTH_OAUTH_STATE_COOKIE, value, {
    httpOnly: true,
    maxAge: GOOGLE_HEALTH_OAUTH_STATE_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let prompt: "consent" | null;
  try {
    prompt = parseGoogleHealthOAuthPrompt(request.nextUrl.searchParams.get("prompt"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_health_oauth_prompt_invalid";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let config;
  try {
    config = getGoogleHealthOAuthConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_health_oauth_config_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const state = generateGoogleHealthOAuthState();
  const { codeVerifier, codeChallenge } = generateGoogleHealthPkcePair();
  const expiresAt = Math.floor(Date.now() / 1000) + GOOGLE_HEALTH_OAUTH_STATE_TTL_SECONDS;
  const cookieValue = createGoogleHealthOAuthStateCookieValue(
    {
      state,
      codeVerifier,
      userId: user.id,
      expiresAt,
    },
    config.stateSecret,
  );

  const authorizationUrl = buildGoogleHealthOAuthAuthorizationUrl({
    config,
    state,
    codeChallenge,
    prompt,
  });

  return setStateCookie(NextResponse.redirect(authorizationUrl), cookieValue);
}
