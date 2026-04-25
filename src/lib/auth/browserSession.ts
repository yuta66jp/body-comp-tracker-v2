import type { Session } from "@supabase/supabase-js";
import { AUTH_ACCESS_TOKEN_COOKIE } from "./session";

function cookieAttributes(maxAge: number): string {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  return `path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

export function syncAuthCookie(session: Session | null): void {
  if (typeof document === "undefined") return;

  if (!session?.access_token) {
    document.cookie = `${AUTH_ACCESS_TOKEN_COOKIE}=; ${cookieAttributes(0)}`;
    return;
  }

  const maxAge = Math.max(0, Math.floor((session.expires_at ?? 0) - Date.now() / 1000));
  document.cookie = `${AUTH_ACCESS_TOKEN_COOKIE}=${encodeURIComponent(session.access_token)}; ${cookieAttributes(maxAge)}`;
}
