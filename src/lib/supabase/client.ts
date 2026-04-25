import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Browser-side Supabase client (Client Components / SWR hooks 用).
 *
 * anon key + Supabase Auth session ベースで動作するため RLS ポリシーが適用される。
 * 権限制御は RLS ポリシー（supabase/migrations/ で定義）が制御層となる。
 *
 * 権限設計の詳細は docs/security-single-user-auth.md を参照。
 */
export function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
