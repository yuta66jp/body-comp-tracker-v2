import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createServiceRoleClient() {
  if (typeof window !== "undefined") {
    throw new Error("supabase_service_role_server_only");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_service_role_env_missing");
  }

  return createSupabaseClient<Database>(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
