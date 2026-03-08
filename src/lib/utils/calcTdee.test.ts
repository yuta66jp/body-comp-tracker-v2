import {
  calcTdeeFromChange,
  calcMetabolicSim,
  calcBmr,
  calcTheoreticalTdee,
  KCAL_PER_KG_FAT,
} from "./calcTdee";

describe("calcTdeeFromChange", () => {
  it("体重増加時の TDEE 逆算（摂取 > 消費）", () => {
    // 7日間で 0.5kg 増加、平均摂取 2500 kcal
    // エネルギー収支 = 0.5 * 7200 / 7 = 514.3 kcal/day
    // TDEE = 2500 - 514.3 = 1985.7 kcal
    const result = calcTdeeFromChange({
      weightKgStart: 65.0,
      weightKgEnd: 65.5,
      days: 7,
      avgCaloriesPerDay: 2500,
    });
    expect(result).toBeCloseTo(2500 - (0.5 * KCAL_PER_KG_FAT) / 7, 0);
  });

  it("体重変化なしの場合 TDEE = 摂取カロリー", () => {
    const result = calcTdeeFromChange({
      weightKgStart: 65.0,
      weightKgEnd: 65.0,
      days: 7,
      avgCaloriesPerDay: 2000,
    });
    expect(result).toBeCloseTo(2000, 5);
  });

  it("体重減少時の TDEE 逆算（摂取 < 消費）", () => {
    // 7日間で 0.5kg 減少
    // エネルギー収支 = -0.5 * 7200 / 7 = -514.3 kcal/day
    // TDEE = 1800 - (-514.3) = 2314.3 kcal
    const result = calcTdeeFromChange({
      weightKgStart: 65.0,
      weightKgEnd: 64.5,
      days: 7,
      avgCaloriesPerDay: 1800,
    });
    expect(result).toBeCloseTo(1800 - (-0.5 * KCAL_PER_KG_FAT) / 7, 0);
  });
});

describe("calcMetabolicSim", () => {
  it("0日（targetDate == startDate）の場合は空配列を返す", () => {
    const result = calcMetabolicSim(65.0, 2200, 1800, "2026-03-08", "2026-03-08");
    expect(result).toEqual([]);
  });

  it("targetDate が startDate より前の場合も空配列を返す", () => {
    const result = calcMetabolicSim(65.0, 2200, 1800, "2026-03-07", "2026-03-08");
    expect(result).toEqual([]);
  });

  it("正常ケース: 7日間のシミュレーションが 7 点を返す", () => {
    const result = calcMetabolicSim(65.0, 2200, 1800, "2026-03-15", "2026-03-08");
    expect(result).toHaveLength(7);
  });

  it("カロリー制限中は体重が減少する", () => {
    // 摂取 1800 < TDEE 2200 → 減量
    const result = calcMetabolicSim(65.0, 2200, 1800, "2026-03-15", "2026-03-08");
    const lastWeight = result[result.length - 1].weight;
    expect(lastWeight).toBeLessThan(65.0);
  });

  it("カロリー過剰時は体重が増加する", () => {
    // 摂取 2600 > TDEE 2200 → 増量
    const result = calcMetabolicSim(65.0, 2200, 2600, "2026-03-15", "2026-03-08");
    const lastWeight = result[result.length - 1].weight;
    expect(lastWeight).toBeGreaterThan(65.0);
  });

  it("返される日付が YYYY-MM-DD フォーマットである", () => {
    const result = calcMetabolicSim(65.0, 2200, 1800, "2026-03-15", "2026-03-08");
    for (const point of result) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("calcBmr", () => {
  it("男性の BMR が正しく計算される (Mifflin-St Jeor)", () => {
    // 10 * 70 + 6.25 * 170 - 5 * 30 + 5 = 700 + 1062.5 - 150 + 5 = 1617.5
    const result = calcBmr({ weightKg: 70, heightCm: 170, ageYears: 30, isMale: true });
    expect(result).toBeCloseTo(1617.5, 1);
  });

  it("女性の BMR が正しく計算される (Mifflin-St Jeor)", () => {
    // 10 * 55 + 6.25 * 160 - 5 * 25 - 161 = 550 + 1000 - 125 - 161 = 1264
    const result = calcBmr({ weightKg: 55, heightCm: 160, ageYears: 25, isMale: false });
    expect(result).toBeCloseTo(1264, 1);
  });
});

describe("calcTheoreticalTdee", () => {
  it("BMR × 活動係数 が理論 TDEE", () => {
    const bmr = calcBmr({ weightKg: 70, heightCm: 170, ageYears: 30, isMale: true });
    const tdee = calcTheoreticalTdee({
      weightKg: 70, heightCm: 170, ageYears: 30, isMale: true, activityFactor: 1.55,
    });
    expect(tdee).toBeCloseTo(bmr * 1.55, 1);
  });
});
