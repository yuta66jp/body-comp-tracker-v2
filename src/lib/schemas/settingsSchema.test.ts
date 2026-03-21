import { parseSettings, EMPTY_SETTINGS_INPUT } from "./settingsSchema";
import type { SettingsInput } from "./settingsSchema";

// ─── 正常系 ─────────────────────────────────────────────────────────────────

describe("parseSettings — 正常系", () => {
  it("有効な contest_date (YYYY-MM-DD) が通る", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, contest_date: "2026-11-01" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "contest_date");
    expect(rec).toBeDefined();
    expect(rec!.value_str).toBe("2026-11-01");
    expect(rec!.value_num).toBeNull();
  });

  it("有効な target_weight (数値) が通る", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, goal_weight: "62.5" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "goal_weight");
    expect(rec).toBeDefined();
    expect(rec!.value_num).toBeCloseTo(62.5);
    expect(rec!.value_str).toBeNull();
  });

  it("全フィールドが空文字で通る（全キーが null レコードとして生成される）", () => {
    // parseSettings は full-replace 関数。EMPTY_SETTINGS_INPUT (全フィールド "") を渡すと
    // 全キーが null として records に積まれ DB で上書きされる。
    const result = parseSettings(EMPTY_SETTINGS_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 全キー分のレコードが生成される
    expect(result.records.length).toBeGreaterThan(0);
    // 全て null
    for (const rec of result.records) {
      expect(rec.value_num).toBeNull();
      expect(rec.value_str).toBeNull();
    }
  });

  it("1 フィールドだけ有効値を入れると、他の全フィールドは null レコードになる（full-replace の意味論）", () => {
    // goal_weight だけ有効値。他フィールドはすべて "" (→ null) を渡している。
    // これは「goal_weight だけ更新する」partial update ではなく、
    // 「goal_weight = 65.0、他フィールド = null」として全件 upsert する。
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, goal_weight: "65.0" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // goal_weight は正しく設定される
    const gw = result.records.find((r) => r.key === "goal_weight");
    expect(gw!.value_num).toBe(65.0);
    // "" で渡した contest_date は null レコードとして生成されている（上書き対象）
    const cd = result.records.find((r) => r.key === "contest_date");
    expect(cd!.value_str).toBeNull();
    // "" で渡した height_cm も null レコードとして生成されている
    const hc = result.records.find((r) => r.key === "height_cm");
    expect(hc!.value_num).toBeNull();
  });

  it("空文字列フィールドは null として保存される", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, goal_weight: "", contest_date: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gw = result.records.find((r) => r.key === "goal_weight");
    const cd = result.records.find((r) => r.key === "contest_date");
    expect(gw!.value_num).toBeNull();
    expect(cd!.value_str).toBeNull();
  });

  it("有効な current_phase (Cut) が通る", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, current_phase: "Cut" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "current_phase");
    expect(rec!.value_str).toBe("Cut");
  });

  it("有効な current_phase (Bulk) が通る", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, current_phase: "Bulk" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "current_phase");
    expect(rec!.value_str).toBe("Bulk");
  });

  it("activity_factor の境界値 (1.2) が通る", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, activity_factor: "1.2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "activity_factor");
    expect(rec!.value_num).toBeCloseTo(1.2);
  });

  it("数値フィールドの前後空白が除去されて通る", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, height_cm: "  170  " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "height_cm");
    expect(rec!.value_num).toBe(170);
  });

  it("current_season は任意の文字列が通る", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, current_season: "2026_TokyoNovice" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "current_season");
    expect(rec!.value_str).toBe("2026_TokyoNovice");
  });
});

// ─── 異常系 ─────────────────────────────────────────────────────────────────

describe("parseSettings — 異常系", () => {
  it("contest_date が不正な日付形式で失敗する", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, contest_date: "2026/11/01" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "contest_date");
    expect(err).toBeDefined();
  });

  it("contest_date が存在しない日付で失敗する", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, contest_date: "2026-02-30" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "contest_date");
    expect(err).toBeDefined();
  });

  it("target_weight (goal_weight) が負数で失敗する", () => {
    // strict parser は負数を「数値でない」として拒否する（範囲チェックより前）
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, goal_weight: "-5" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "goal_weight");
    expect(err).toBeDefined();
    expect(err!.message).toContain("数値");
  });

  it("文字列を数値フィールドに渡して失敗する", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, height_cm: "not_a_number" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "height_cm");
    expect(err).toBeDefined();
    expect(err!.message).toContain("数値");
  });

  it("activity_factor が範囲外 (1.1) で失敗する", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, activity_factor: "1.1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "activity_factor");
    expect(err).toBeDefined();
    expect(err!.message).toContain("1.2〜2.5");
  });

  it("target_calories_kcal が範囲外 (100) で失敗する", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, target_calories_kcal: "100" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "target_calories_kcal");
    expect(err).toBeDefined();
  });

  it("current_phase が不正な値で失敗する", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, current_phase: "Maintain" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "current_phase");
    expect(err).toBeDefined();
  });

  it("sex が不正な値で失敗する", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, sex: "unknown" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "sex");
    expect(err).toBeDefined();
  });

  it("複数フィールドが不正な場合、全エラーが返される", () => {
    const input: SettingsInput = {
      ...EMPTY_SETTINGS_INPUT,
      goal_weight: "-100",
      contest_date: "not-a-date",
      current_phase: "Invalid",
    };
    const result = parseSettings(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain("goal_weight");
    expect(fields).toContain("contest_date");
    expect(fields).toContain("current_phase");
  });
});

// ─── DB レコード構造の検証 ──────────────────────────────────────────────────

describe("parseSettings — DB レコード構造", () => {
  it("数値フィールドは value_num に保存され value_str は null になる", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, age: "30" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "age");
    expect(rec!.value_num).toBe(30);
    expect(rec!.value_str).toBeNull();
  });

  it("文字列フィールドは value_str に保存され value_num は null になる", () => {
    const result = parseSettings({ ...EMPTY_SETTINGS_INPUT, contest_date: "2026-11-01" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "contest_date");
    expect(rec!.value_str).toBe("2026-11-01");
    expect(rec!.value_num).toBeNull();
  });

  it("全キーのレコードが生成される", () => {
    const result = parseSettings(EMPTY_SETTINGS_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const keys = result.records.map((r) => r.key);
    // 数値系 8 キー + 文字列系 5 キー = 13 キー
    expect(keys).toHaveLength(13);
    expect(keys).toContain("goal_weight");
    expect(keys).toContain("contest_date");
    expect(keys).toContain("current_phase");
    expect(keys).toContain("sex");
    expect(keys).toContain("current_season");
    expect(keys).toContain("monthly_plan_overrides");
  });
});

// ─── SettingsInput 型契約の検証 ───────────────────────────────────────────

describe("SettingsInput — 全フィールド必須の契約", () => {
  it("EMPTY_SETTINGS_INPUT は全 13 フィールドを持つ", () => {
    // SettingsInput が全フィールド必須であることを、
    // EMPTY_SETTINGS_INPUT の実際のキー数で確認する。
    // フィールドを追加/削除した場合はここも追従する。
    const keys = Object.keys(EMPTY_SETTINGS_INPUT);
    expect(keys).toHaveLength(13);
  });

  it("EMPTY_SETTINGS_INPUT の全フィールドが空文字", () => {
    for (const [, value] of Object.entries(EMPTY_SETTINGS_INPUT)) {
      expect(value).toBe("");
    }
  });

  it("SettingsForm パターン (全フィールドを ?? '' で渡す) で問題なく動作する", () => {
    // SettingsForm.tsx の handleSave が生成するパターン:
    // values[key] が undefined/null のとき ?? "" でフォールバックする。
    // この呼び出しパターンが SettingsInput 型を満たすことを確認する。
    const mockValues: Record<string, string> = {
      goal_weight: "65.0",
      activity_factor: "1.55",
      height_cm: "170",
      age: "30",
      target_calories_kcal: "2000",
      target_protein_g: "150",
      target_fat_g: "60",
      target_carbs_g: "200",
      current_season: "2026_TokyoNovice",
      current_phase: "Cut",
      sex: "male",
      contest_date: "2026-11-01",
      // monthly_plan_overrides: 未設定のケース
    };

    const input: SettingsInput = {
      goal_weight:             mockValues["goal_weight"] ?? "",
      activity_factor:         mockValues["activity_factor"] ?? "",
      height_cm:               mockValues["height_cm"] ?? "",
      age:                     mockValues["age"] ?? "",
      target_calories_kcal:    mockValues["target_calories_kcal"] ?? "",
      target_protein_g:        mockValues["target_protein_g"] ?? "",
      target_fat_g:            mockValues["target_fat_g"] ?? "",
      target_carbs_g:          mockValues["target_carbs_g"] ?? "",
      current_season:          mockValues["current_season"] ?? "",
      current_phase:           mockValues["current_phase"] ?? "",
      sex:                     mockValues["sex"] ?? "",
      contest_date:            mockValues["contest_date"] ?? "",
      monthly_plan_overrides:  mockValues["monthly_plan_overrides"] ?? "",
    };

    const result = parseSettings(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 有効値フィールドが正しく変換されている
    expect(result.records.find((r) => r.key === "goal_weight")?.value_num).toBe(65.0);
    expect(result.records.find((r) => r.key === "current_phase")?.value_str).toBe("Cut");
    // monthly_plan_overrides は "" → null
    expect(result.records.find((r) => r.key === "monthly_plan_overrides")?.value_str).toBeNull();
  });
});
