import type { Session } from "@supabase/supabase-js";

export async function syncAuthCookie(session: Session | null): Promise<boolean> {
  if (typeof window === "undefined") return true;

  try {
    if (!session?.access_token) {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      return response.ok;
    }

    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: session.access_token,
        expiresAt: session.expires_at,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
