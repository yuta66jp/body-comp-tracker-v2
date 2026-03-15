import { calcMacroKpi, calcDailyMacro, calcMacroDiff, calcPfcKcalRatio } from "./calcMacro";
import type { MacroPeriodStats, MacroTargets } from "./calcMacro";
import type { DailyLog } from "@/lib/supabase/types";

function makeLog(log_date: string, overrides: Partial<DailyLog> = {}): DailyLog {
  return {
    log_date,
    weight: 65.0,
    calories: 2000,
    protein: 150,
    fat: 50,
    carbs: 200,
    note: null,
    is_cheat_day:      false,
    is_refeed_day:     false,
    is_eating_out:     false,
    is_travel_day:     false,
    is_poor_sleep:     false,
    sleep_hours:       null,
    had_bowel_movement: false,
    training_type:     null,
    work_mode:         null,
    leg_flag:          null,
    updated_at:        "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

describe("calcMacroKpi", () => {
  it("空配列を渡しても安全に null を返す", () => {
    const kpi = calcMacroKpi([]);
    expect(kpi.weekly.avgCalories).toBeNull();
    expect(kpi.weightChangeRate).toBeNull();
    expect(kpi.proteinRatio).toBeNull();
  });

  it("7日平均カロリーが正しく計算される", () => {
    const logs = Array.from({ length: 7 }, (_, i) =>
      makeLog(`2026-03-0${i + 1}`, { calories: 2000 + i * 100 })
    );
    const kpi = calcMacroKpi(logs);
    // (2000 + 2100 + 2200 + 2300 + 2400 + 2500 + 2600) / 7 = 2300
    expect(kpi.weekly.avgCalories).toBeCloseTo(2300, 1);
  });

  it("タンパク質比率が正しく計算される (protein * 4 / calories * 100)", () => {
    // protein: 150g → 600 kcal、calories: 2000 kcal → 30%
    const logs = Array.from({ length: 7 }, (_, i) =>
      makeLog(`2026-03-0${i + 1}`, { protein: 150, calories: 2000 })
    );
    const kpi = calcMacroKpi(logs);
    expect(kpi.proteinRatio).toBeCloseTo(30, 1);
  });

  it("週次体重変化率が正しく計算される", () => {
    const prev7 = Array.from({ length: 7 }, (_, i) =>
      makeLog(`2026-02-2${i + 2}`, { weight: 66.0 }) // 直近の1〜7日前
    );
    // 日付に注意: 2〜8日前
    const last7 = Array.from({ length: 7 }, (_, i) =>
      makeLog(`2026-03-0${i + 1}`, { weight: 65.0 })
    );
    const kpi = calcMacroKpi([...prev7, ...last7]);
    // (65 - 66) / 66 * 100 = -1.515...%
    expect(kpi.weightChangeRate).toBeLessThan(0);
  });

  it("データが 7 件以下の場合 weightChangeRate が null になる", () => {
    const logs = [makeLog("2026-03-08", { weight: 65.0 })];
    const kpi = calcMacroKpi(logs);
    expect(kpi.weightChangeRate).toBeNull();
  });

  it("calories が null の行はカロリー平均の計算から除外される", () => {
    const logs = [
      makeLog("2026-03-01", { calories: null }),
      makeLog("2026-03-02", { calories: 2000 }),
      makeLog("2026-03-03", { calories: null }),
      makeLog("2026-03-04", { calories: 2000 }),
      makeLog("2026-03-05", { calories: null }),
      makeLog("2026-03-06", { calories: 2000 }),
      makeLog("2026-03-07", { calories: 2000 }),
    ];
    const kpi = calcMacroKpi(logs);
    expect(kpi.weekly.avgCalories).toBeCloseTo(2000, 1);
  });
});

describe("calcDailyMacro", () => {
  it("直近 N 日を返す", () => {
    const logs = Array.from({ length: 40 }, (_, i) => {
      const d = new Date(2026, 0, i + 1);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return makeLog(`2026-${mm}-${dd}`);
    });
    const result = calcDailyMacro(logs, 30);
    expect(result).toHaveLength(30);
  });

  it("null の栄養素は 0 に変換される", () => {
    const logs = [makeLog("2026-03-08", { calories: null, protein: null, fat: null, carbs: null })];
    const result = calcDailyMacro(logs);
    expect(result[0].calories).toBe(0);
    expect(result[0].protein).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// calcMacroDiff
// ════════════════════════════════════════════════════════════════════════════

describe("calcMacroDiff", () => {
  const actual: MacroPeriodStats = {
    avgCalories: 1850,
    avgProtein:  145,
    avgFat:      55,
    avgCarbs:    210,
    days: 7,
  };

  it("差分 = 実績 - 目標 (kcal)", () => {
    const targets: MacroTargets = { calories: 2000, protein: null, fat: null, carbs: null };
    const diff = calcMacroDiff(actual, targets);
    expect(diff.calories).toBe(-150); // 1850 - 2000
  });

  it("差分 = 実績 - 目標 (g)", () => {
    const targets: MacroTargets = { calories: null, protein: 150, fat: 50, carbs: 200 };
    const diff = calcMacroDiff(actual, targets);
    expect(diff.protein).toBe(-5);   // 145 - 150
    expect(diff.fat).toBe(5);        // 55 - 50
    expect(diff.carbs).toBe(10);     // 210 - 200
  });

  it("目標が null なら差分も null", () => {
    const targets: MacroTargets = { calories: null, protein: null, fat: null, carbs: null };
    const diff = calcMacroDiff(actual, targets);
    expect(diff.calories).toBeNull();
    expect(diff.protein).toBeNull();
  });

  it("実績が null なら差分も null", () => {
    const noData: MacroPeriodStats = { avgCalories: null, avgProtein: null, avgFat: null, avgCarbs: null, days: 0 };
    const targets: MacroTargets = { calories: 2000, protein: 150, fat: 50, carbs: 200 };
    const diff = calcMacroDiff(noData, targets);
    expect(diff.calories).toBeNull();
    expect(diff.protein).toBeNull();
  });

  it("差分はゼロになりうる", () => {
    const targets: MacroTargets = { calories: 1850, protein: 145, fat: 55, carbs: 210 };
    const diff = calcMacroDiff(actual, targets);
    expect(diff.calories).toBe(0);
    expect(diff.protein).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// calcPfcKcalRatio
// ════════════════════════════════════════════════════════════════════════════

describe("calcPfcKcalRatio", () => {
  it("P=150g F=50g C=200g → 正しい kcal と比率を返す", () => {
    const stats: MacroPeriodStats = {
      avgCalories: 2000, avgProtein: 150, avgFat: 50, avgCarbs: 200, days: 7,
    };
    const ratio = calcPfcKcalRatio(stats);
    expect(ratio).not.toBeNull();
    // P: 150*4=600, F: 50*9=450, C: 200*4=800, total=1850
    expect(ratio!.proteinKcal).toBe(600);
    expect(ratio!.fatKcal).toBe(450);
    expect(ratio!.carbsKcal).toBe(800);
    expect(ratio!.totalKcal).toBe(1850);
    expect(ratio!.proteinPct + ratio!.fatPct + ratio!.carbsPct).toBe(100);
  });

  it("P/F/C のいずれかが null → null を返す", () => {
    const stats: MacroPeriodStats = {
      avgCalories: 2000, avgProtein: null, avgFat: 50, avgCarbs: 200, days: 7,
    };
    expect(calcPfcKcalRatio(stats)).toBeNull();
  });

  it("合計 kcal が 0 → null を返す", () => {
    const stats: MacroPeriodStats = {
      avgCalories: 0, avgProtein: 0, avgFat: 0, avgCarbs: 0, days: 7,
    };
    expect(calcPfcKcalRatio(stats)).toBeNull();
  });

  it("P/F/C 比率の合計は必ず 100%", () => {
    // 丸め誤差が出やすい値
    const stats: MacroPeriodStats = {
      avgCalories: 2100, avgProtein: 133, avgFat: 67, avgCarbs: 250, days: 7,
    };
    const ratio = calcPfcKcalRatio(stats);
    expect(ratio).not.toBeNull();
    expect(ratio!.proteinPct + ratio!.fatPct + ratio!.carbsPct).toBe(100);
  });
});
