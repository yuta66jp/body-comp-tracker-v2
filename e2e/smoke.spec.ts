/**
 * smoke.spec.ts — 主要ページ表示確認 (smoke tests)
 *
 * 読み取り専用。Supabase への書き込みは行わない。
 * CI でも安全に実行可能。
 *
 * ## 確認内容
 * - 未認証時はログイン画面が表示される
 * - E2E_AUTH_EMAIL / E2E_AUTH_PASSWORD がある場合はログイン後に主要ページを確認する
 * - 主要ページが HTTP 500 / "Application error" なしにロードできる
 * - NavBar (ナビゲーション) が表示される
 * - ページ固有の見出しが表示される
 * - NavBar リンクから設定ページへの遷移が動作する
 *
 * ## データ依存
 * DB が空でもテストは通る（graceful degradation を前提とした設計のため）。
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const E2E_AUTH_EMAIL = process.env.E2E_AUTH_EMAIL;
const E2E_AUTH_PASSWORD = process.env.E2E_AUTH_PASSWORD;
const HAS_AUTH = Boolean(E2E_AUTH_EMAIL && E2E_AUTH_PASSWORD);

// ナビゲーションリンク名と URL の対応 (NavBar.tsx の NAV_ITEMS に準拠)
const MAIN_PAGES = [
  { path: "/",        navLabel: "ダッシュボード" },
  { path: "/history", navLabel: "履歴" },
  { path: "/settings",navLabel: "設定" },
  { path: "/tdee",    navLabel: "TDEE" },
  { path: "/macro",   navLabel: "栄養" },
] as const;

async function loginIfConfigured(page: Page): Promise<boolean> {
  await page.goto("/");

  if (!HAS_AUTH) {
    await expect(page.getByRole("heading", { name: "ログイン", exact: true })).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toBeVisible();
    await expect(page.getByLabel("パスワード")).toBeVisible();
    return false;
  }

  await page.getByLabel("メールアドレス").fill(E2E_AUTH_EMAIL!);
  await page.getByLabel("パスワード").fill(E2E_AUTH_PASSWORD!);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.locator("nav").first()).toBeVisible();
  return true;
}

for (const { path, navLabel } of MAIN_PAGES) {
  test(`${navLabel} ページが表示できる (${path})`, async ({ page }) => {
    const authenticated = await loginIfConfigured(page);
    if (!authenticated) return;

    await page.goto(path);

    // layout.tsx には desktop NavBar と mobile bottom nav の 2 つの nav がある。
    // Desktop Chrome project では先頭の desktop NavBar が表示されることを確認する。
    await expect(page.locator("nav").first()).toBeVisible();

    // Next.js の Application error ページが出ていないこと
    await expect(page.getByText("Application error")).not.toBeVisible();
  });
}

test("設定ページ: 設定セクションが表示できる", async ({ page }) => {
  test.skip(!HAS_AUTH, "認証済み画面の smoke には E2E_AUTH_EMAIL / E2E_AUTH_PASSWORD が必要");

  await loginIfConfigured(page);
  await page.goto("/settings");

  // h1 "設定" が表示される
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();

  // 現在の SettingsForm セクション見出しが表示される
  await expect(page.getByRole("heading", { name: "シーズン・コンテスト", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "目標・身体情報", exact: true })).toBeVisible();
});

test("NavBar リンクからダッシュボード → 設定ページへ遷移できる", async ({ page }) => {
  test.skip(!HAS_AUTH, "認証済み画面の smoke には E2E_AUTH_EMAIL / E2E_AUTH_PASSWORD が必要");

  await loginIfConfigured(page);

  // NavBar の「設定」リンクをクリック
  await page.getByRole("link", { name: "設定" }).click();
  await page.waitForURL("/settings");

  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
});
