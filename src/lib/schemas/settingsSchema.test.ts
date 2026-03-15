import { parseSettings } from "./settingsSchema";
import type { SettingsInput } from "./settingsSchema";

// ─── 正常系 ─────────────────────────────────────────────────────────────────

describe("parseSettings — 正常系", () => {
  it("有効な contest_date (YYYY-MM-DD) が通る", () => {
    const result = parseSettings({ contest_date: "2026-11-01" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "contest_date");
    expect(rec).toBeDefined();
    expect(rec!.value_str).toBe("2026-11-01");
    expect(rec!.value_num).toBeNull();
  });

  it("有効な target_weight (数値) が通る", () => {
    const result = parseSettings({ goal_weight: "62.5" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "goal_weight");
    expect(rec).toBeDefined();
    expect(rec!.value_num).toBeCloseTo(62.5);
    expect(rec!.value_str).toBeNull();
  });

  it("全フィールド省略でも通る（全キーが null レコードとして生成される）", () => {
    // parseSettings は部分更新関数ではなく全項目保存関数。
    // 省略フィールドは null として records に積まれ DB で上書きされる。
    const result = parseSettings({});
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

  it("一部キーだけ渡しても残りのキーは null レコードとして生成される（全キー上書き）", () => {
    // 「goal_weight だけ更新したい」と思って一部キーだけ渡しても、
    // 他の全キーが null で upsert され既存値が消えることを明示するテスト。
    // parseSettings は partial update ではなく full-save 関数である。
    const result = parseSettings({ goal_weight: "65.0" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // goal_weight は正しく設定される
    const gw = result.records.find((r) => r.key === "goal_weight");
    expect(gw!.value_num).toBe(65.0);
    // 渡していない contest_date は null レコードとして生成されている（上書き対象になる）
    const cd = result.records.find((r) => r.key === "contest_date");
    expect(cd!.value_str).toBeNull();
    // 渡していない height_cm も null レコードとして生成されている
    const hc = result.records.find((r) => r.key === "height_cm");
    expect(hc!.value_num).toBeNull();
  });

  it("空文字列フィールドは null として保存される", () => {
    const result = parseSettings({ goal_weight: "", contest_date: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gw = result.records.find((r) => r.key === "goal_weight");
    const cd = result.records.find((r) => r.key === "contest_date");
    expect(gw!.value_num).toBeNull();
    expect(cd!.value_str).toBeNull();
  });

  it("有効な current_phase (Cut) が通る", () => {
    const result = parseSettings({ current_phase: "Cut" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "current_phase");
    expect(rec!.value_str).toBe("Cut");
  });

  it("有効な current_phase (Bulk) が通る", () => {
    const result = parseSettings({ current_phase: "Bulk" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "current_phase");
    expect(rec!.value_str).toBe("Bulk");
  });

  it("activity_factor の境界値 (1.2) が通る", () => {
    const result = parseSettings({ activity_factor: "1.2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "activity_factor");
    expect(rec!.value_num).toBeCloseTo(1.2);
  });

  it("数値フィールドの前後空白が除去されて通る", () => {
    const result = parseSettings({ height_cm: "  170  " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "height_cm");
    expect(rec!.value_num).toBe(170);
  });

  it("current_season は任意の文字列が通る", () => {
    const result = parseSettings({ current_season: "2026_TokyoNovice" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "current_season");
    expect(rec!.value_str).toBe("2026_TokyoNovice");
  });
});

// ─── 異常系 ─────────────────────────────────────────────────────────────────

describe("parseSettings — 異常系", () => {
  it("contest_date が不正な日付形式で失敗する", () => {
    const result = parseSettings({ contest_date: "2026/11/01" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "contest_date");
    expect(err).toBeDefined();
  });

  it("contest_date が存在しない日付で失敗する", () => {
    const result = parseSettings({ contest_date: "2026-02-30" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "contest_date");
    expect(err).toBeDefined();
  });

  it("target_weight (goal_weight) が負数で失敗する", () => {
    const result = parseSettings({ goal_weight: "-5" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "goal_weight");
    expect(err).toBeDefined();
    expect(err!.message).toContain("20〜200");
  });

  it("文字列を数値フィールドに渡して失敗する", () => {
    const result = parseSettings({ height_cm: "not_a_number" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "height_cm");
    expect(err).toBeDefined();
    expect(err!.message).toContain("数値");
  });

  it("activity_factor が範囲外 (1.1) で失敗する", () => {
    const result = parseSettings({ activity_factor: "1.1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "activity_factor");
    expect(err).toBeDefined();
    expect(err!.message).toContain("1.2〜2.5");
  });

  it("target_calories_kcal が範囲外 (100) で失敗する", () => {
    const result = parseSettings({ target_calories_kcal: "100" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "target_calories_kcal");
    expect(err).toBeDefined();
  });

  it("current_phase が不正な値で失敗する", () => {
    const result = parseSettings({ current_phase: "Maintain" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "current_phase");
    expect(err).toBeDefined();
  });

  it("sex が不正な値で失敗する", () => {
    const result = parseSettings({ sex: "unknown" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors.find((e) => e.field === "sex");
    expect(err).toBeDefined();
  });

  it("複数フィールドが不正な場合、全エラーが返される", () => {
    const input: SettingsInput = {
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
    const result = parseSettings({ age: "30" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "age");
    expect(rec!.value_num).toBe(30);
    expect(rec!.value_str).toBeNull();
  });

  it("文字列フィールドは value_str に保存され value_num は null になる", () => {
    const result = parseSettings({ contest_date: "2026-11-01" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.records.find((r) => r.key === "contest_date");
    expect(rec!.value_str).toBe("2026-11-01");
    expect(rec!.value_num).toBeNull();
  });

  it("全キーのレコードが生成される", () => {
    const result = parseSettings({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const keys = result.records.map((r) => r.key);
    // 数値系 9 キー + 文字列系 4 キー = 13 キー
    expect(keys).toHaveLength(13);
    expect(keys).toContain("goal_weight");
    expect(keys).toContain("contest_date");
    expect(keys).toContain("current_phase");
    expect(keys).toContain("sex");
    expect(keys).toContain("current_season");
  });
});
