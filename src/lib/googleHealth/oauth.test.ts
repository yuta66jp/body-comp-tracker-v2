import {
  GOOGLE_HEALTH_OAUTH_STATE_TTL_SECONDS,
  GOOGLE_OAUTH_TOKEN_URL,
  buildGoogleHealthOAuthAuthorizationUrl,
  createGoogleHealthOAuthStateCookieValue,
  exchangeGoogleHealthOAuthCode,
  generateGoogleHealthPkcePair,
  getGoogleHealthOAuthConfig,
  getMissingGoogleHealthOAuthScopes,
  parseGoogleHealthOAuthPrompt,
  parseGoogleHealthOAuthStateCookieValue,
} from "./oauth";
import { GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES } from "./dailyMetrics";

const config = {
  clientId: "google-client-id",
  clientSecret: "google-client-secret",
  redirectUri: "https://example.com/api/google-health/oauth/callback",
  stateSecret: "0123456789abcdef0123456789abcdef",
};

describe("Google Health OAuth helpers", () => {
  it("required env から OAuth config を作成する", () => {
    expect(getGoogleHealthOAuthConfig({
      GOOGLE_OAUTH_CLIENT_ID: config.clientId,
      GOOGLE_OAUTH_CLIENT_SECRET: config.clientSecret,
      GOOGLE_OAUTH_REDIRECT_URI: config.redirectUri,
      GOOGLE_HEALTH_OAUTH_STATE_SECRET: config.stateSecret,
    })).toEqual(config);
  });

  it("state secret が短い場合は拒否する", () => {
    expect(() => getGoogleHealthOAuthConfig({
      GOOGLE_OAUTH_CLIENT_ID: config.clientId,
      GOOGLE_OAUTH_CLIENT_SECRET: config.clientSecret,
      GOOGLE_OAUTH_REDIRECT_URI: config.redirectUri,
      GOOGLE_HEALTH_OAUTH_STATE_SECRET: "short",
    })).toThrow("google_health_oauth_state_secret_invalid");
  });

  it("認可 URL に必要な Google OAuth パラメータを含める", () => {
    const url = buildGoogleHealthOAuthAuthorizationUrl({
      config,
      state: "state-value",
      codeChallenge: "code-challenge",
      prompt: "consent",
    });

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("code-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES.join(" "));
  });

  it("prompt は consent のみ許可する", () => {
    expect(parseGoogleHealthOAuthPrompt(null)).toBeNull();
    expect(parseGoogleHealthOAuthPrompt("")).toBeNull();
    expect(parseGoogleHealthOAuthPrompt("consent")).toBe("consent");
    expect(() => parseGoogleHealthOAuthPrompt("select_account"))
      .toThrow("google_health_oauth_prompt_invalid");
  });

  it("PKCE verifier と S256 challenge を生成する", () => {
    const { codeVerifier, codeChallenge } = generateGoogleHealthPkcePair();

    expect(codeVerifier).toHaveLength(43);
    expect(codeChallenge).toHaveLength(43);
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("state cookie payload を署名して検証できる", () => {
    const payload = {
      state: "state-value",
      codeVerifier: "code-verifier",
      userId: "user-id",
      expiresAt: Math.floor(Date.now() / 1000) + GOOGLE_HEALTH_OAUTH_STATE_TTL_SECONDS,
    };

    const value = createGoogleHealthOAuthStateCookieValue(payload, config.stateSecret);
    const parts = value.split(".");
    expect(parts).toHaveLength(4);
    const authTag = parts[2]!;
    parts[2] = authTag.startsWith("A") ? `B${authTag.slice(1)}` : `A${authTag.slice(1)}`;

    expect(parseGoogleHealthOAuthStateCookieValue(value, config.stateSecret)).toEqual(payload);
    expect(() => parseGoogleHealthOAuthStateCookieValue(parts.join("."), config.stateSecret))
      .toThrow("google_health_oauth_state_invalid");
  });

  it("authorization code を token endpoint に交換する", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: "scope-a scope-b",
        token_type: "Bearer",
      }),
    });

    const token = await exchangeGoogleHealthOAuthCode({
      config,
      code: "authorization-code",
      codeVerifier: "code-verifier",
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: expect.any(URLSearchParams),
    });
    const body = fetchFn.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("client_id")).toBe(config.clientId);
    expect(body.get("client_secret")).toBe(config.clientSecret);
    expect(body.get("code")).toBe("authorization-code");
    expect(body.get("code_verifier")).toBe("code-verifier");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(token).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      grantedScopes: ["scope-a", "scope-b"],
      tokenType: "Bearer",
    });
  });

  it("token exchange 失敗時は sanitized error を返す", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({
        error: "invalid_grant",
        error_description: "secret detail",
      }),
    });

    await expect(exchangeGoogleHealthOAuthCode({
      config,
      code: "authorization-code",
      codeVerifier: "code-verifier",
      fetchFn,
    })).rejects.toThrow("google_health_oauth_token_exchange_invalid_grant");
  });

  it("想定外の token exchange error は generic reason に丸める", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({
        error: "unexpected_error",
        error_description: "secret detail",
      }),
    });

    await expect(exchangeGoogleHealthOAuthCode({
      config,
      code: "authorization-code",
      codeVerifier: "code-verifier",
      fetchFn,
    })).rejects.toThrow("google_health_oauth_token_exchange_failed");
  });

  it("不足 scope を検出する", () => {
    expect(getMissingGoogleHealthOAuthScopes([
      GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES[0],
    ])).toEqual([
      GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES[1],
      GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES[2],
    ]);
  });
});
