import { defineConfig, devices } from "@playwright/test";

/**
 * E2E テスト設定。
 *
 * ## webServer の使い分け
 * - ローカル: `next dev` を自動起動。既存サーバーを再利用可能。
 * - CI: `next start` を使用。ビルド済み `.next` が必要なため CI ワークフローで先に build を実行すること。
 *
 * ## テスト種別
 * - smoke tests (e2e/smoke.spec.ts): 主要ページの表示確認。読み取り専用で CI でも安全に実行可能。
 * - write-flows (e2e/write-flows.spec.ts): 保存系フロー。E2E_WRITE_TESTS=true かつテスト用 Supabase 環境が必要。
 *   デフォルトではスキップ（本番データへの書き込みを避けるため）。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // CI では next start (ビルド済み前提)、ローカルでは next dev
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
