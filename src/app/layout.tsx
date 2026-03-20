import type { Metadata } from "next";
// next/font/google ではなく geist npm パッケージ（SIL Open Font License）を使用する。
// build 時に外部フォント取得が不要となり、ネットワーク到達性に依存しない再現可能な build が実現できる。
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { NavBar } from "@/components/ui/NavBar";

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
        <div className="mx-auto max-w-screen-xl px-4">
          {children}
        </div>
      </body>
    </html>
  );
}
