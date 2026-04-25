"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { syncAuthCookie } from "@/lib/auth/browserSession";

export function AuthSessionSync() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      syncAuthCookie(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncAuthCookie(session);
      router.refresh();
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
