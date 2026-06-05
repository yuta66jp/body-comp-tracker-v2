import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type {
  GoogleHealthConnectionRow,
  GoogleHealthConnectionStatus,
} from "@/lib/supabase/types";
import { getGoogleHealthConnectionByUserId } from "./connections";
import { GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES } from "./dailyMetrics";
import { getMissingGoogleHealthOAuthScopes } from "./oauth";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

export type GoogleHealthStatusSnapshot = {
  status: GoogleHealthConnectionStatus;
  requiredScopes: string[];
  grantedScopes: string[];
  missingScopes: string[];
  lastCheckedAt: string | null;
  lastSyncAt: string | null;
  lastErrorCode: string | null;
};

export type GoogleHealthStatusApiResponse =
  | ({ ok: true } & GoogleHealthStatusSnapshot)
  | ({
      ok: false;
      error: string;
    } & GoogleHealthStatusSnapshot);

const REQUIRED_SCOPES = [...GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES];

export function buildGoogleHealthNotConnectedStatus(): GoogleHealthStatusSnapshot {
  return {
    status: "not_connected",
    requiredScopes: REQUIRED_SCOPES,
    grantedScopes: [],
    missingScopes: REQUIRED_SCOPES,
    lastCheckedAt: null,
    lastSyncAt: null,
    lastErrorCode: null,
  };
}

export function buildGoogleHealthStatusError(
  lastErrorCode = "google_health_connection_status_failed",
): GoogleHealthStatusSnapshot {
  return {
    status: "error",
    requiredScopes: REQUIRED_SCOPES,
    grantedScopes: [],
    missingScopes: [],
    lastCheckedAt: null,
    lastSyncAt: null,
    lastErrorCode,
  };
}

function resolveVisibleStatus(args: {
  connection: GoogleHealthConnectionRow;
  missingScopes: readonly string[];
}): GoogleHealthConnectionStatus {
  if (args.missingScopes.length > 0) return "scope_missing";
  if (
    args.connection.status === "connected" &&
    (!args.connection.encrypted_access_token || !args.connection.encrypted_refresh_token)
  ) {
    return "reauthorization_required";
  }
  return args.connection.status;
}

export function buildGoogleHealthConnectionStatus(
  connection: GoogleHealthConnectionRow | null,
): GoogleHealthStatusSnapshot {
  if (!connection) return buildGoogleHealthNotConnectedStatus();

  const grantedScopes = connection.granted_scopes ?? [];
  const missingScopes = getMissingGoogleHealthOAuthScopes(grantedScopes);

  return {
    status: resolveVisibleStatus({ connection, missingScopes }),
    requiredScopes: REQUIRED_SCOPES,
    grantedScopes,
    missingScopes,
    lastCheckedAt: connection.last_checked_at,
    lastSyncAt: connection.last_sync_at,
    lastErrorCode: connection.last_error_code,
  };
}

export async function getGoogleHealthStatusForUser(
  userId: string,
  client: ServiceRoleClient = createServiceRoleClient(),
): Promise<GoogleHealthStatusSnapshot> {
  const connection = await getGoogleHealthConnectionByUserId(userId, client);
  return buildGoogleHealthConnectionStatus(connection);
}
