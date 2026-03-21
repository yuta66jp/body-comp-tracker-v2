import type { Metadata } from "next";
// next/font/google ではなく geist npm パッケージ（SIL Open Font License）を使用する。
// build 時に外部フォント取得が不要となり、ネットワーク到達性に依存しない再現可能な build が実現できる。
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { NavBar } from "@/components/ui/NavBar";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";

export const metadata: Metadata = {
  title: "Body Composition Tracker",
  description: "コンテスト向け体重・栄養管理ダッシュボード",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <NavBar />
        {/* モバイル向け下部タブバー分の余白: タブバー高 56px + Safe Area 最大 ~40px = pb-24 で吸収 */}
        <div className="mx-auto max-w-screen-xl px-4 pb-24 md:pb-0">
          {children}
        </div>
        <MobileBottomNav />
      </body>
    </html>
  );
}
