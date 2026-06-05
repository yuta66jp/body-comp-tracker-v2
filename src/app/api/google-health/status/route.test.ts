jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/googleHealth/status", () => ({
  buildGoogleHealthStatusError: jest.fn(() => ({
    status: "error",
    requiredScopes: ["scope-a", "scope-b"],
    grantedScopes: [],
    missingScopes: [],
    lastCheckedAt: null,
    lastSyncAt: null,
    lastErrorCode: "google_health_connection_status_lookup_failed",
  })),
  getGoogleHealthStatusForUser: jest.fn(),
}));

import { getGoogleHealthStatusForUser } from "@/lib/googleHealth/status";
import { getCurrentUser } from "@/lib/supabase/server";
import { GET } from "./route";

const mockGetCurrentUser = getCurrentUser as jest.Mock;
const mockGetStatusForUser = getGoogleHealthStatusForUser as jest.Mock;

describe("GET /api/google-health/status", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset();
    mockGetStatusForUser.mockReset();
  });

  it("未認証の場合は 401 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockGetStatusForUser).not.toHaveBeenCalled();
  });

  it("連携状態を sanitized response として返す", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockGetStatusForUser.mockResolvedValue({
      status: "connected",
      requiredScopes: ["scope-a", "scope-b"],
      grantedScopes: ["scope-a", "scope-b"],
      missingScopes: [],
      lastCheckedAt: "2026-06-05T23:00:00.000Z",
      lastSyncAt: "2026-06-05T23:30:00.000Z",
      lastErrorCode: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetStatusForUser).toHaveBeenCalledWith("user-id");
    expect(body).toEqual({
      ok: true,
      status: "connected",
      requiredScopes: ["scope-a", "scope-b"],
      grantedScopes: ["scope-a", "scope-b"],
      missingScopes: [],
      lastCheckedAt: "2026-06-05T23:00:00.000Z",
      lastSyncAt: "2026-06-05T23:30:00.000Z",
      lastErrorCode: null,
    });
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("client_secret");
    expect(JSON.stringify(body)).not.toContain("auth_code");
  });

  it("lookup 失敗時は sanitized 500 を返す", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id" });
    mockGetStatusForUser.mockRejectedValue(new Error("supabase_service_role_env_missing"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: "Google Health connection status lookup failed.",
      status: "error",
      requiredScopes: ["scope-a", "scope-b"],
      grantedScopes: [],
      missingScopes: [],
      lastCheckedAt: null,
      lastSyncAt: null,
      lastErrorCode: "google_health_connection_status_lookup_failed",
    });
    expect(JSON.stringify(body)).not.toContain("supabase_service_role_env_missing");
  });
});
