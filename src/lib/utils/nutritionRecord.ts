export interface NutritionFields {
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
}

/**
 * 食事記録済みとして扱えるカロリーかを判定する。
 *
 * このアプリでは絶食を記録しないため、0 kcal は未記録として扱う。
 * P/F/C の個別 0g は、カロリーが正数の食事記録では有効値のまま保持する。
 */
export function isRecordedCalories(
  value: number | null | undefined,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function recordedCaloriesOrNull(
  value: number | null | undefined,
): number | null {
  return isRecordedCalories(value) ? value : null;
}

export function isAllZeroNutrition(fields: NutritionFields): boolean {
  return (
    fields.calories === 0 &&
    fields.protein === 0 &&
    fields.fat === 0 &&
    fields.carbs === 0
  );
}

/** 全項目 0 の入力を、食事未記録を表す全項目 null に正規化する。 */
export function normalizeNutritionFields(
  fields: NutritionFields,
): NutritionFields {
  if (!isAllZeroNutrition(fields)) return fields;
  return {
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
  };
}
