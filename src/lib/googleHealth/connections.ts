import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type {
  Database,
  GoogleHealthConnectionRow,
  GoogleHealthConnectionStatus,
  Json,
} from "@/lib/supabase/types";
import {
  GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY_VERSION,
  decryptGoogleHealthToken,
  encryptGoogleHealthToken,
} from "./tokenCrypto";
import {
  GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES,
} from "./dailyMetrics";
import {
  getMissingGoogleHealthOAuthScopes,
  getGoogleHealthOAuthConfig,
  refreshGoogleHealthOAuthAccessToken,
  type GoogleHealthOAuthTokenResponse,
} from "./oauth";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;
type GoogleHealthConnectionUpdate =
  Database["private"]["Tables"]["google_health_connections"]["Update"];
type GoogleHealthConnectionInsert =
  Database["private"]["Tables"]["google_health_connections"]["Insert"];

type SaveConnectionResult = {
  connection: GoogleHealthConnectionRow;
  missingScopes: string[];
  status: GoogleHealthConnectionStatus;
};

export type GoogleHealthStoredAccessTokenResult =
  | {
      ok: true;
      accessToken: string;
      refreshed: boolean;
      status: "connected";
    }
  | {
      ok: false;
      status: GoogleHealthConnectionStatus;
      statusCode: number;
      message: string;
      requiredScopes: readonly string[];
      missingScopes?: string[];
    };

const ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

function privateConnections(client: ServiceRoleClient) {
  return client.schema("private").from("google_health_connections");
}

function encryptedTokenToJson(value: ReturnType<typeof encryptGoogleHealthToken>): Json {
  return value as unknown as Json;
}

function buildAccessTokenExpiresAt(expiresIn: number | null, now = Date.now()): string | null {
  if (!expiresIn) return null;
  return new Date(now + expiresIn * 1000).toISOString();
}

function sanitizeErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return message.length > 500 ? message.slice(0, 500) : message;
}

function resolveStatus(args: {
  missingScopes: readonly string[];
  encryptedRefreshToken: Json | null;
}): GoogleHealthConnectionStatus {
  if (args.missingScopes.length > 0) return "scope_missing";
  if (!args.encryptedRefreshToken) return "reauthorization_required";
  return "connected";
}

function isAccessTokenUsable(expiresAt: string | null, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > now + ACCESS_TOKEN_REFRESH_WINDOW_MS;
}

function toAccessTokenResultError(args: {
  status: GoogleHealthConnectionStatus;
  statusCode: number;
  message: string;
  missingScopes?: string[];
}): GoogleHealthStoredAccessTokenResult {
  return {
    ok: false,
    status: args.status,
    statusCode: args.statusCode,
    message: args.message,
    requiredScopes: GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES,
    missingScopes: args.missingScopes,
  };
}

function isRefreshReauthorizationError(error: unknown): boolean {
  return error instanceof Error && (
    error.message === "google_health_oauth_token_refresh_invalid_grant" ||
    error.message === "google_health_oauth_token_refresh_invalid_client" ||
    error.message === "google_health_oauth_token_refresh_unauthorized_client"
  );
}

async function updateGoogleHealthConnection(
  client: ServiceRoleClient,
  userId: string,
  payload: GoogleHealthConnectionUpdate,
): Promise<void> {
  const { error } = await privateConnections(client)
    .update(payload)
    .eq("user_id", userId);

  if (error) {
    throw new Error("google_health_connection_update_failed");
  }
}

export async function getGoogleHealthConnectionByUserId(
  userId: string,
  client: ServiceRoleClient = createServiceRoleClient(),
): Promise<GoogleHealthConnectionRow | null> {
  const { data, error } = await privateConnections(client)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("google_health_connection_fetch_failed");
  }

  return data;
}

export async function saveGoogleHealthOAuthConnection(args: {
  userId: string;
  token: GoogleHealthOAuthTokenResponse;
  client?: ServiceRoleClient;
}): Promise<SaveConnectionResult> {
  const client = args.client ?? createServiceRoleClient();
  const existing = await getGoogleHealthConnectionByUserId(args.userId, client);

  const encryptedAccessToken = encryptedTokenToJson(encryptGoogleHealthToken(args.token.accessToken));
  const encryptedRefreshToken = args.token.refreshToken
    ? encryptedTokenToJson(encryptGoogleHealthToken(args.token.refreshToken))
    : existing?.encrypted_refresh_token ?? null;
  const missingScopes = getMissingGoogleHealthOAuthScopes(args.token.grantedScopes);
  const status = resolveStatus({ missingScopes, encryptedRefreshToken });
  const lastCheckedAt = new Date().toISOString();

  const payload: GoogleHealthConnectionInsert = {
    user_id: args.userId,
    encrypted_access_token: encryptedAccessToken,
    encrypted_refresh_token: encryptedRefreshToken,
    access_token_expires_at: buildAccessTokenExpiresAt(args.token.expiresIn),
    granted_scopes: args.token.grantedScopes,
    status,
    last_checked_at: lastCheckedAt,
    last_error_code: status === "connected" ? null : status,
    last_error_message: status === "connected"
      ? null
      : status === "scope_missing"
        ? "Required Google Health OAuth scopes are missing."
        : "Google Health OAuth refresh token is missing.",
    encryption_key_version: GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY_VERSION,
  };

  const { data, error } = await privateConnections(client)
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error("google_health_connection_upsert_failed");
  }

  return { connection: data, missingScopes, status };
}

export async function resolveGoogleHealthStoredAccessToken(
  userId: string,
  client: ServiceRoleClient = createServiceRoleClient(),
): Promise<GoogleHealthStoredAccessTokenResult> {
  const connection = await getGoogleHealthConnectionByUserId(userId, client);
  if (!connection) {
    return toAccessTokenResultError({
      status: "not_connected",
      statusCode: 409,
      message: "Google Health is not connected.",
    });
  }

  const missingScopes = getMissingGoogleHealthOAuthScopes(connection.granted_scopes);
  if (missingScopes.length > 0) {
    await updateGoogleHealthConnection(client, userId, {
      status: "scope_missing",
      last_checked_at: new Date().toISOString(),
      last_error_code: "scope_missing",
      last_error_message: "Required Google Health OAuth scopes are missing.",
    });
    return toAccessTokenResultError({
      status: "scope_missing",
      statusCode: 403,
      message: "Required Google Health OAuth scopes are missing.",
      missingScopes,
    });
  }

  if (connection.status !== "connected") {
    return toAccessTokenResultError({
      status: connection.status,
      statusCode: 409,
      message: `Google Health connection status is ${connection.status}.`,
    });
  }

  if (!connection.encrypted_access_token) {
    await updateGoogleHealthConnection(client, userId, {
      status: "reauthorization_required",
      last_checked_at: new Date().toISOString(),
      last_error_code: "reauthorization_required",
      last_error_message: "Google Health OAuth access token is missing.",
    });
    return toAccessTokenResultError({
      status: "reauthorization_required",
      statusCode: 409,
      message: "Google Health reauthorization is required.",
    });
  }

  if (isAccessTokenUsable(connection.access_token_expires_at)) {
    return {
      ok: true,
      accessToken: decryptGoogleHealthToken(connection.encrypted_access_token),
      refreshed: false,
      status: "connected",
    };
  }

  if (!connection.encrypted_refresh_token) {
    await updateGoogleHealthConnection(client, userId, {
      status: "reauthorization_required",
      last_checked_at: new Date().toISOString(),
      last_error_code: "reauthorization_required",
      last_error_message: "Google Health OAuth refresh token is missing.",
    });
    return toAccessTokenResultError({
      status: "reauthorization_required",
      statusCode: 409,
      message: "Google Health reauthorization is required.",
    });
  }

  try {
    const refreshToken = decryptGoogleHealthToken(connection.encrypted_refresh_token);
    const refreshed = await refreshGoogleHealthOAuthAccessToken({
      config: getGoogleHealthOAuthConfig(),
      refreshToken,
    });
    const grantedScopes = refreshed.grantedScopes ?? connection.granted_scopes;
    const refreshedMissingScopes = getMissingGoogleHealthOAuthScopes(grantedScopes);
    const nextStatus: GoogleHealthConnectionStatus = refreshedMissingScopes.length > 0
      ? "scope_missing"
      : "connected";

    await updateGoogleHealthConnection(client, userId, {
      encrypted_access_token: encryptedTokenToJson(encryptGoogleHealthToken(refreshed.accessToken)),
      access_token_expires_at: buildAccessTokenExpiresAt(refreshed.expiresIn),
      granted_scopes: grantedScopes,
      status: nextStatus,
      last_checked_at: new Date().toISOString(),
      last_error_code: nextStatus === "connected" ? null : "scope_missing",
      last_error_message: nextStatus === "connected"
        ? null
        : "Required Google Health OAuth scopes are missing.",
      encryption_key_version: GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY_VERSION,
    });

    if (refreshedMissingScopes.length > 0) {
      return toAccessTokenResultError({
        status: "scope_missing",
        statusCode: 403,
        message: "Required Google Health OAuth scopes are missing.",
        missingScopes: refreshedMissingScopes,
      });
    }

    return {
      ok: true,
      accessToken: refreshed.accessToken,
      refreshed: true,
      status: "connected",
    };
  } catch (error) {
    const reauthorizationRequired = isRefreshReauthorizationError(error);
    await updateGoogleHealthConnection(client, userId, {
      status: reauthorizationRequired ? "reauthorization_required" : "error",
      last_checked_at: new Date().toISOString(),
      last_error_code: error instanceof Error ? error.message : "google_health_oauth_token_refresh_failed",
      last_error_message: reauthorizationRequired
        ? "Google Health OAuth refresh token is no longer valid."
        : "Google Health OAuth token refresh failed.",
    });

    return toAccessTokenResultError({
      status: reauthorizationRequired ? "reauthorization_required" : "error",
      statusCode: reauthorizationRequired ? 409 : 502,
      message: reauthorizationRequired
        ? "Google Health reauthorization is required."
        : "Google Health OAuth token refresh failed.",
    });
  }
}

export async function markGoogleHealthConnectionError(args: {
  userId: string;
  code: string;
  message?: string | null;
  client?: ServiceRoleClient;
}): Promise<void> {
  const client = args.client ?? createServiceRoleClient();
  const payload: GoogleHealthConnectionUpdate = {
    status: "error",
    last_checked_at: new Date().toISOString(),
    last_error_code: args.code,
    last_error_message: sanitizeErrorMessage(args.message),
  };

  const { error } = await privateConnections(client)
    .update(payload)
    .eq("user_id", args.userId);

  if (error) {
    throw new Error("google_health_connection_error_update_failed");
  }
}

export async function markGoogleHealthConnectionSynced(args: {
  userId: string;
  syncedAt?: string;
  client?: ServiceRoleClient;
}): Promise<void> {
  const client = args.client ?? createServiceRoleClient();
  const syncedAt = args.syncedAt ?? new Date().toISOString();

  const { error } = await privateConnections(client)
    .update({
      status: "connected",
      last_checked_at: syncedAt,
      last_sync_at: syncedAt,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("user_id", args.userId);

  if (error) {
    throw new Error("google_health_connection_sync_update_failed");
  }
}

export async function deleteGoogleHealthConnection(
  userId: string,
  client: ServiceRoleClient = createServiceRoleClient(),
): Promise<void> {
  const { error } = await privateConnections(client)
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error("google_health_connection_delete_failed");
  }
}

export function decryptGoogleHealthConnectionRevokeToken(
  connection: Pick<GoogleHealthConnectionRow, "encrypted_access_token" | "encrypted_refresh_token">,
): string | null {
  const payload = connection.encrypted_refresh_token ?? connection.encrypted_access_token;
  return payload ? decryptGoogleHealthToken(payload) : null;
}
