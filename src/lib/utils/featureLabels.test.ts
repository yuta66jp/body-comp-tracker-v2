import { getFeatureLabel, FEATURE_LABEL_MAP } from "./featureLabels";

describe("FEATURE_LABEL_MAP", () => {
  it("現在の XGBoost 特徴量がすべて登録されている", () => {
    const currentFeatures = ["cal_lag1", "rolling_cal_7", "p_lag1", "f_lag1", "c_lag1"];
    for (const key of currentFeatures) {
      expect(FEATURE_LABEL_MAP[key]).toBeDefined();
    }
  });

  it("内部名が値として露出していない（_lag1 / _ などの接尾辞を含む値がない）", () => {
    for (const label of Object.values(FEATURE_LABEL_MAP)) {
      expect(label).not.toMatch(/_lag\d/);
      expect(label).not.toMatch(/rolling_/);
    }
  });
});

describe("getFeatureLabel", () => {
  it("FEATURE_LABEL_MAP に登録済みのキーを返す", () => {
    expect(getFeatureLabel("cal_lag1")).toBe("摂取 kcal（当日）");
    expect(getFeatureLabel("p_lag1")).toBe("タンパク質（g）");
    expect(getFeatureLabel("sleep_hours")).toBe("睡眠時間（h）");
  });

  it("マップ優先 — fallbackLabel があってもマップ値を使う", () => {
    expect(getFeatureLabel("cal_lag1", "古いラベル")).toBe("摂取 kcal（当日）");
  });

  it("未登録キー + fallbackLabel → fallbackLabel を返す", () => {
    expect(getFeatureLabel("unknown_feature", "バックエンドラベル")).toBe("バックエンドラベル");
  });

  it("未登録キー + fallbackLabel なし → キーをそのまま返す（表示崩れしない）", () => {
    expect(getFeatureLabel("unknown_feature")).toBe("unknown_feature");
  });

  it("空文字キーは空文字の fallback を使う", () => {
    expect(getFeatureLabel("", "フォールバック")).toBe("フォールバック");
  });

  it("boolean 系ラベルに単位や括弧が含まれない", () => {
    const boolKeys = ["had_bowel_movement", "is_cheat_day", "leg_flag", "is_poor_sleep"];
    for (const key of boolKeys) {
      const label = getFeatureLabel(key);
      expect(label).not.toMatch(/[（(]/);
    }
  });

  it("numeric 系のうち kcal / g / h を持つ項目は単位が含まれる", () => {
    expect(getFeatureLabel("cal_lag1")).toContain("kcal");
    expect(getFeatureLabel("rolling_cal_7")).toContain("kcal");
    expect(getFeatureLabel("p_lag1")).toContain("g");
    expect(getFeatureLabel("f_lag1")).toContain("g");
    expect(getFeatureLabel("c_lag1")).toContain("g");
    expect(getFeatureLabel("sleep_hours")).toContain("h");
  });
});
