import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { AUTH_ACCESS_TOKEN_COOKIE, isAllowedUser } from "@/lib/auth/session";
import type { Database } from "./types";

/**
 * Server-side Supabase client (SSR / Server Components / Route Handlers 用).
 *
 * このクライアントは anon key + Auth access token ベースで動作するため、RLS ポリシーが適用される。
 * service_role による特権アクセス（RLS バイパス）はできない。
 *
 * service_role が必要な場合（RLS を回避したいサーバー処理など）は、
 * このクライアントを使わず、以下のように直接生成すること:
 *   createClient<Database>(
 *     process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *     process.env.SUPABASE_SERVICE_ROLE_KEY!   // サーバー専用。NEXT_PUBLIC_ にしないこと
 *   )
 * ※ SUPABASE_SERVICE_ROLE_KEY はクライアントバンドルに含めないよう注意。
 */
export async function createClient() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_TOKEN_COOKIE)?.value;

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: accessToken
        ? {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        : undefined,
    }
  );
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return isAllowedUser(user) ? user : null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("auth_required");
  }
  return user;
}
