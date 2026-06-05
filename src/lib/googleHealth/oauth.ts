import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES } from "./dailyMetrics";

export const GOOGLE_HEALTH_OAUTH_STATE_COOKIE = "bc_google_health_oauth_state";
export const GOOGLE_HEALTH_OAUTH_STATE_TTL_SECONDS = 10 * 60;

export const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const GOOGLE_OAUTH_CLIENT_ID_ENV = "GOOGLE_OAUTH_CLIENT_ID";
const GOOGLE_OAUTH_CLIENT_SECRET_ENV = "GOOGLE_OAUTH_CLIENT_SECRET";
const GOOGLE_OAUTH_REDIRECT_URI_ENV = "GOOGLE_OAUTH_REDIRECT_URI";
const GOOGLE_HEALTH_OAUTH_STATE_SECRET_ENV = "GOOGLE_HEALTH_OAUTH_STATE_SECRET";
const MIN_STATE_SECRET_BYTES = 32;

type EnvLike = Record<string, string | undefined>;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type GoogleHealthOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
};

export type GoogleHealthOAuthStatePayload = {
  state: string;
  codeVerifier: string;
  userId: string;
  expiresAt: number;
};

export type GoogleHealthOAuthTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  grantedScopes: string[];
  tokenType: string | null;
};

function readRequiredEnv(env: EnvLike, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error("google_health_oauth_config_missing");
  return value;
}

function toBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function fromBase64Url(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new Error("google_health_oauth_state_invalid");
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJsonPayload(value: Buffer): GoogleHealthOAuthStatePayload {
  try {
    const parsed = JSON.parse(value.toString("utf8"));
    const record = asRecord(parsed);
    if (!record) throw new Error("invalid");

    const state = typeof record.state === "string" ? record.state : null;
    const codeVerifier = typeof record.codeVerifier === "string" ? record.codeVerifier : null;
    const userId = typeof record.userId === "string" ? record.userId : null;
    const expiresAt = typeof record.expiresAt === "number" ? record.expiresAt : null;

    if (!state || !codeVerifier || !userId || !expiresAt) {
      throw new Error("invalid");
    }

    return { state, codeVerifier, userId, expiresAt };
  } catch {
    throw new Error("google_health_oauth_state_invalid");
  }
}

function signStatePayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.byteLength === bBuffer.byteLength && timingSafeEqual(aBuffer, bBuffer);
}

function normalizePrompt(value: string | null): "consent" | null {
  if (value === null || value === "") return null;
  if (value === "consent") return "consent";
  throw new Error("google_health_oauth_prompt_invalid");
}

export function getGoogleHealthOAuthConfig(env: EnvLike = process.env): GoogleHealthOAuthConfig {
  const clientId = readRequiredEnv(env, GOOGLE_OAUTH_CLIENT_ID_ENV);
  const clientSecret = readRequiredEnv(env, GOOGLE_OAUTH_CLIENT_SECRET_ENV);
  const redirectUri = readRequiredEnv(env, GOOGLE_OAUTH_REDIRECT_URI_ENV);
  const stateSecret = readRequiredEnv(env, GOOGLE_HEALTH_OAUTH_STATE_SECRET_ENV);

  if (Buffer.byteLength(stateSecret, "utf8") < MIN_STATE_SECRET_BYTES) {
    throw new Error("google_health_oauth_state_secret_invalid");
  }

  try {
    new URL(redirectUri);
  } catch {
    throw new Error("google_health_oauth_redirect_uri_invalid");
  }

  return { clientId, clientSecret, redirectUri, stateSecret };
}

export function parseGoogleHealthOAuthPrompt(value: string | null): "consent" | null {
  return normalizePrompt(value);
}

export function generateGoogleHealthOAuthState(): string {
  return toBase64Url(randomBytes(32));
}

export function generateGoogleHealthPkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = toBase64Url(randomBytes(32));
  const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function createGoogleHealthOAuthStateCookieValue(
  payload: GoogleHealthOAuthStatePayload,
  secret: string,
): string {
  const encodedPayload = toBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${encodedPayload}.${signStatePayload(encodedPayload, secret)}`;
}

export function parseGoogleHealthOAuthStateCookieValue(
  value: string,
  secret: string,
): GoogleHealthOAuthStatePayload {
  const [encodedPayload, signature, extra] = value.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    throw new Error("google_health_oauth_state_invalid");
  }

  const expectedSignature = signStatePayload(encodedPayload, secret);
  if (!timingSafeEqualString(signature, expectedSignature)) {
    throw new Error("google_health_oauth_state_invalid");
  }

  return parseJsonPayload(fromBase64Url(encodedPayload));
}

export function buildGoogleHealthOAuthAuthorizationUrl(args: {
  config: GoogleHealthOAuthConfig;
  state: string;
  codeChallenge: string;
  prompt?: "consent" | null;
}): URL {
  const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", args.config.clientId);
  url.searchParams.set("redirect_uri", args.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES.join(" "));
  url.searchParams.set("state", args.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (args.prompt) {
    url.searchParams.set("prompt", args.prompt);
  }
  return url;
}

export function getMissingGoogleHealthOAuthScopes(
  grantedScopes: readonly string[],
  requiredScopes: readonly string[] = GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES,
): string[] {
  const granted = new Set(grantedScopes);
  return requiredScopes.filter((scope) => !granted.has(scope));
}

function parseGrantedScopes(value: unknown): string[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES];
  }
  return value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
}

function parseExpiresIn(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

export async function exchangeGoogleHealthOAuthCode(args: {
  config: GoogleHealthOAuthConfig;
  code: string;
  codeVerifier: string;
  fetchFn?: FetchLike;
}): Promise<GoogleHealthOAuthTokenResponse> {
  const fetchFn = args.fetchFn ?? fetch;
  const body = new URLSearchParams({
    client_id: args.config.clientId,
    client_secret: args.config.clientSecret,
    code: args.code,
    grant_type: "authorization_code",
    redirect_uri: args.config.redirectUri,
    code_verifier: args.codeVerifier,
  });

  const response = await fetchFn(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error("google_health_oauth_token_exchange_failed");
  }

  const record = asRecord(payload);
  const accessToken = typeof record?.access_token === "string" ? record.access_token : null;
  if (!accessToken) {
    throw new Error("google_health_oauth_token_response_invalid");
  }

  const refreshToken = typeof record?.refresh_token === "string" && record.refresh_token.length > 0
    ? record.refresh_token
    : null;
  const tokenType = typeof record?.token_type === "string" ? record.token_type : null;

  return {
    accessToken,
    refreshToken,
    expiresIn: parseExpiresIn(record?.expires_in),
    grantedScopes: parseGrantedScopes(record?.scope),
    tokenType,
  };
}

export async function revokeGoogleHealthOAuthToken(args: {
  token: string;
  fetchFn?: FetchLike;
}): Promise<{ ok: boolean; status: number | null }> {
  const fetchFn = args.fetchFn ?? fetch;
  const body = new URLSearchParams({ token: args.token });

  try {
    const response = await fetchFn(GOOGLE_OAUTH_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: null };
  }
}
