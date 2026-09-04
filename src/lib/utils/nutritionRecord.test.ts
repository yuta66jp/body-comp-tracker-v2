import {
  isAllZeroNutrition,
  isRecordedCalories,
  normalizeNutritionFields,
  recordedCaloriesOrNull,
} from "./nutritionRecord";

describe("isRecordedCalories", () => {
  it.each([
    [null, false],
    [undefined, false],
    [0, false],
    [-1, false],
    [Number.NaN, false],
    [1, true],
    [1800, true],
  ])("%p の記録済み判定は %p", (value, expected) => {
    expect(isRecordedCalories(value)).toBe(expected);
  });
});

describe("recordedCaloriesOrNull", () => {
  it("正数だけを保持し、0 と null は未記録にする", () => {
    expect(recordedCaloriesOrNull(1800)).toBe(1800);
    expect(recordedCaloriesOrNull(0)).toBeNull();
    expect(recordedCaloriesOrNull(null)).toBeNull();
  });
});

describe("nutrition normalization", () => {
  it("全項目 0 は食事未記録として全項目 null にする", () => {
    const input = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    expect(isAllZeroNutrition(input)).toBe(true);
    expect(normalizeNutritionFields(input)).toEqual({
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
    });
  });

  it("正数カロリーの食事では P/F/C の個別 0 を保持する", () => {
    const input = { calories: 1800, protein: 150, fat: 50, carbs: 0 };
    expect(isAllZeroNutrition(input)).toBe(false);
    expect(normalizeNutritionFields(input)).toBe(input);
  });

  it("未操作の undefined と明示クリアの null を変更しない", () => {
    expect(normalizeNutritionFields({})).toEqual({});
    expect(normalizeNutritionFields({
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
    })).toEqual({
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
    });
  });
});
