import { NextRequest, NextResponse } from "next/server";
import {
  deleteGoogleHealthConnection,
  decryptGoogleHealthConnectionRevokeToken,
  getGoogleHealthConnectionByUserId,
} from "@/lib/googleHealth/connections";
import { revokeGoogleHealthOAuthToken } from "@/lib/googleHealth/oauth";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const client = createServiceRoleClient();
  const connection = await getGoogleHealthConnectionByUserId(user.id, client);
  let revokeAttempted = false;
  let revoked = false;

  if (connection) {
    try {
      const revokeToken = decryptGoogleHealthConnectionRevokeToken(connection);
      if (revokeToken) {
        revokeAttempted = true;
        const revokeResult = await revokeGoogleHealthOAuthToken({ token: revokeToken });
        revoked = revokeResult.ok;
      }
    } catch {
      revokeAttempted = false;
      revoked = false;
    }
  }

  await deleteGoogleHealthConnection(user.id, client);

  return NextResponse.json({
    ok: true,
    disconnected: true,
    revokeAttempted,
    revoked,
  });
}
