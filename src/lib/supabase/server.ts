import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server-side Supabase client (SSR / Server Components / Route Handlers 用).
 *
 * このクライアントは anon key ベースで動作するため、RLS ポリシーが適用される。
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
export function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
