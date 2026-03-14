import {
  calcTdeeFromChange,
  calcMetabolicSim,
  calcBmr,
  calcTheoreticalTdee,
  calcEnergyBalance,
  calcTheoreticalWeightChangePerWeek,
  calcTdeeConfidence,
  buildTdeeInterpretation,
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
  it("BMR × 活動係数 が理論 TDEE（男性）", () => {
    const bmr = calcBmr({ weightKg: 70, heightCm: 170, ageYears: 30, isMale: true });
    const tdee = calcTheoreticalTdee({
      weightKg: 70, heightCm: 170, ageYears: 30, isMale: true, activityFactor: 1.55,
    });
    expect(tdee).toBeCloseTo(bmr * 1.55, 1);
  });

  it("BMR × 活動係数 が理論 TDEE（女性）", () => {
    // BMR = 10*55 + 6.25*160 - 5*25 - 161 = 1264
    const bmr = calcBmr({ weightKg: 55, heightCm: 160, ageYears: 25, isMale: false });
    const tdee = calcTheoreticalTdee({
      weightKg: 55, heightCm: 160, ageYears: 25, isMale: false, activityFactor: 1.375,
    });
    expect(tdee).toBeCloseTo(bmr * 1.375, 1);
    expect(tdee).toBeCloseTo(1264 * 1.375, 1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// calcEnergyBalance
// ════════════════════════════════════════════════════════════════════════════

describe("calcEnergyBalance", () => {
  it("摂取 > TDEE → プラス収支", () => {
    expect(calcEnergyBalance(2500, 2200)).toBe(300);
  });

  it("摂取 < TDEE → マイナス収支（減量方向）", () => {
    expect(calcEnergyBalance(1800, 2200)).toBe(-400);
  });

  it("どちらか null → null を返す", () => {
    expect(calcEnergyBalance(null, 2200)).toBeNull();
    expect(calcEnergyBalance(1800, null)).toBeNull();
    expect(calcEnergyBalance(null, null)).toBeNull();
  });

  it("結果が整数に丸められる", () => {
    const result = calcEnergyBalance(2100.7, 1800.2);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// calcTheoreticalWeightChangePerWeek
// ════════════════════════════════════════════════════════════════════════════

describe("calcTheoreticalWeightChangePerWeek", () => {
  it("-500 kcal/日 → 約 -0.49 kg/週", () => {
    // -500 * 7 / 7200 = -0.4861... → round to -0.49
    const result = calcTheoreticalWeightChangePerWeek(-500);
    expect(result).toBeCloseTo(-0.49, 2);
  });

  it("0 kcal/日 → 0 kg/週", () => {
    expect(calcTheoreticalWeightChangePerWeek(0)).toBe(0);
  });

  it("null → null を返す", () => {
    expect(calcTheoreticalWeightChangePerWeek(null)).toBeNull();
  });

  it("小数点2桁に丸められる", () => {
    const result = calcTheoreticalWeightChangePerWeek(300);
    expect(result).not.toBeNull();
    const str = result!.toString();
    const decimals = str.includes(".") ? str.split(".")[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// calcTdeeConfidence
// ════════════════════════════════════════════════════════════════════════════

describe("calcTdeeConfidence", () => {
  it("TDEE推定なし → low", () => {
    const r = calcTdeeConfidence({ calDays: 7, weightDays: 7, hasTdeeEstimate: false });
    expect(r.level).toBe("low");
  });

  it("最小日数 < 4 → low", () => {
    const r = calcTdeeConfidence({ calDays: 3, weightDays: 7, hasTdeeEstimate: true });
    expect(r.level).toBe("low");
  });

  it("最小日数 4〜5 → medium", () => {
    const r = calcTdeeConfidence({ calDays: 5, weightDays: 7, hasTdeeEstimate: true });
    expect(r.level).toBe("medium");
  });

  it("体重標準偏差 > 1.5 kg → medium", () => {
    const r = calcTdeeConfidence({ calDays: 7, weightDays: 7, hasTdeeEstimate: true, weightStdDev: 2.0 });
    expect(r.level).toBe("medium");
  });

  it("最小日数 ≥ 6 かつ σ ≤ 1.5 → high", () => {
    const r = calcTdeeConfidence({ calDays: 7, weightDays: 6, hasTdeeEstimate: true, weightStdDev: 1.0 });
    expect(r.level).toBe("high");
  });

  it("reason が空文字でない", () => {
    const r = calcTdeeConfidence({ calDays: 7, weightDays: 7, hasTdeeEstimate: true });
    expect(r.reason.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// buildTdeeInterpretation
// ════════════════════════════════════════════════════════════════════════════

describe("buildTdeeInterpretation", () => {
  it("balance null → データ不足メッセージ", () => {
    const r = buildTdeeInterpretation(null, null, null);
    expect(r).toContain("データ不足");
  });

  it("balance < -100 → 減量方向テキスト", () => {
    const r = buildTdeeInterpretation(-300, -0.29, -0.30);
    expect(r).toContain("減量方向");
  });

  it("balance > 100 → 増量方向テキスト", () => {
    const r = buildTdeeInterpretation(300, 0.29, 0.30);
    expect(r).toContain("増量方向");
  });

  it("balance ≈ 0 → 均衡テキスト", () => {
    const r = buildTdeeInterpretation(30, 0.03, 0.02);
    expect(r).toContain("均衡");
  });

  it("theoretical null → 方向テキストのみ", () => {
    const r = buildTdeeInterpretation(-200, null, null);
    expect(r).toContain("減量方向");
  });

  it("measured null → 体重データ不足テキスト", () => {
    const r = buildTdeeInterpretation(-200, -0.19, null);
    expect(r).toContain("体重データ不足");
  });

  it("gap ≤ 0.15 → 実測は理論に概ね沿っている", () => {
    const r = buildTdeeInterpretation(-300, -0.29, -0.32);
    expect(r).toContain("概ね沿っています");
  });

  it("gap > 0.5 → 乖離が大きいテキスト", () => {
    // balance=400(増量方向), theoretical=0.39, measured=-0.20 → gap=-0.59, gapAbs=0.59
    const r = buildTdeeInterpretation(400, 0.39, -0.20);
    expect(r).toContain("乖離が大きく");
  });
});
