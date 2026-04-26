"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { refreshAuthCookie } from "@/lib/auth/browserSession";

export function AuthSessionSync() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const refreshAndResync = async () => {
      await refreshAuthCookie();
      if (!cancelled) router.refresh();
    };

    void refreshAndResync();

    const intervalId = window.setInterval(() => {
      void refreshAndResync();
    }, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [router]);

  return null;
}
