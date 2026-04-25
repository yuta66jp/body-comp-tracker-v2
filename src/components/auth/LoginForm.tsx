"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isAllowedUserEmail } from "@/lib/auth/session";
import { syncAuthCookie } from "@/lib/auth/browserSession";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!isAllowedUserEmail(normalizedEmail)) {
      setError("このメールアドレスは許可されていません。");
      setSubmitting(false);
      return;
    }

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError || !data.session) {
      setError("ログインに失敗しました。メールアドレスとパスワードを確認してください。");
      setSubmitting(false);
      return;
    }

    syncAuthCookie(data.session);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
          <span className="text-sm font-black tracking-tight text-white">BC</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">ログイン</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          個人データを保護するため、登録済みアカウントでログインしてください。
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            メールアドレス
          </span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            パスワード
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
          />
        </label>

        {error && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}
