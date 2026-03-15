import {
  deriveLegFlag,
  isValidTrainingType,
  isValidWorkMode,
  formatConditionSummary,
  TRAINING_TYPES,
  WORK_MODES,
} from "../trainingType";

// ════════════════════════════════════════════════════════════════════════════
// DB 制約との整合
//
// DB の daily_logs_training_type_check 制約が許可する値と TRAINING_TYPES が一致すること。
// TRAINING_TYPES を変更する際は、対応する migration も更新すること。
// 参照: supabase/migrations/20260316000000_fix_training_type_check_add_off.sql
// ════════════════════════════════════════════════════════════════════════════

const DB_ALLOWED_TRAINING_TYPES = [
  "off",
  "chest",
  "back",
  "shoulders",
  "glutes_hamstrings",
  "quads",
] as const;

describe("TRAINING_TYPES と DB 制約の整合", () => {
  test("TRAINING_TYPES が DB 制約の許可値と完全一致する", () => {
    expect([...TRAINING_TYPES].sort()).toEqual([...DB_ALLOWED_TRAINING_TYPES].sort());
  });

  test("DB 制約の全許可値が isValidTrainingType で valid と判定される", () => {
    for (const v of DB_ALLOWED_TRAINING_TYPES) {
      expect(isValidTrainingType(v)).toBe(true);
    }
  });

  test("DB 制約に含まれない値は isValidTrainingType で invalid と判定される", () => {
    expect(isValidTrainingType("legs")).toBe(false);
    expect(isValidTrainingType("")).toBe(false);
    expect(isValidTrainingType("OFF")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// deriveLegFlag
// ════════════════════════════════════════════════════════════════════════════

describe("deriveLegFlag", () => {
  test("quads → true (レッグ日)", () => {
    expect(deriveLegFlag("quads")).toBe(true);
  });

  test("glutes_hamstrings → true (レッグ日)", () => {
    expect(deriveLegFlag("glutes_hamstrings")).toBe(true);
  });

  test("chest → false (非レッグ日)", () => {
    expect(deriveLegFlag("chest")).toBe(false);
  });

  test("back → false (非レッグ日)", () => {
    expect(deriveLegFlag("back")).toBe(false);
  });

  test("shoulders → false (非レッグ日)", () => {
    expect(deriveLegFlag("shoulders")).toBe(false);
  });

  test("off → false (オフ日 = 非レッグ日と確定)", () => {
    // off はトレーニングなしと明示した日。脚トレをしていないことが確定するため false。
    // null (未記録・不明) とは区別する。
    expect(deriveLegFlag("off")).toBe(false);
  });

  test("null → null (未入力は未判定 ≠ false)", () => {
    expect(deriveLegFlag(null)).toBeNull();
  });

  test("undefined → null (未入力は未判定 ≠ false)", () => {
    expect(deriveLegFlag(undefined)).toBeNull();
  });

  test("null と false は別物 — 未入力は leg_flag=false にならない", () => {
    expect(deriveLegFlag(null)).not.toBe(false);
    expect(deriveLegFlag(null)).toBeNull();
  });

  test("全 TRAINING_TYPES で非 null 結果が返る", () => {
    for (const type of TRAINING_TYPES) {
      expect(deriveLegFlag(type)).not.toBeNull();
      expect(typeof deriveLegFlag(type)).toBe("boolean");
    }
  });

  test("レッグ系 (quads, glutes_hamstrings) は true、それ以外は false", () => {
    const legTypes = new Set(["quads", "glutes_hamstrings"]);
    for (const type of TRAINING_TYPES) {
      expect(deriveLegFlag(type)).toBe(legTypes.has(type));
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// isValidTrainingType
// ════════════════════════════════════════════════════════════════════════════

describe("isValidTrainingType", () => {
  test.each(TRAINING_TYPES)("'%s' は有効な training_type", (type) => {
    expect(isValidTrainingType(type)).toBe(true);
  });

  test("不正な文字列は false", () => {
    expect(isValidTrainingType("legs")).toBe(false);
    expect(isValidTrainingType("")).toBe(false);
    expect(isValidTrainingType("CHEST")).toBe(false);
    expect(isValidTrainingType("arms")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// isValidWorkMode
// ════════════════════════════════════════════════════════════════════════════

describe("isValidWorkMode", () => {
  test.each(WORK_MODES)("'%s' は有効な work_mode", (mode) => {
    expect(isValidWorkMode(mode)).toBe(true);
  });

  test("不正な文字列は false", () => {
    expect(isValidWorkMode("home")).toBe(false);
    expect(isValidWorkMode("")).toBe(false);
    expect(isValidWorkMode("OFF")).toBe(false);
    expect(isValidWorkMode("wfh")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// formatConditionSummary
// ════════════════════════════════════════════════════════════════════════════

describe("formatConditionSummary", () => {
  test("全項目あり (true, quads, remote) → 便通あり / 四頭 / 在宅", () => {
    expect(
      formatConditionSummary({ had_bowel_movement: true, training_type: "quads", work_mode: "remote" })
    ).toBe("便通あり / 四頭 / 在宅");
  });

  test("便通 false は「便通なし」として表示される", () => {
    expect(
      formatConditionSummary({ had_bowel_movement: false, training_type: "back", work_mode: "office" })
    ).toBe("便通なし / 背中 / 出社");
  });

  test("便通 null は非表示 — training_type のみ表示", () => {
    expect(
      formatConditionSummary({ had_bowel_movement: null, training_type: "back", work_mode: null })
    ).toBe("背中");
  });

  test("全欠損 (null, null, null) → null", () => {
    expect(
      formatConditionSummary({ had_bowel_movement: null, training_type: null, work_mode: null })
    ).toBeNull();
  });

  test("便通 undefined → null と同様に非表示", () => {
    expect(
      formatConditionSummary({ had_bowel_movement: undefined, training_type: null, work_mode: null })
    ).toBeNull();
  });

  test("training_type = rest は存在しない enum なので非表示", () => {
    // rest は TRAINING_TYPES に含まれないため isValidTrainingType が false を返す
    expect(
      formatConditionSummary({ had_bowel_movement: null, training_type: "rest", work_mode: null })
    ).toBeNull();
  });

  test("training_type が未知値は非表示", () => {
    expect(
      formatConditionSummary({ had_bowel_movement: null, training_type: "unknown_value", work_mode: null })
    ).toBeNull();
  });

  test("work_mode のみ有効 → work_mode だけ表示", () => {
    expect(
      formatConditionSummary({ had_bowel_movement: null, training_type: null, work_mode: "off" })
    ).toBe("休日");
  });

  test("便通のみ true → 便通あり", () => {
    expect(
      formatConditionSummary({ had_bowel_movement: true, training_type: null, work_mode: null })
    ).toBe("便通あり");
  });

  test("全 training_type の表示文言が正しい", () => {
    const cases: [string, string][] = [
      ["off",               "オフ"],
      ["chest",             "胸"],
      ["back",              "背中"],
      ["shoulders",         "肩"],
      ["glutes_hamstrings", "ハム・ケツ"],
      ["quads",             "四頭"],
    ];
    for (const [type, label] of cases) {
      const result = formatConditionSummary({ had_bowel_movement: null, training_type: type, work_mode: null });
      expect(result).toBe(label);
    }
  });

  test("全 work_mode の表示文言が正しい", () => {
    const cases: [string, string][] = [
      ["off",    "休日"],
      ["office", "出社"],
      ["remote", "在宅"],
    ];
    for (const [mode, label] of cases) {
      const result = formatConditionSummary({ had_bowel_movement: null, training_type: null, work_mode: mode });
      expect(result).toBe(label);
    }
  });

  test("廃止された work_mode 値は isValidWorkMode で false になる", () => {
    // active / travel / other は UI から削除済み。既存データとして残る可能性があるが、
    // 表示では無効値として扱い、formatConditionSummary は null を返す。
    for (const v of ["active", "travel", "other"]) {
      const result = formatConditionSummary({ had_bowel_movement: null, training_type: null, work_mode: v });
      expect(result).toBeNull();
    }
  });

  test("便通 false と null は異なる — false = 便通なし、null = 非表示", () => {
    const withFalse = formatConditionSummary({ had_bowel_movement: false, training_type: null, work_mode: null });
    const withNull  = formatConditionSummary({ had_bowel_movement: null,  training_type: null, work_mode: null });
    expect(withFalse).toBe("便通なし");
    expect(withNull).toBeNull();
    expect(withFalse).not.toBe(withNull);
  });
});
