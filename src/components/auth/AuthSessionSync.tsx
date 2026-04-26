"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { refreshAuthCookie } from "@/lib/auth/browserSession";

export function AuthSessionSync() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void refreshAuthCookie().then((synced) => {
      if (synced && !cancelled) router.refresh();
    });

    const intervalId = window.setInterval(() => {
      void refreshAuthCookie();
    }, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [router]);

  return null;
}
