"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { syncAuthCookie } from "@/lib/auth/browserSession";

export function SignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    syncAuthCookie(null);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={signingOut}
      aria-label="ログアウト"
      title="ログアウト"
      className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <LogOut size={16} />
    </button>
  );
}
