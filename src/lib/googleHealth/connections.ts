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
  getMissingGoogleHealthOAuthScopes,
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
