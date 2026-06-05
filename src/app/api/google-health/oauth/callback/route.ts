import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_HEALTH_OAUTH_STATE_COOKIE,
  exchangeGoogleHealthOAuthCode,
  getGoogleHealthOAuthConfig,
  parseGoogleHealthOAuthStateCookieValue,
} from "@/lib/googleHealth/oauth";
import {
  markGoogleHealthConnectionError,
  saveGoogleHealthOAuthConnection,
} from "@/lib/googleHealth/connections";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SAFE_CALLBACK_FAILURE_REASONS = new Set([
  "google_health_oauth_token_exchange_failed",
  "google_health_oauth_token_response_invalid",
  "supabase_service_role_env_missing",
  "google_health_token_encryption_key_missing",
  "google_health_token_encryption_key_invalid",
  "google_health_connection_fetch_failed",
  "google_health_connection_upsert_failed",
]);

function settingsRedirect(request: NextRequest, status: string, reason?: string): NextResponse {
  const url = new URL("/settings", request.nextUrl.origin);
  url.searchParams.set("google_health", status);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  return NextResponse.redirect(url);
}

function clearStateCookie(response: NextResponse): NextResponse {
  response.cookies.set(GOOGLE_HEALTH_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

async function tryMarkConnectionError(userId: string, code: string, message?: string | null) {
  try {
    await markGoogleHealthConnectionError({ userId, code, message });
  } catch {
    // OAuth callback must never expose service-role or token storage details to the browser.
  }
}

function getSafeCallbackFailureReason(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return SAFE_CALLBACK_FAILURE_REASONS.has(error.message) ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return clearStateCookie(settingsRedirect(request, "error", "auth_required"));
  }

  let config;
  try {
    config = getGoogleHealthOAuthConfig();
  } catch (error) {
    await tryMarkConnectionError(user.id, "config_error");
    const reason = error instanceof Error ? error.message : "google_health_oauth_config_error";
    return clearStateCookie(settingsRedirect(request, "error", reason));
  }

  const googleError = request.nextUrl.searchParams.get("error");
  if (googleError) {
    await tryMarkConnectionError(user.id, "google_oauth_error");
    return clearStateCookie(settingsRedirect(request, "error", "google_oauth_error"));
  }

  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const cookieValue = request.cookies.get(GOOGLE_HEALTH_OAUTH_STATE_COOKIE)?.value;

  if (!code || !returnedState || !cookieValue) {
    await tryMarkConnectionError(user.id, "oauth_callback_invalid");
    return clearStateCookie(settingsRedirect(request, "error", "oauth_callback_invalid"));
  }

  let statePayload;
  try {
    statePayload = parseGoogleHealthOAuthStateCookieValue(cookieValue, config.stateSecret);
  } catch (error) {
    await tryMarkConnectionError(user.id, "oauth_state_invalid");
    const reason = error instanceof Error ? error.message : "google_health_oauth_state_invalid";
    return clearStateCookie(settingsRedirect(request, "error", reason));
  }

  if (statePayload.expiresAt <= Math.floor(Date.now() / 1000)) {
    await tryMarkConnectionError(user.id, "oauth_state_expired");
    return clearStateCookie(settingsRedirect(request, "error", "google_health_oauth_state_expired"));
  }

  if (statePayload.state !== returnedState) {
    await tryMarkConnectionError(user.id, "oauth_state_mismatch");
    return clearStateCookie(settingsRedirect(request, "error", "google_health_oauth_state_mismatch"));
  }

  if (statePayload.userId !== user.id) {
    await tryMarkConnectionError(user.id, "oauth_state_user_mismatch");
    return clearStateCookie(settingsRedirect(request, "error", "google_health_oauth_state_user_mismatch"));
  }

  let token;
  try {
    token = await exchangeGoogleHealthOAuthCode({
      config,
      code,
      codeVerifier: statePayload.codeVerifier,
    });
  } catch (error) {
    const reason = getSafeCallbackFailureReason(error, "google_health_oauth_token_exchange_failed");
    await tryMarkConnectionError(
      user.id,
      "oauth_token_exchange_failed",
      error instanceof Error ? error.message : null,
    );
    return clearStateCookie(settingsRedirect(request, "error", reason));
  }

  try {
    const result = await saveGoogleHealthOAuthConnection({ userId: user.id, token });
    return clearStateCookie(settingsRedirect(request, result.status));
  } catch (error) {
    const reason = getSafeCallbackFailureReason(error, "google_health_connection_save_failed");
    await tryMarkConnectionError(
      user.id,
      "oauth_connection_save_failed",
      error instanceof Error ? error.message : null,
    );
    return clearStateCookie(settingsRedirect(request, "error", reason));
  }
}
