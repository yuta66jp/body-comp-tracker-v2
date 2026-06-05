import { NextResponse } from "next/server";
import {
  buildGoogleHealthStatusError,
  getGoogleHealthStatusForUser,
  type GoogleHealthStatusApiResponse,
} from "@/lib/googleHealth/status";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  try {
    const status = await getGoogleHealthStatusForUser(user.id);
    return NextResponse.json<GoogleHealthStatusApiResponse>({
      ok: true,
      ...status,
    });
  } catch {
    return NextResponse.json<GoogleHealthStatusApiResponse>(
      {
        ok: false,
        error: "Google Health connection status lookup failed.",
        ...buildGoogleHealthStatusError("google_health_connection_status_lookup_failed"),
      },
      { status: 500 },
    );
  }
}
