import { mapToAppSettings } from "./settings";
import type { AppSettings } from "./settings";

// ─── テストデータ ────────────────────────────────────────────────────────────

const fullRows = [
  { key: "contest_date",        value_num: null,   value_str: "2025-09-07" },
  { key: "current_season",      value_num: null,   value_str: "2025_Summer" },
  { key: "current_phase",       value_num: null,   value_str: "Cut" },
  { key: "sex",                 value_num: null,   value_str: "male" },
  { key: "goal_weight",         value_num: 70.5,   value_str: null },
  { key: "monthly_target",      value_num: 72.0,   value_str: null },
  { key: "target_calories_kcal",value_num: 2200,   value_str: null },
  { key: "target_protein_g",    value_num: 160,    value_str: null },
  { key: "target_fat_g",        value_num: 60,     value_str: null },
  { key: "target_carbs_g",      value_num: 200,    value_str: null },
  { key: "age",                 value_num: 30,     value_str: null },
  { key: "height_cm",           value_num: 175,    value_str: null },
  { key: "activity_factor",     value_num: 1.55,   value_str: null },
];

// ─── 正常系 ──────────────────────────────────────────────────────────────────

describe("mapToAppSettings — 正常系", () => {
  let result: AppSettings;

  beforeEach(() => {
    result = mapToAppSettings(fullRows);
  });

  test("全キーが揃った rows を正しく変換できる", () => {
    expect(result.contestDate).toBe("2025-09-07");
    expect(result.currentSeason).toBe("2025_Summer");
    expect(result.currentPhase).toBe("Cut");
    expect(result.gender).toBe("male");
    expect(result.targetWeight).toBe(70.5);
    expect(result.monthlyTarget).toBe(72.0);
    expect(result.goalCalories).toBe(2200);
    expect(result.proteinTarget).toBe(160);
    expect(result.fatTarget).toBe(60);
    expect(result.carbsTarget).toBe(200);
    expect(result.age).toBe(30);
    expect(result.height).toBe(175);
    expect(result.activityFactor).toBe(1.55);
  });

  test("value_num フィールドが number 型として返る", () => {
    expect(typeof result.targetWeight).toBe("number");
    expect(typeof result.goalCalories).toBe("number");
    expect(typeof result.age).toBe("number");
    expect(typeof result.height).toBe("number");
    expect(typeof result.activityFactor).toBe("number");
  });

  test("value_str フィールドが string 型として返る", () => {
    expect(typeof result.contestDate).toBe("string");
    expect(typeof result.currentSeason).toBe("string");
    expect(typeof result.currentPhase).toBe("string");
    expect(typeof result.gender).toBe("string");
  });
});

// ─── 欠損系 ──────────────────────────────────────────────────────────────────

describe("mapToAppSettings — 欠損系", () => {
  test("キーが存在しない場合は null を返す", () => {
    const result = mapToAppSettings([
      { key: "goal_weight", value_num: 70.0, value_str: null },
    ]);
    // 存在するキー
    expect(result.targetWeight).toBe(70.0);
    // 存在しないキー
    expect(result.contestDate).toBeNull();
    expect(result.currentSeason).toBeNull();
    expect(result.currentPhase).toBeNull();
    expect(result.gender).toBeNull();
    expect(result.monthlyTarget).toBeNull();
    expect(result.goalCalories).toBeNull();
    expect(result.proteinTarget).toBeNull();
    expect(result.fatTarget).toBeNull();
    expect(result.carbsTarget).toBeNull();
    expect(result.age).toBeNull();
    expect(result.height).toBeNull();
    expect(result.activityFactor).toBeNull();
  });

  test("空配列を渡すと全フィールドが null の AppSettings を返す", () => {
    const result = mapToAppSettings([]);
    const entries = Object.entries(result) as [keyof AppSettings, unknown][];
    for (const [, value] of entries) {
      expect(value).toBeNull();
    }
  });
});

// ─── 不正値系 ────────────────────────────────────────────────────────────────

describe("mapToAppSettings — 不正値系", () => {
  test("value_num に NaN が入っている場合は null を返す", () => {
    const result = mapToAppSettings([
      { key: "goal_weight", value_num: NaN, value_str: null },
    ]);
    expect(result.targetWeight).toBeNull();
  });

  test("value_num に Infinity が入っている場合は null を返す", () => {
    const result = mapToAppSettings([
      { key: "height_cm", value_num: Infinity, value_str: null },
    ]);
    expect(result.height).toBeNull();
  });

  test("不明なキーは無視される（結果に影響を与えない）", () => {
    const result = mapToAppSettings([
      { key: "unknown_key_xyz", value_num: 999, value_str: "ignore_me" },
      { key: "goal_weight",     value_num: 70.0, value_str: null },
    ]);
    expect(result.targetWeight).toBe(70.0);
    // 不明キーは AppSettings のどのフィールドにも反映されない
    expect(result.contestDate).toBeNull();
    expect(result.currentSeason).toBeNull();
  });
});
