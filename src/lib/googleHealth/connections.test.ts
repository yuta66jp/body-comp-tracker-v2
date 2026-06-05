jest.mock("./oauth", () => {
  const actual = jest.requireActual("./oauth");
  return {
    ...actual,
    getGoogleHealthOAuthConfig: jest.fn(() => ({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      redirectUri: "http://localhost/api/google-health/oauth/callback",
      stateSecret: "0123456789abcdef0123456789abcdef",
    })),
    refreshGoogleHealthOAuthAccessToken: jest.fn(),
  };
});

import {
  resolveGoogleHealthStoredAccessToken,
  saveGoogleHealthOAuthConnection,
} from "./connections";
import { GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES } from "./dailyMetrics";
import { encryptGoogleHealthToken } from "./tokenCrypto";
import { refreshGoogleHealthOAuthAccessToken } from "./oauth";
import type { Json } from "@/lib/supabase/types";

const originalEnv = process.env;
const encryptionKey = Buffer.from("0123456789abcdef0123456789abcdef", "utf8").toString("base64url");
const mockRefreshGoogleHealthOAuthAccessToken = refreshGoogleHealthOAuthAccessToken as jest.Mock;

type ExistingConnection = {
  encrypted_access_token?: Json | null;
  encrypted_refresh_token: Json | null;
  access_token_expires_at?: string | null;
  granted_scopes?: string[];
  status?: "not_connected" | "connected" | "scope_missing" | "reauthorization_required" | "error";
};

function makeClient(existing: ExistingConnection | null) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: existing, error: null });
  const getEq = jest.fn().mockReturnValue({ maybeSingle });
  const getSelect = jest.fn().mockReturnValue({ eq: getEq });
  const single = jest.fn().mockImplementation(() => Promise.resolve({
    data: {
      id: "connection-id",
      created_at: "2026-06-05T00:00:00.000Z",
      updated_at: "2026-06-05T00:00:00.000Z",
      ...upsert.mock.calls[0][0],
    },
    error: null,
  }));
  const upsertSelect = jest.fn().mockReturnValue({ single });
  const upsert = jest.fn().mockReturnValue({ select: upsertSelect });
  const updateEq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn().mockReturnValue({ eq: updateEq });
  const from = jest.fn().mockReturnValue({
    select: getSelect,
    upsert,
    update,
  });
  const schema = jest.fn().mockReturnValue({ from });

  return {
    client: { schema },
    upsert,
    update,
  };
}

describe("Google Health connections", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY: encryptionKey,
    };
    mockRefreshGoogleHealthOAuthAccessToken.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("refresh token が返らない場合は既存の暗号化済み refresh token を維持する", async () => {
    const existingRefreshToken = { v: 1, alg: "A256GCM", kid: "1", iv: "iv", tag: "tag", data: "data" };
    const { client, upsert } = makeClient({ encrypted_refresh_token: existingRefreshToken });

    const result = await saveGoogleHealthOAuthConnection({
      userId: "user-id",
      client: client as never,
      token: {
        accessToken: "access-token",
        refreshToken: null,
        expiresIn: 3600,
        grantedScopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
        tokenType: "Bearer",
      },
    });

    expect(result.status).toBe("connected");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-id",
      encrypted_refresh_token: existingRefreshToken,
      status: "connected",
      last_error_code: null,
      last_error_message: null,
    }), { onConflict: "user_id" });
  });

  it("refresh token がなく既存 connection もない場合は reauthorization_required にする", async () => {
    const { client, upsert } = makeClient(null);

    const result = await saveGoogleHealthOAuthConnection({
      userId: "user-id",
      client: client as never,
      token: {
        accessToken: "access-token",
        refreshToken: null,
        expiresIn: null,
        grantedScopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
        tokenType: "Bearer",
      },
    });

    expect(result.status).toBe("reauthorization_required");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      encrypted_refresh_token: null,
      status: "reauthorization_required",
      last_error_code: "reauthorization_required",
    }), { onConflict: "user_id" });
  });

  it("保存済み access token が期限内なら復号して返す", async () => {
    const encryptedAccessToken = encryptGoogleHealthToken("stored-access-token");
    const { client, update } = makeClient({
      encrypted_access_token: encryptedAccessToken as unknown as Json,
      encrypted_refresh_token: null,
      access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      granted_scopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
      status: "connected",
    });

    const result = await resolveGoogleHealthStoredAccessToken("user-id", client as never);

    expect(result).toEqual({
      ok: true,
      accessToken: "stored-access-token",
      refreshed: false,
      status: "connected",
    });
    expect(update).not.toHaveBeenCalled();
    expect(mockRefreshGoogleHealthOAuthAccessToken).not.toHaveBeenCalled();
  });

  it("access token が期限切れ間近なら refresh token で更新して返す", async () => {
    const encryptedAccessToken = encryptGoogleHealthToken("old-access-token");
    const encryptedRefreshToken = encryptGoogleHealthToken("refresh-token");
    const { client, update } = makeClient({
      encrypted_access_token: encryptedAccessToken as unknown as Json,
      encrypted_refresh_token: encryptedRefreshToken as unknown as Json,
      access_token_expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
      granted_scopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
      status: "connected",
    });
    mockRefreshGoogleHealthOAuthAccessToken.mockResolvedValue({
      accessToken: "new-access-token",
      expiresIn: 3600,
      grantedScopes: null,
      tokenType: "Bearer",
    });

    const result = await resolveGoogleHealthStoredAccessToken("user-id", client as never);

    expect(result).toEqual({
      ok: true,
      accessToken: "new-access-token",
      refreshed: true,
      status: "connected",
    });
    expect(mockRefreshGoogleHealthOAuthAccessToken).toHaveBeenCalledWith({
      config: expect.objectContaining({ clientId: "google-client-id" }),
      refreshToken: "refresh-token",
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: "connected",
      last_error_code: null,
      last_error_message: null,
      granted_scopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
    }));
  });

  it("refresh token が invalid_grant の場合は reauthorization_required に更新する", async () => {
    const encryptedAccessToken = encryptGoogleHealthToken("old-access-token");
    const encryptedRefreshToken = encryptGoogleHealthToken("refresh-token");
    const { client, update } = makeClient({
      encrypted_access_token: encryptedAccessToken as unknown as Json,
      encrypted_refresh_token: encryptedRefreshToken as unknown as Json,
      access_token_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      granted_scopes: [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES],
      status: "connected",
    });
    mockRefreshGoogleHealthOAuthAccessToken.mockRejectedValue(
      new Error("google_health_oauth_token_refresh_invalid_grant"),
    );

    const result = await resolveGoogleHealthStoredAccessToken("user-id", client as never);

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: "reauthorization_required",
      statusCode: 409,
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: "reauthorization_required",
      last_error_code: "google_health_oauth_token_refresh_invalid_grant",
    }));
  });
});
