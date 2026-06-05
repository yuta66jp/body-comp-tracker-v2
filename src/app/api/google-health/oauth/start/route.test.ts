jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GOOGLE_HEALTH_OAUTH_STATE_COOKIE } from "@/lib/googleHealth/oauth";
import { getCurrentUser } from "@/lib/supabase/server";
import { GET } from "./route";

const mockGetCurrentUser = getCurrentUser as jest.Mock;

const originalEnv = process.env;

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/google-health/oauth/start");
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString());
}

function setOAuthEnv() {
  process.env = {
    ...originalEnv,
    GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "http://localhost/api/google-health/oauth/callback",
    GOOGLE_HEALTH_OAUTH_STATE_SECRET: "0123456789abcdef0123456789abcdef",
  };
}

describe("GET /api/google-health/oauth/start", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset();
    setOAuthEnv();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
  });

  it("Google OAuth 認可 URL へ redirect し、httpOnly state cookie を設定する", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });

    const response = await GET(makeRequest({ prompt: "consent" }));
    const location = response.headers.get("location");
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost/api/google-health/oauth/callback");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBe("consent");

    expect(cookie).toContain(`${GOOGLE_HEALTH_OAUTH_STATE_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).toContain("Path=/");
  });

  it("許可されない prompt は 400 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });

    const response = await GET(makeRequest({ prompt: "select_account" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("google_health_oauth_prompt_invalid");
  });
});
