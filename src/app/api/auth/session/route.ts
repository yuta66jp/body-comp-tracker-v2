import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_ACCESS_TOKEN_COOKIE,
  isAllowedUser,
} from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";

interface SessionCookiePayload {
  accessToken?: unknown;
  expiresAt?: unknown;
}

function clearAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set(AUTH_ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

function setAuthCookie(
  response: NextResponse,
  accessToken: string,
  expiresAt: number,
): NextResponse {
  const maxAge = Math.max(0, Math.floor(expiresAt - Date.now() / 1000));
  response.cookies.set(AUTH_ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

async function readPayload(request: NextRequest): Promise<SessionCookiePayload | null> {
  try {
    const value = await request.json();
    return typeof value === "object" && value !== null ? value as SessionCookiePayload : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const payload = await readPayload(request);
  const accessToken = typeof payload?.accessToken === "string" ? payload.accessToken : null;
  const expiresAt = typeof payload?.expiresAt === "number" ? payload.expiresAt : null;

  if (!accessToken || !expiresAt) {
    return clearAuthCookie(NextResponse.json({ error: "invalid_session" }, { status: 400 }));
  }

  const supabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !isAllowedUser(user)) {
    return clearAuthCookie(NextResponse.json({ error: "auth_required" }, { status: 401 }));
  }

  return setAuthCookie(NextResponse.json({ ok: true }), accessToken, expiresAt);
}

export async function DELETE() {
  return clearAuthCookie(NextResponse.json({ ok: true }));
}
