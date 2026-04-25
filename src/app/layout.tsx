import type { Metadata } from "next";
// next/font/google ではなく geist npm パッケージ（SIL Open Font License）を使用する。
// build 時に外部フォント取得が不要となり、ネットワーク到達性に依存しない再現可能な build が実現できる。
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { NavBar } from "@/components/ui/NavBar";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { BottomSpacer } from "@/components/ui/BottomSpacer";
import { AuthSessionSync } from "@/components/auth/AuthSessionSync";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Body Composition Tracker",
  description: "コンテスト向け体重・栄養管理ダッシュボード",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="ja">
      {/* テーマ初期化スクリプト: レンダリング前に .dark クラスを適用し FOUC を防ぐ */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light')&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased dark:bg-slate-950`}
      >
        <AuthSessionSync />
        {user ? (
          <>
            <NavBar />
            <div className="mx-auto max-w-screen-xl px-4">
              {children}
              {/* モバイル向け下余白スペーサー (BottomSpacer) */}
              <BottomSpacer />
            </div>
            <MobileBottomNav />
          </>
        ) : (
          <LoginForm />
        )}
      </body>
    </html>
  );
}
