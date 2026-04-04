import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unzipper と sax は Node.js 専用パッケージ。
  // Next.js のバンドラーに含めると unzipper が @aws-sdk/client-s3 を解決しようとするため、
  // serverExternalPackages でランタイム require に委譲する。
  serverExternalPackages: ["unzipper", "sax"],
};

export default nextConfig;
