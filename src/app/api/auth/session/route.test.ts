jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { AUTH_ACCESS_TOKEN_COOKIE, AUTH_REFRESH_TOKEN_COOKIE } from "@/lib/auth/session";
import { DELETE, PATCH, POST } from "./route";

const mockCreateClient = createClient as jest.Mock;
const mockGetUser = jest.fn();
const mockRefreshSession = jest.fn();

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setCookie(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
}

describe("POST /api/auth/session", () => {
  const originalAllowedEmail = process.env.ALLOWED_AUTH_EMAIL;

  beforeEach(() => {
    process.env.ALLOWED_AUTH_EMAIL = "owner@example.com";
    mockGetUser.mockReset();
    mockCreateClient.mockReturnValue({
      auth: {
        getUser: mockGetUser,
        refreshSession: mockRefreshSession,
      },
    });
    mockRefreshSession.mockReset();
  });

  afterEach(() => {
    if (originalAllowedEmail === undefined) {
      delete process.env.ALLOWED_AUTH_EMAIL;
    } else {
      process.env.ALLOWED_AUTH_EMAIL = originalAllowedEmail;
    }
  });

  it("validates the access token and sets an httpOnly cookie", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-id", email: "owner@example.com" } },
      error: null,
    });

    const response = await POST(makePostRequest({
      accessToken: "access-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      refreshToken: "refresh-token",
    }));

    expect(response.status).toBe(200);
    expect(mockGetUser).toHaveBeenCalledWith("access-token");

    const cookie = setCookie(response);
    expect(cookie).toContain(`${AUTH_ACCESS_TOKEN_COOKIE}=access-token`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`${AUTH_REFRESH_TOKEN_COOKIE}=refresh-token`);
  });

  it("clears the cookie when the payload is invalid", async () => {
    const response = await POST(makePostRequest({ accessToken: "access-token" }));

    expect(response.status).toBe(400);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(setCookie(response)).toContain("Max-Age=0");
  });

  it("clears the cookie when the token user is not allowed", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-id", email: "other@example.com" } },
      error: null,
    });

    const response = await POST(makePostRequest({
      accessToken: "access-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      refreshToken: "refresh-token",
    }));

    expect(response.status).toBe(401);
    expect(setCookie(response)).toContain("Max-Age=0");
  });
});

describe("PATCH /api/auth/session", () => {
  beforeEach(() => {
    process.env.ALLOWED_AUTH_EMAIL = "owner@example.com";
    mockCreateClient.mockReturnValue({
      auth: {
        getUser: mockGetUser,
        refreshSession: mockRefreshSession,
      },
    });
    mockRefreshSession.mockReset();
  });

  it("refreshes httpOnly auth cookies from the refresh token cookie", async () => {
    mockRefreshSession.mockResolvedValue({
      data: {
        user: { id: "user-id", email: "owner@example.com" },
        session: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    const request = new NextRequest("http://localhost/api/auth/session", {
      method: "PATCH",
      headers: { cookie: `${AUTH_REFRESH_TOKEN_COOKIE}=old-refresh-token` },
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(mockRefreshSession).toHaveBeenCalledWith({ refresh_token: "old-refresh-token" });
    expect(setCookie(response)).toContain(`${AUTH_ACCESS_TOKEN_COOKIE}=new-access-token`);
    expect(setCookie(response)).toContain(`${AUTH_REFRESH_TOKEN_COOKIE}=new-refresh-token`);
    expect(setCookie(response)).toContain("HttpOnly");
  });

  it("uses expires_in as the access token cookie fallback when expires_at is missing", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mockRefreshSession.mockResolvedValue({
      data: {
        user: { id: "user-id", email: "owner@example.com" },
        session: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 1800,
        },
      },
      error: null,
    });
    const request = new NextRequest("http://localhost/api/auth/session", {
      method: "PATCH",
      headers: { cookie: `${AUTH_REFRESH_TOKEN_COOKIE}=old-refresh-token` },
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(setCookie(response)).toContain(`${AUTH_ACCESS_TOKEN_COOKIE}=new-access-token`);
    expect(setCookie(response)).toContain("Max-Age=1800");

    nowSpy.mockRestore();
  });

  it("uses a safe default access token cookie fallback when expires_at and expires_in are missing", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mockRefreshSession.mockResolvedValue({
      data: {
        user: { id: "user-id", email: "owner@example.com" },
        session: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
        },
      },
      error: null,
    });
    const request = new NextRequest("http://localhost/api/auth/session", {
      method: "PATCH",
      headers: { cookie: `${AUTH_REFRESH_TOKEN_COOKIE}=old-refresh-token` },
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(setCookie(response)).toContain(`${AUTH_ACCESS_TOKEN_COOKIE}=new-access-token`);
    expect(setCookie(response)).toContain("Max-Age=3600");

    nowSpy.mockRestore();
  });

  it("does not clear cookies when refresh fails", async () => {
    mockRefreshSession.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid Refresh Token" },
    });
    const request = new NextRequest("http://localhost/api/auth/session", {
      method: "PATCH",
      headers: { cookie: `${AUTH_REFRESH_TOKEN_COOKIE}=old-refresh-token` },
    });

    const response = await PATCH(request);

    expect(response.status).toBe(401);
    expect(setCookie(response)).toBe("");
  });
});

describe("DELETE /api/auth/session", () => {
  it("clears the auth cookie", async () => {
    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(setCookie(response)).toContain(`${AUTH_ACCESS_TOKEN_COOKIE}=`);
    expect(setCookie(response)).toContain("Max-Age=0");
    expect(setCookie(response)).toContain("HttpOnly");
  });
});
