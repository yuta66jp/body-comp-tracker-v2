import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// 料理を書き込むため、明示実行かつローカルSupabaseに限定する。
const enabled = process.env.E2E_RECIPE_TESTS === "true";
const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const localDb = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(dbUrl);
test.beforeEach(() => {
  test.skip(!enabled, "E2E_RECIPE_TESTS=true とローカルSupabaseで実行する");
  expect(localDb, "料理の書き込みE2EはローカルDB限定").toBe(true);
  expect(process.env.E2E_AUTH_EMAIL).toBeTruthy();
  expect(process.env.E2E_AUTH_PASSWORD).toBeTruthy();
  expect(process.env.E2E_RECIPE_FOOD_NAME).toBeTruthy();
});

for (const [label, width, height, date] of [["PC", 1280, 900, "2098-01-01"], ["スマートフォン", 390, 844, "2098-01-02"]] as const) {
  test(`${label}: 料理管理から食数変更・日次合計保存まで`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const recipeName = `料理E2E-${label}-${Date.now()}`;
    const copiedName = `${recipeName}-複製`;
    const foodName = process.env.E2E_RECIPE_FOOD_NAME!;
    const client = createClient(dbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await client.auth.signInWithPassword({ email: process.env.E2E_AUTH_EMAIL!, password: process.env.E2E_AUTH_PASSWORD! });
    expect(authError).toBeNull();
    // CSPがローカルSupabaseへのブラウザ接続を許可しないため、既存APIでセッションを設定する。
    const sessionResponse = await page.request.post("/api/auth/session", { data: {
      accessToken: auth.session!.access_token,
      refreshToken: auth.session!.refresh_token,
      expiresAt: auth.session!.expires_at,
    } });
    expect(sessionResponse.ok()).toBe(true);
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "食事・体重を記録する" })).toBeVisible();
    await page.goto("/foods");
    await page.getByRole("button", { name: "新規料理" }).click();
    await page.getByLabel("料理名", { exact: true }).fill(recipeName);
    await page.getByLabel("追加する材料").selectOption(foodName);
    await page.getByLabel("使用量 (g)", { exact: true }).fill("150.5");
    await page.getByRole("button", { name: "材料を追加" }).click();
    await page.getByLabel("メモ（任意）").fill("1食分の検証メモ");
    await page.getByRole("button", { name: "料理を保存" }).click();
    await expect(page.getByText("料理を保存しました", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `${recipeName}を編集`, exact: true }).click();
    await page.getByLabel(`${foodName}の使用量`, { exact: true }).fill("200");
    await page.getByRole("button", { name: "料理を保存" }).click();
    await expect(page.getByRole("button", { name: `${recipeName}を複製`, exact: true })).toBeEnabled();
    await page.getByRole("button", { name: `${recipeName}を複製`, exact: true }).click();
    await expect(page.getByLabel(`${foodName}の使用量`, { exact: true })).toHaveValue("200");
    await page.getByLabel("料理名", { exact: true }).fill(copiedName);
    await page.getByRole("button", { name: "料理を保存" }).click();
    await page.getByRole("button", { name: `${copiedName}を非表示`, exact: true }).click();
    await expect(page.getByRole("button", { name: `${copiedName}を編集`, exact: true })).toHaveCount(0);
    await page.getByLabel("非表示の料理を表示").check();
    await page.getByRole("button", { name: `${copiedName}を再表示`, exact: true }).click();
    await expect(page.getByRole("button", { name: `${copiedName}を非表示`, exact: true })).toBeEnabled();
    await page.getByLabel("料理名で検索", { exact: true }).fill(copiedName);
    await page.locator("#recipes").screenshot({ path: testInfo.outputPath(`recipes-${width}.png`) });
    await expect(page.getByRole("heading", { name: "食品マスタ", exact: true })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "セットメニュー", exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.goto("/");
    await page.getByRole("button", { name: "食事・体重を記録する" }).click();
    const dialog = page.getByRole("dialog", { name: "食事・体重ログ入力" });
    await dialog.getByLabel("日付", { exact: true }).fill(date);
    await dialog.getByLabel("体重 (kg)", { exact: true }).fill("70");
    await dialog.getByRole("button", { name: "食品を追加", exact: true }).click();
    await dialog.getByRole("tab", { name: "料理", exact: true }).click();
    await dialog.getByLabel("記録する料理を検索").fill(copiedName);
    await dialog.getByRole("button", { name: `${copiedName}を1食追加`, exact: true }).click();
    await dialog.getByLabel(`${copiedName}の食数`, { exact: true }).fill("0");
    await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
    await dialog.getByLabel(`${copiedName}の食数`, { exact: true }).fill("0.5");
    await expect(dialog.getByText("100 kcal · P 20g F 1g C 0g", { exact: true })).toBeVisible();
    await dialog.getByLabel(`${copiedName}の食数`, { exact: true }).fill("1.5");
    await dialog.getByRole("tab", { name: "単品", exact: true }).click();
    await dialog.getByPlaceholder("食品名で検索...").fill(foodName);
    await dialog.getByRole("button", { name: `${foodName}を追加`, exact: true }).click();
    await dialog.screenshot({ path: testInfo.outputPath(`cart-${width}.png`) });
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const { data: log, error } = await client.from("daily_logs").select("calories,protein,fat,carbs").eq("log_date", date).single();
    expect(error).toBeNull();
    expect(log).toEqual({ calories: 400, protein: 80, fat: 4, carbs: 0 });
    await page.goto("/foods");
    await page.getByRole("button", { name: `${copiedName}を編集`, exact: true }).click();
    await page.getByLabel(`${foodName}の使用量`, { exact: true }).fill("300");
    await page.getByRole("button", { name: "料理を保存" }).click();
    await expect(page.getByText("料理を保存しました", { exact: true })).toBeVisible();
    const { data: unchanged } = await client.from("daily_logs").select("calories,protein,fat,carbs").eq("log_date", date).single();
    expect(unchanged).toEqual(log);
    await page.goto("/");
    await page.getByRole("button", { name: "食事・体重を記録する" }).click();
    await page.getByLabel("日付", { exact: true }).fill(date);
    await expect(page.getByText("記録済みマクロ:", { exact: true })).toBeVisible();
    await expect(page.getByLabel(`${copiedName}の食数`, { exact: true })).toHaveCount(0);
    await client.auth.signOut();
  });
}
