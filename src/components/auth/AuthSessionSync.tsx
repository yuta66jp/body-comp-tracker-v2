"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { syncAuthCookie } from "@/lib/auth/browserSession";

export function AuthSessionSync() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await syncAuthCookie(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncAuthCookie(session).then(() => {
        router.refresh();
      });
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
