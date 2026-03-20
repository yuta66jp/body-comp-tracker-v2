/**
 * calcMonthlyGoalProgress.test.ts
 *
 * calcMonthlyGoalProgress / getMonthEndDate / calcDaysToMonthEnd の unit tests。
 * buildMonthlyGoalPlan は real 実装をそのまま呼ぶ (mock なし)。
 *
 * 固定 today: "2026-07-15"
 * 単月プラン: contestDate = "2026-07-31"
 *   → plan.entries[0] = { month: "2026-07", targetWeight: finalGoalWeight }
 *   → daysToMonthEnd = 16, weeksToMonthEnd = 16/7 ≈ 2.286
 */

import {
  calcMonthlyGoalProgress,
  getMonthEndDate,
  calcDaysToMonthEnd,
  MONTHLY_ON_TRACK_PACE_KG_WEEK,
  MONTHLY_REPLAN_PACE_KG_WEEK,
} from "./calcMonthlyGoalProgress";

// ─── 定数確認 ─────────────────────────────────────────────────────────────────

describe("定数", () => {
  it("MONTHLY_ON_TRACK_PACE_KG_WEEK は 0.5", () => {
    expect(MONTHLY_ON_TRACK_PACE_KG_WEEK).toBe(0.5);
  });

  it("MONTHLY_REPLAN_PACE_KG_WEEK は 1.0 (MAX_SAFE_MONTHLY_DELTA_KG / 2)", () => {
    expect(MONTHLY_REPLAN_PACE_KG_WEEK).toBe(1.0);
  });
});

// ─── getMonthEndDate ─────────────────────────────────────────────────────────

describe("getMonthEndDate", () => {
  it("1月 → 31日", () => {
    expect(getMonthEndDate("2026-01-15")).toBe("2026-01-31");
  });

  it("2月 (平年) → 28日", () => {
    expect(getMonthEndDate("2026-02-10")).toBe("2026-02-28");
  });

  it("2月 (うるう年) → 29日", () => {
    expect(getMonthEndDate("2024-02-10")).toBe("2024-02-29");
  });

  it("4月 → 30日", () => {
    expect(getMonthEndDate("2026-04-01")).toBe("2026-04-30");
  });

  it("7月 → 31日", () => {
    expect(getMonthEndDate("2026-07-15")).toBe("2026-07-31");
  });

  it("12月 → 31日", () => {
    expect(getMonthEndDate("2026-12-01")).toBe("2026-12-31");
  });

  it("不正な形式 → null", () => {
    expect(getMonthEndDate("2026/07/15")).toBeNull();
  });

  it("月が 0 → null", () => {
    expect(getMonthEndDate("2026-00-01")).toBeNull();
  });

  it("月が 13 → null", () => {
    expect(getMonthEndDate("2026-13-01")).toBeNull();
  });
});

// ─── calcDaysToMonthEnd ──────────────────────────────────────────────────────

describe("calcDaysToMonthEnd", () => {
  it("月中 → 残り日数が正", () => {
    // 2026-07-15 → 月末 2026-07-31: 16日
    const days = calcDaysToMonthEnd("2026-07-15");
    expect(days).toBe(16);
  });

  it("月末当日 → 0", () => {
    expect(calcDaysToMonthEnd("2026-07-31")).toBe(0);
  });

  it("月初 → 30", () => {
    // 2026-07-01 → 2026-07-31: 30日
    expect(calcDaysToMonthEnd("2026-07-01")).toBe(30);
  });

  it("不正な日付 → null", () => {
    expect(calcDaysToMonthEnd("bad-date")).toBeNull();
  });
});

// ─── calcMonthlyGoalProgress — unavailable (前提条件欠損) ───────────────────

describe("calcMonthlyGoalProgress — unavailable (前提条件欠損)", () => {
  const BASE = {
    contestDate: "2026-07-31",
    targetWeight: 73.8,
    monthlyPlanOverrides: null,
    comparisonWeight: 75.0,
    today: "2026-07-15",
    phase: "Cut",
  };

  it("contestDate が null → hasData: false, state: unavailable", () => {
    const result = calcMonthlyGoalProgress({ ...BASE, contestDate: null });
    expect(result.hasData).toBe(false);
    expect(result.state).toBe("unavailable");
    expect(result.monthlyTargetWeight).toBeNull();
    expect(result.deltaKg).toBeNull();
  });

  it("targetWeight が null → hasData: false, state: unavailable", () => {
    const result = calcMonthlyGoalProgress({ ...BASE, targetWeight: null });
    expect(result.hasData).toBe(false);
    expect(result.state).toBe("unavailable");
  });

  it("comparisonWeight が null → hasData: false, state: unavailable", () => {
    const result = calcMonthlyGoalProgress({ ...BASE, comparisonWeight: null });
    expect(result.hasData).toBe(false);
    expect(result.state).toBe("unavailable");
  });

  it("contestDate が過去 → plan 無効 → hasData: false, state: unavailable", () => {
    const result = calcMonthlyGoalProgress({ ...BASE, contestDate: "2025-01-01" });
    expect(result.hasData).toBe(false);
    expect(result.state).toBe("unavailable");
  });

  it("unavailable 時も comparisonWeight は保持される", () => {
    const result = calcMonthlyGoalProgress({ ...BASE, contestDate: null });
    expect(result.comparisonWeight).toBe(75.0);
  });
});

// ─── calcMonthlyGoalProgress — 今月目標の表示 ────────────────────────────────

describe("calcMonthlyGoalProgress — 今月目標の表示", () => {
  /**
   * 単月プラン (contestDate = 今月末):
   *   plan.entries = [{ month: "2026-07", targetWeight: 73.8 }]
   *   daysToMonthEnd = 16, weeksToMonthEnd = 16/7 ≈ 2.286
   */
  const BASE = {
    contestDate: "2026-07-31",
    targetWeight: 73.8,
    monthlyPlanOverrides: null,
    comparisonWeight: 74.9,
    today: "2026-07-15",
    phase: "Cut",
  };

  it("hasData: true が返る", () => {
    const result = calcMonthlyGoalProgress(BASE);
    expect(result.hasData).toBe(true);
  });

  it("monthlyTargetWeight は finalGoalWeight と一致する (単月プラン)", () => {
    const result = calcMonthlyGoalProgress(BASE);
    expect(result.monthlyTargetWeight).toBeCloseTo(73.8, 1);
  });

  it("comparisonWeight は入力値がそのまま返る", () => {
    const result = calcMonthlyGoalProgress(BASE);
    expect(result.comparisonWeight).toBe(74.9);
  });

  it("deltaKg = comparisonWeight - monthlyTargetWeight (0.01 単位で丸め)", () => {
    // 74.9 - 73.8 = 1.1
    const result = calcMonthlyGoalProgress(BASE);
    expect(result.deltaKg).toBeCloseTo(1.1, 2);
  });

  it("daysToMonthEnd は今日から月末までの日数", () => {
    // 2026-07-15 → 2026-07-31: 16日
    const result = calcMonthlyGoalProgress(BASE);
    expect(result.daysToMonthEnd).toBe(16);
  });

  it("weeksToMonthEnd は daysToMonthEnd / 7", () => {
    const result = calcMonthlyGoalProgress(BASE);
    expect(result.weeksToMonthEnd).toBeCloseTo(16 / 7, 4);
  });

  it("requiredPaceKgPerWeek は -deltaKg / weeksToMonthEnd (0.01 丸め)", () => {
    // -1.1 / (16/7) ≈ -0.48
    const result = calcMonthlyGoalProgress(BASE);
    expect(result.requiredPaceKgPerWeek).toBeCloseTo(-0.48, 1);
  });
});

// ─── calcMonthlyGoalProgress — 状態判定 (Cut) ───────────────────────────────

describe("calcMonthlyGoalProgress — 状態判定 (Cut)", () => {
  /**
   * 共通条件:
   *   today = "2026-07-15", contestDate = "2026-07-31"
   *   targetWeight (= monthlyTargetWeight) = 73.8
   *   daysToMonthEnd = 16, weeksToMonthEnd ≈ 2.286
   */
  function make(comparisonWeight: number) {
    return calcMonthlyGoalProgress({
      contestDate: "2026-07-31",
      targetWeight: 73.8,
      monthlyPlanOverrides: null,
      comparisonWeight,
      today: "2026-07-15",
      phase: "Cut",
    });
  }

  it("achieved: comparisonWeight が目標を下回っている (deltaKg = -0.8 ≤ 0.2)", () => {
    // 73.0 - 73.8 = -0.8 → achieved
    const result = make(73.0);
    expect(result.state).toBe("achieved");
  });

  it("achieved: comparisonWeight が目標と誤差範囲内 (deltaKg = +0.1 ≤ 0.2)", () => {
    // 73.9 - 73.8 = 0.1 → achieved
    const result = make(73.9);
    expect(result.state).toBe("achieved");
  });

  it("on_track: absPace ≤ 0.5 kg/週 (deltaKg ≈ 1.1, absPace ≈ 0.48)", () => {
    // 74.9 - 73.8 = 1.1 → requiredPace ≈ -0.48 → on_track
    const result = make(74.9);
    expect(result.state).toBe("on_track");
  });

  it("slightly_behind: 0.5 < absPace ≤ 1.0 kg/週 (deltaKg ≈ 1.7, absPace ≈ 0.74)", () => {
    // 75.5 - 73.8 = 1.7 → requiredPace ≈ -0.74 → slightly_behind
    const result = make(75.5);
    expect(result.state).toBe("slightly_behind");
  });

  it("replan_recommended: absPace > 1.0 kg/週 (deltaKg = 3.2, absPace ≈ 1.4)", () => {
    // 77.0 - 73.8 = 3.2 → requiredPace ≈ -1.4 → replan_recommended
    const result = make(77.0);
    expect(result.state).toBe("replan_recommended");
  });
});

// ─── calcMonthlyGoalProgress — 状態判定 (Bulk) ──────────────────────────────

describe("calcMonthlyGoalProgress — 状態判定 (Bulk)", () => {
  function make(comparisonWeight: number) {
    return calcMonthlyGoalProgress({
      contestDate: "2026-07-31",
      targetWeight: 73.8,
      monthlyPlanOverrides: null,
      comparisonWeight,
      today: "2026-07-15",
      phase: "Bulk",
    });
  }

  it("achieved: comparisonWeight が目標を上回っている (deltaKg = +0.2 ≥ -0.2)", () => {
    // 74.0 - 73.8 = 0.2 → Bulk achieved
    const result = make(74.0);
    expect(result.state).toBe("achieved");
  });

  it("on_track: Bulk でも absPace ≤ 0.5 なら on_track", () => {
    // 72.7 - 73.8 = -1.1 → Bulk requiredPace = +0.48 → on_track
    const result = make(72.7);
    expect(result.state).toBe("on_track");
  });

  it("replan_recommended: Bulk で大幅遅れ (deltaKg = -3.2, absPace ≈ 1.4)", () => {
    // 70.6 - 73.8 = -3.2 → Bulk requiredPace ≈ +1.4 → replan_recommended
    const result = make(70.6);
    expect(result.state).toBe("replan_recommended");
  });
});

// ─── calcMonthlyGoalProgress — 月末当日 ─────────────────────────────────────

describe("calcMonthlyGoalProgress — 月末当日 (daysToMonthEnd = 0)", () => {
  it("月末当日で未達なら weeksToMonthEnd = null → replan_recommended", () => {
    const result = calcMonthlyGoalProgress({
      contestDate: "2026-07-31",
      targetWeight: 73.8,
      monthlyPlanOverrides: null,
      comparisonWeight: 75.0, // 未達
      today: "2026-07-31",   // 月末当日
      phase: "Cut",
    });
    expect(result.daysToMonthEnd).toBe(0);
    expect(result.weeksToMonthEnd).toBeNull();
    expect(result.requiredPaceKgPerWeek).toBeNull();
    expect(result.state).toBe("replan_recommended");
  });

  it("月末当日で達成済みなら achieved", () => {
    const result = calcMonthlyGoalProgress({
      contestDate: "2026-07-31",
      targetWeight: 73.8,
      monthlyPlanOverrides: null,
      comparisonWeight: 73.5, // 達成済み
      today: "2026-07-31",
      phase: "Cut",
    });
    expect(result.state).toBe("achieved");
  });
});

// ─── calcMonthlyGoalProgress — hasWarnings ───────────────────────────────────

describe("calcMonthlyGoalProgress — hasWarnings", () => {
  it("contestDate が今月末 → DEADLINE_TOO_CLOSE 警告あり → hasWarnings: true", () => {
    const result = calcMonthlyGoalProgress({
      contestDate: "2026-07-31",
      targetWeight: 73.8,
      monthlyPlanOverrides: null,
      comparisonWeight: 75.0,
      today: "2026-07-15",
      phase: "Cut",
    });
    expect(result.hasWarnings).toBe(true);
  });

  it("余裕のある計画 → hasWarnings: false", () => {
    // 6ヶ月, 月間変化 ≈ -0.33 kg → 警告なし
    const result = calcMonthlyGoalProgress({
      contestDate: "2026-12-31",
      targetWeight: 73.0,
      monthlyPlanOverrides: null,
      comparisonWeight: 75.0,
      today: "2026-07-15",
      phase: "Cut",
    });
    expect(result.hasWarnings).toBe(false);
  });
});

// ─── calcMonthlyGoalProgress — 多月プランで今月エントリーが取れる ─────────────

describe("calcMonthlyGoalProgress — 多月プラン", () => {
  it("今月エントリーが正しく取得されて hasData: true", () => {
    // 5ヶ月 (Jul〜Nov): Jul エントリーの targetWeight は finalGoalWeight に向けた補間値
    const result = calcMonthlyGoalProgress({
      contestDate: "2026-11-30",
      targetWeight: 70.0,
      monthlyPlanOverrides: null,
      comparisonWeight: 75.0,
      today: "2026-07-15",
      phase: "Cut",
    });
    expect(result.hasData).toBe(true);
    // 今月目標は現在体重 (75.0) と最終目標 (70.0) の間のどこか
    expect(result.monthlyTargetWeight).not.toBeNull();
    expect(result.monthlyTargetWeight!).toBeGreaterThan(70.0);
    expect(result.monthlyTargetWeight!).toBeLessThanOrEqual(75.0);
  });
});
