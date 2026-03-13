import {
  deriveLegFlag,
  isValidTrainingType,
  isValidWorkMode,
  TRAINING_TYPES,
  WORK_MODES,
} from "../trainingType";

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
