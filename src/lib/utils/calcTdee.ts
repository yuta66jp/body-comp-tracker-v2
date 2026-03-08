/**
 * TDEE (Total Daily Energy Expenditure) 逆算ユーティリティ
 *
 * TDEE = 体重変化から逆算。
 * 脂肪 1kg = 7,200 kcal (エビデンスベース: Hall et al., 2012)
 * ※旧コードの 6,800 との不一致を 7,200 に統一。
 */

export const KCAL_PER_KG_FAT = 7_200;

interface TdeeInput {
  weightKgStart: number;
  weightKgEnd: number;
  days: number;
  avgCaloriesPerDay: number;
}

/**
 * 体重変化と摂取カロリーから TDEE を逆算する。
 * TDEE = 摂取カロリー - (体重変化 × 7200 / 日数)
 */
export function calcTdeeFromChange({
  weightKgStart,
  weightKgEnd,
  days,
  avgCaloriesPerDay,
}: TdeeInput): number {
  const weightDelta = weightKgEnd - weightKgStart; // + 増加, - 減少
  const energyBalance = (weightDelta * KCAL_PER_KG_FAT) / days;
  return avgCaloriesPerDay - energyBalance;
}

/**
 * Mifflin-St Jeor 式で基礎代謝 (BMR) を計算する。
 */
export function calcBmr(params: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  isMale: boolean;
}): number {
  const { weightKg, heightCm, ageYears, isMale } = params;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return isMale ? base + 5 : base - 161;
}

/**
 * BMR × 活動係数で理論 TDEE を算出する。
 */
export function calcTheoreticalTdee(params: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  isMale: boolean;
  activityFactor: number;
}): number {
  return calcBmr(params) * params.activityFactor;
}
