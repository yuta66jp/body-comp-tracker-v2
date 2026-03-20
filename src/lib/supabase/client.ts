import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Browser-side Supabase client (Client Components / SWR hooks 用).
 *
 * anon key ベースで動作するため RLS ポリシーが適用される。
 * このアプリは個人用・非公開運用を前提としており Supabase Auth は未導入。
 * 権限制御は RLS ポリシー（supabase/migrations/ で定義）が唯一の制御層となる。
 *
 * 権限設計の詳細は README.md「アクセス制御の前提」を参照。
 */
export function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
