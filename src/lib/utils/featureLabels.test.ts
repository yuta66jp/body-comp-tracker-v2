import {
  ACTIVE_FEATURE_NAMES,
  getFeatureLabel, FEATURE_LABEL_MAP,
  getFeatureDirection, FEATURE_DIRECTION_MAP,
  getFeatureNote, FEATURE_NOTE_MAP,
  getFeatureHint, FEATURE_HINT_MAP,
} from "./featureLabels";

describe("ACTIVE_FEATURE_NAMES", () => {
  it("重複がない", () => {
    expect(new Set(ACTIVE_FEATURE_NAMES).size).toBe(ACTIVE_FEATURE_NAMES.length);
  });

  it("空でない", () => {
    expect(ACTIVE_FEATURE_NAMES.length).toBeGreaterThan(0);
  });
});

describe("FEATURE_LABEL_MAP", () => {
  it("アクティブ特徴量がすべて登録されている", () => {
    for (const key of ACTIVE_FEATURE_NAMES) {
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

// ════════════════════════════════════════════════════════════════════════════
// getFeatureDirection / getFeatureNote
// ════════════════════════════════════════════════════════════════════════════

describe("FEATURE_DIRECTION_MAP", () => {
  it("アクティブ特徴量がすべて登録されている", () => {
    for (const key of ACTIVE_FEATURE_NAMES) {
      expect(FEATURE_DIRECTION_MAP[key]).toBeDefined();
    }
  });
});

describe("getFeatureDirection", () => {
  it("登録済みキーは文字列を返す", () => {
    expect(typeof getFeatureDirection("cal_lag1")).toBe("string");
  });

  it("未登録キーは null を返す", () => {
    expect(getFeatureDirection("unknown_xyz")).toBeNull();
  });
});

describe("FEATURE_NOTE_MAP", () => {
  it("アクティブ特徴量がすべて登録されている", () => {
    for (const key of ACTIVE_FEATURE_NAMES) {
      expect(FEATURE_NOTE_MAP[key]).toBeDefined();
    }
  });
});

describe("getFeatureNote", () => {
  it("登録済みキーは文字列を返す", () => {
    expect(typeof getFeatureNote("cal_lag1")).toBe("string");
  });

  it("未登録キーは null を返す", () => {
    expect(getFeatureNote("unknown_xyz")).toBeNull();
  });
});

describe("FEATURE_HINT_MAP", () => {
  it("アクティブ特徴量がすべて登録されている", () => {
    for (const key of ACTIVE_FEATURE_NAMES) {
      expect(FEATURE_HINT_MAP[key]).toBeDefined();
    }
  });

  it("ヒント文は断定表現（〜です。〜ます。のみ）ではなく可能性・示唆を含む", () => {
    const hedgePattern = /かもしれ|可能性|示唆|傾向|場合があ|ことがあ|てみてください|考えられ/;
    for (const hint of Object.values(FEATURE_HINT_MAP)) {
      expect(hint).toMatch(hedgePattern);
    }
  });
});

describe("getFeatureHint", () => {
  it("登録済みキーは文字列を返す", () => {
    expect(typeof getFeatureHint("cal_lag1")).toBe("string");
  });

  it("未登録キーは null を返す", () => {
    expect(getFeatureHint("unknown_xyz")).toBeNull();
  });
});
