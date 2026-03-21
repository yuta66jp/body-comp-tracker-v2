/**
 * write-flows.spec.ts — 保存系フロー E2E テスト
 *
 * ⚠️  デフォルトではスキップ。本番データへの書き込みを防ぐため。
 *
 * ## 実行方法
 * ```
 * E2E_WRITE_TESTS=true npx playwright test e2e/write-flows.spec.ts
 * ```
 *
 * ## 前提条件
 * - NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を
 *   **テスト専用 Supabase プロジェクト** に向けること。
 *   本番 DB を指定すると TEST_LOG_DATE のレコードが書き込まれ、テスト後に削除される。
 *
 * ## 対象シナリオ
 * 1. 日次ログを 1 件保存できる (MealLogger — 体重のみ)
 * 2. 設定を保存できる (SettingsForm — current_season を更新)
 */

import { test, expect, request as playwrightRequest } from "@playwright/test";

/** テスト専用の日付。実データと衝突しにくい遠未来日を使用する。 */
const TEST_LOG_DATE = "2099-12-31";

/** テスト実行後に Supabase REST API で test レコードを削除する */
async function cleanupTestLog() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;

  const ctx = await playwrightRequest.newContext();
  await ctx.delete(`${url}/rest/v1/daily_logs?log_date=eq.${TEST_LOG_DATE}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
    },
  });
  await ctx.dispose();
}

// E2E_WRITE_TESTS=true でない限りこのファイルの全テストをスキップする
test.beforeEach(() => {
  if (!process.env.E2E_WRITE_TESTS) {
    test.skip(true, "Skipped by default. Set E2E_WRITE_TESTS=true with a test Supabase instance to run.");
  }
});

test.describe("日次ログ保存", () => {
  test.afterEach(async () => {
    await cleanupTestLog();
  });

  test("体重を入力して保存すると「保存しました」が表示される", async ({ page }) => {
    await page.goto("/");

    // ダッシュボードは DashboardLayout で MealLogger をサイドバー (lg:block) に表示する。
    // Desktop Chrome (1280px) では sidebar が表示される。
    // 体重入力欄は placeholder="70.5" で識別する。
    const weightInput = page.getByPlaceholder("70.5").first();
    await expect(weightInput).toBeVisible();

    // テスト専用の日付に変更して既存データと衝突しないようにする
    const dateInput = page.getByLabel("日付").first();
    await dateInput.fill(TEST_LOG_DATE);

    // 体重を入力（touched フラグが立ち、保存ボタンが有効になる）
    await weightInput.fill("65.0");

    // 保存ボタンをクリック
    const saveBtn = page.getByRole("button", { name: "保存" }).first();
    await saveBtn.click();

    // 成功メッセージが表示されること
    await expect(page.getByText("保存しました")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("設定保存", () => {
  test("current_season を更新して保存すると「保存しました」が表示される", async ({ page }) => {
    await page.goto("/settings");

    // 「現在のシーズン」は text input (placeholder: "2026_TokyoNovice")
    const seasonInput = page.getByPlaceholder("2026_TokyoNovice");
    await expect(seasonInput).toBeVisible();

    // テスト用の値に書き換える
    await seasonInput.fill("E2E_Test_Season");

    // 保存ボタンをクリック
    const saveBtn = page.getByRole("button", { name: "保存" });
    await saveBtn.click();

    // 成功メッセージが表示されること
    await expect(page.getByText("保存しました")).toBeVisible({ timeout: 10_000 });
  });
});
