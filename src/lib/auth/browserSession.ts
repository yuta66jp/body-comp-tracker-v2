import type { Session } from "@supabase/supabase-js";

function clearSupabaseBrowserStorage(): void {
  if (typeof window === "undefined") return;

  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) {
        storage.removeItem(key);
      }
    }
  }
}

export async function syncAuthCookie(session: Session | null): Promise<boolean> {
  if (typeof window === "undefined") return true;

  try {
    clearSupabaseBrowserStorage();

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
        refreshToken: session.refresh_token,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function refreshAuthCookie(): Promise<boolean> {
  if (typeof window === "undefined") return true;

  try {
    clearSupabaseBrowserStorage();
    const response = await fetch("/api/auth/session", { method: "PATCH" });
    return response.ok;
  } catch {
    return false;
  }
}
