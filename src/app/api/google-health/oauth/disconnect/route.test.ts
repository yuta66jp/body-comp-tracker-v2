jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: jest.fn(),
}));

jest.mock("@/lib/googleHealth/connections", () => ({
  deleteGoogleHealthConnection: jest.fn(),
  decryptGoogleHealthConnectionRevokeToken: jest.fn(),
  getGoogleHealthConnectionByUserId: jest.fn(),
}));

jest.mock("@/lib/googleHealth/oauth", () => ({
  revokeGoogleHealthOAuthToken: jest.fn(),
}));

import { NextRequest } from "next/server";
import {
  deleteGoogleHealthConnection,
  decryptGoogleHealthConnectionRevokeToken,
  getGoogleHealthConnectionByUserId,
} from "@/lib/googleHealth/connections";
import { revokeGoogleHealthOAuthToken } from "@/lib/googleHealth/oauth";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getCurrentUser } from "@/lib/supabase/server";
import { POST } from "./route";

const mockGetCurrentUser = getCurrentUser as jest.Mock;
const mockCreateServiceRoleClient = createServiceRoleClient as jest.Mock;
const mockGetConnection = getGoogleHealthConnectionByUserId as jest.Mock;
const mockDeleteConnection = deleteGoogleHealthConnection as jest.Mock;
const mockDecryptRevokeToken = decryptGoogleHealthConnectionRevokeToken as jest.Mock;
const mockRevokeToken = revokeGoogleHealthOAuthToken as jest.Mock;

function makeRequest(origin?: string): NextRequest {
  return new NextRequest("http://localhost/api/google-health/oauth/disconnect", {
    method: "POST",
    headers: origin ? { Origin: origin } : undefined,
  });
}

describe("POST /api/google-health/oauth/disconnect", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset();
    mockCreateServiceRoleClient.mockReset();
    mockGetConnection.mockReset();
    mockDeleteConnection.mockReset();
    mockDecryptRevokeToken.mockReset();
    mockRevokeToken.mockReset();
    mockCreateServiceRoleClient.mockReturnValue({ kind: "service-role-client" });
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(makeRequest("http://localhost"));

    expect(response.status).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("same-origin ではない POST は拒否する", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });

    const response = await POST(makeRequest("https://attacker.example"));

    expect(response.status).toBe(403);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("Google token を revoke して connection を削除する", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });
    const connection = {
      encrypted_access_token: { data: "access" },
      encrypted_refresh_token: { data: "refresh" },
    };
    mockGetConnection.mockResolvedValue(connection);
    mockDecryptRevokeToken.mockReturnValue("refresh-token");
    mockRevokeToken.mockResolvedValue({ ok: true, status: 200 });

    const response = await POST(makeRequest("http://localhost"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetConnection).toHaveBeenCalledWith("user-id", { kind: "service-role-client" });
    expect(mockDecryptRevokeToken).toHaveBeenCalledWith(connection);
    expect(mockRevokeToken).toHaveBeenCalledWith({ token: "refresh-token" });
    expect(mockDeleteConnection).toHaveBeenCalledWith("user-id", { kind: "service-role-client" });
    expect(body).toEqual({
      ok: true,
      disconnected: true,
      revokeAttempted: true,
      revoked: true,
    });
    expect(JSON.stringify(body)).not.toContain("refresh-token");
  });

  it("revoke が失敗しても connection は削除する", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });
    mockGetConnection.mockResolvedValue({ encrypted_access_token: null, encrypted_refresh_token: null });
    mockDecryptRevokeToken.mockReturnValue(null);

    const response = await POST(makeRequest("http://localhost"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRevokeToken).not.toHaveBeenCalled();
    expect(mockDeleteConnection).toHaveBeenCalledWith("user-id", { kind: "service-role-client" });
    expect(body).toEqual({
      ok: true,
      disconnected: true,
      revokeAttempted: false,
      revoked: false,
    });
  });
});
