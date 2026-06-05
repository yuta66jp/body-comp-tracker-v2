import { saveGoogleHealthOAuthConnection } from "./connections";
import { GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES } from "./dailyMetrics";
import type { Json } from "@/lib/supabase/types";

const originalEnv = process.env;
const encryptionKey = Buffer.from("0123456789abcdef0123456789abcdef", "utf8").toString("base64url");

function makeClient(existing: { encrypted_refresh_token: Json | null } | null) {
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
  const from = jest.fn().mockReturnValue({
    select: getSelect,
    upsert,
  });
  const schema = jest.fn().mockReturnValue({ from });

  return {
    client: { schema },
    upsert,
  };
}

describe("Google Health connections", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY: encryptionKey,
    };
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
});
