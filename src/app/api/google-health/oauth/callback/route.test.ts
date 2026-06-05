jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/googleHealth/connections", () => ({
  markGoogleHealthConnectionError: jest.fn(),
  saveGoogleHealthOAuthConnection: jest.fn(),
}));

import { NextRequest } from "next/server";
import {
  GOOGLE_HEALTH_OAUTH_STATE_COOKIE,
  createGoogleHealthOAuthStateCookieValue,
} from "@/lib/googleHealth/oauth";
import { GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES } from "@/lib/googleHealth/dailyMetrics";
import {
  markGoogleHealthConnectionError,
  saveGoogleHealthOAuthConnection,
} from "@/lib/googleHealth/connections";
import { getCurrentUser } from "@/lib/supabase/server";
import { GET } from "./route";

const mockGetCurrentUser = getCurrentUser as jest.Mock;
const mockSaveConnection = saveGoogleHealthOAuthConnection as jest.Mock;
const mockMarkError = markGoogleHealthConnectionError as jest.Mock;

const originalEnv = process.env;
const stateSecret = "0123456789abcdef0123456789abcdef";

function setOAuthEnv() {
  process.env = {
    ...originalEnv,
    GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "http://localhost/api/google-health/oauth/callback",
    GOOGLE_HEALTH_OAUTH_STATE_SECRET: stateSecret,
  };
}

function makeStateCookie(args?: {
  state?: string;
  userId?: string;
  expiresAt?: number;
}): string {
  const value = createGoogleHealthOAuthStateCookieValue(
    {
      state: args?.state ?? "state-value",
      codeVerifier: "code-verifier",
      userId: args?.userId ?? "user-id",
      expiresAt: args?.expiresAt ?? Math.floor(Date.now() / 1000) + 600,
    },
    stateSecret,
  );
  return `${GOOGLE_HEALTH_OAUTH_STATE_COOKIE}=${value}`;
}

function makeRequest(params: Record<string, string>, cookie?: string): NextRequest {
  const url = new URL("http://localhost/api/google-health/oauth/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("GET /api/google-health/oauth/callback", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    mockGetCurrentUser.mockReset();
    mockSaveConnection.mockReset();
    mockMarkError.mockReset();
    setOAuthEnv();
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    process.env = originalEnv;
  });

  it("authorization code を token に交換して connection を保存する", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      access_token: "google-access-token",
      refresh_token: "google-refresh-token",
      expires_in: 3600,
      scope: GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES.join(" "),
      token_type: "Bearer",
    }), { status: 200 }));
    mockSaveConnection.mockResolvedValue({
      connection: { id: "connection-id" },
      missingScopes: [],
      status: "connected",
    });

    const response = await GET(makeRequest(
      { code: "authorization-code", state: "state-value" },
      makeStateCookie(),
    ));
    const location = response.headers.get("location") ?? "";
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(location).toBe("http://localhost/settings?google_health=connected");
    expect(location).not.toContain("google-access-token");
    expect(setCookie).toContain(`${GOOGLE_HEALTH_OAUTH_STATE_COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const tokenBody = fetchSpy.mock.calls[0][1].body as URLSearchParams;
    expect(tokenBody.get("code")).toBe("authorization-code");
    expect(tokenBody.get("code_verifier")).toBe("code-verifier");
    expect(mockSaveConnection).toHaveBeenCalledWith({
      userId: "user-id",
      token: {
        accessToken: "google-access-token",
        refreshToken: "google-refresh-token",
        expiresIn: 3600,
        grantedScopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
        tokenType: "Bearer",
      },
    });
  });

  it("state が一致しない場合は token exchange しない", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });

    const response = await GET(makeRequest(
      { code: "authorization-code", state: "different-state" },
      makeStateCookie(),
    ));

    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?google_health=error&reason=google_health_oauth_state_mismatch",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockSaveConnection).not.toHaveBeenCalled();
    expect(mockMarkError).toHaveBeenCalledWith({
      userId: "user-id",
      code: "oauth_state_mismatch",
      message: undefined,
    });
  });

  it("Google OAuth が error を返した場合は sanitized reason で settings へ戻す", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });

    const response = await GET(makeRequest({
      error: "access_denied",
      error_description: "sensitive detail",
    }, makeStateCookie()));

    const location = response.headers.get("location") ?? "";
    expect(location).toBe("http://localhost/settings?google_health=error&reason=google_oauth_error");
    expect(location).not.toContain("sensitive");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockSaveConnection).not.toHaveBeenCalled();
  });

  it("保存結果が scope_missing の場合は settings へ status を渡す", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      access_token: "google-access-token",
      expires_in: 3600,
      scope: GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES[0],
      token_type: "Bearer",
    }), { status: 200 }));
    mockSaveConnection.mockResolvedValue({
      connection: { id: "connection-id" },
      missingScopes: [GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES[1]],
      status: "scope_missing",
    });

    const response = await GET(makeRequest(
      { code: "authorization-code", state: "state-value" },
      makeStateCookie(),
    ));

    expect(response.headers.get("location")).toBe("http://localhost/settings?google_health=scope_missing");
  });
});
