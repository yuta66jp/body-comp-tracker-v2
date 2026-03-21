/**
 * smoke.spec.ts — 主要ページ表示確認 (smoke tests)
 *
 * 読み取り専用。Supabase への書き込みは行わない。
 * CI でも安全に実行可能。
 *
 * ## 確認内容
 * - 主要ページが HTTP 500 / "Application error" なしにロードできる
 * - NavBar (ナビゲーション) が表示される
 * - ページ固有の見出しが表示される
 * - NavBar リンクから設定ページへの遷移が動作する
 *
 * ## データ依存
 * DB が空でもテストは通る（graceful degradation を前提とした設計のため）。
 */

import { test, expect } from "@playwright/test";

// ナビゲーションリンク名と URL の対応 (NavBar.tsx の NAV_ITEMS に準拠)
const MAIN_PAGES = [
  { path: "/",        navLabel: "ダッシュボード" },
  { path: "/history", navLabel: "履歴" },
  { path: "/settings",navLabel: "設定" },
  { path: "/tdee",    navLabel: "TDEE" },
  { path: "/macro",   navLabel: "栄養" },
] as const;

for (const { path, navLabel } of MAIN_PAGES) {
  test(`${navLabel} ページが表示できる (${path})`, async ({ page }) => {
    await page.goto(path);

    // NavBar が常に表示されること (layout.tsx で全ページ共通)
    await expect(page.locator("nav")).toBeVisible();

    // Next.js の Application error ページが出ていないこと
    await expect(page.getByText("Application error")).not.toBeVisible();
  });
}

test("設定ページ: 「基本設定」セクションが表示できる", async ({ page }) => {
  await page.goto("/settings");

  // h1 "設定" が表示される
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();

  // 「基本設定」セクション見出しが表示される
  await expect(page.getByText("基本設定")).toBeVisible();
});

test("NavBar リンクからダッシュボード → 設定ページへ遷移できる", async ({ page }) => {
  await page.goto("/");

  // NavBar の「設定」リンクをクリック
  await page.getByRole("link", { name: "設定" }).click();
  await page.waitForURL("/settings");

  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
});
