import type { GoogleHealthConnectionRow } from "@/lib/supabase/types";
import {
  buildGoogleHealthConnectionStatus,
  buildGoogleHealthNotConnectedStatus,
  buildGoogleHealthStatusError,
} from "./status";
import { GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES } from "./dailyMetrics";

function makeConnection(
  overrides: Partial<GoogleHealthConnectionRow> = {},
): GoogleHealthConnectionRow {
  return {
    id: "connection-id",
    user_id: "user-id",
    encrypted_access_token: { ciphertext: "encrypted-access-token" },
    encrypted_refresh_token: { ciphertext: "encrypted-refresh-token" },
    access_token_expires_at: "2026-06-06T00:00:00.000Z",
    granted_scopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
    status: "connected",
    last_checked_at: "2026-06-05T23:00:00.000Z",
    last_sync_at: "2026-06-05T23:30:00.000Z",
    last_error_code: null,
    last_error_message: null,
    encryption_key_version: 1,
    created_at: "2026-06-05T22:00:00.000Z",
    updated_at: "2026-06-05T23:30:00.000Z",
    ...overrides,
  };
}

describe("Google Health status helpers", () => {
  it("未連携 status を作る", () => {
    const status = buildGoogleHealthNotConnectedStatus();

    expect(status).toEqual({
      status: "not_connected",
      requiredScopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
      grantedScopes: [],
      missingScopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
      lastCheckedAt: null,
      lastSyncAt: null,
      lastErrorCode: null,
    });
  });

  it("連携済み connection を sanitized status に変換する", () => {
    const status = buildGoogleHealthConnectionStatus(makeConnection());

    expect(status).toEqual({
      status: "connected",
      requiredScopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
      grantedScopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
      missingScopes: [],
      lastCheckedAt: "2026-06-05T23:00:00.000Z",
      lastSyncAt: "2026-06-05T23:30:00.000Z",
      lastErrorCode: null,
    });
    expect(JSON.stringify(status)).not.toContain("encrypted-access-token");
    expect(JSON.stringify(status)).not.toContain("encrypted-refresh-token");
  });

  it("必須 scope が不足している場合は scope_missing にする", () => {
    const status = buildGoogleHealthConnectionStatus(makeConnection({
      granted_scopes: [GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES[0]],
    }));

    expect(status.status).toBe("scope_missing");
    expect(status.missingScopes).toEqual([
      GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES[1],
      GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES[2],
    ]);
  });

  it("connected でも token 保存状態が不足していれば再認可扱いにする", () => {
    const status = buildGoogleHealthConnectionStatus(makeConnection({
      encrypted_refresh_token: null,
    }));

    expect(status.status).toBe("reauthorization_required");
  });

  it("lookup error 用の sanitized status を作る", () => {
    const status = buildGoogleHealthStatusError("lookup_failed");

    expect(status).toEqual({
      status: "error",
      requiredScopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
      grantedScopes: [],
      missingScopes: [],
      lastCheckedAt: null,
      lastSyncAt: null,
      lastErrorCode: "lookup_failed",
    });
  });
});
