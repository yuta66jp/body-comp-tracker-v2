jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { AUTH_ACCESS_TOKEN_COOKIE } from "@/lib/auth/session";
import { DELETE, POST } from "./route";

const mockCreateClient = createClient as jest.Mock;
const mockGetUser = jest.fn();

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
  const originalAllowedEmail = process.env.NEXT_PUBLIC_ALLOWED_AUTH_EMAIL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ALLOWED_AUTH_EMAIL = "owner@example.com";
    mockGetUser.mockReset();
    mockCreateClient.mockReturnValue({
      auth: {
        getUser: mockGetUser,
      },
    });
  });

  afterEach(() => {
    if (originalAllowedEmail === undefined) {
      delete process.env.NEXT_PUBLIC_ALLOWED_AUTH_EMAIL;
    } else {
      process.env.NEXT_PUBLIC_ALLOWED_AUTH_EMAIL = originalAllowedEmail;
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
    }));

    expect(response.status).toBe(200);
    expect(mockGetUser).toHaveBeenCalledWith("access-token");

    const cookie = setCookie(response);
    expect(cookie).toContain(`${AUTH_ACCESS_TOKEN_COOKIE}=access-token`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).toContain("Path=/");
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
    }));

    expect(response.status).toBe(401);
    expect(setCookie(response)).toContain("Max-Age=0");
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
