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

export interface SimPoint {
  date: string;  // YYYY-MM-DD
  weight: number;
}

/**
 * 代謝適応シミュレーション (旧版 run_metabolic_simulation() を移植)
 *
 * 体重が減るにつれて TDEE も低下する（代謝適応）という現象をモデル化。
 * ADAPTATION_FACTOR = 30 kcal/kg (旧版踏襲)
 *
 * @param currentWeight  直近の体重 (kg)
 * @param currentTdee    直近の推定 TDEE (kcal)
 * @param planIntake     今後の想定摂取カロリー (kcal/日) — 直近平均を使用
 * @param targetDate     シミュレーション終了日 (YYYY-MM-DD)
 * @param startDate      開始日 (YYYY-MM-DD, 省略時は今日)
 */
export function calcMetabolicSim(
  currentWeight: number,
  currentTdee: number,
  planIntake: number,
  targetDate: string,
  startDate?: string
): SimPoint[] {
  const ADAPTATION_FACTOR = 30; // kcal/kg
  const start = new Date(startDate ?? new Date().toISOString().slice(0, 10));
  const end = new Date(targetDate);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days <= 0) return [];

  const points: SimPoint[] = [];
  let simWeight = currentWeight;
  let simTdee = currentTdee;

  for (let i = 1; i <= days; i++) {
    const balance = planIntake - simTdee;
    simWeight += balance / KCAL_PER_KG_FAT;
    const weightLoss = currentWeight - simWeight;
    simTdee = currentTdee - weightLoss * ADAPTATION_FACTOR;

    const d = new Date(start);
    d.setDate(d.getDate() + i);
    points.push({
      date: d.toISOString().slice(0, 10),
      weight: Math.round(simWeight * 100) / 100,
    });
  }
  return points;
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
