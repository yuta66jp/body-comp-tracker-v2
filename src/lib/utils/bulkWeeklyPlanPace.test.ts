import type { MonthlyGoalEntry } from "@/lib/utils/monthlyGoalPlan";
import {
  buildBulkDailyPlanWeightMap,
  calcBulkWeeklyPlanPace,
  classifyBulkWeeklyPace,
  findBulkMonthlyGainLimitViolations,
  validateBulkMonthlyPlanLimit,
} from "./bulkWeeklyPlanPace";

function entry(month: string, targetWeight: number, requiredDeltaKg: number): MonthlyGoalEntry {
  return {
    month,
    targetWeight,
    requiredDeltaKg,
    source: "auto_redistributed",
    actualWeight: null,
  };
}

function dailyLogs(startDay: number, endDay: number, gainPerDay: number) {
  return Array.from({ length: endDay - startDay + 1 }, (_, index) => {
    const day = startDay + index;
    return {
      log_date: `2026-04-${String(day).padStart(2, "0")}`,
      weight: 75 + (day - 1) * gainPerDay,
    };
  });
}

describe("findBulkMonthlyGainLimitViolations", () => {
  it("通常月の+1.0kgは上限内", () => {
    expect(findBulkMonthlyGainLimitViolations({
      startDate: "2026-04-01",
      targetDate: "2026-04-30",
      entries: [entry("2026-04", 76, 1)],
    })).toEqual([]);
  });

  it("通常月の+1.1kgは上限超過", () => {
    expect(findBulkMonthlyGainLimitViolations({
      startDate: "2026-04-01",
      targetDate: "2026-04-30",
      entries: [entry("2026-04", 76.1, 1.1)],
    })).toEqual([{ month: "2026-04", plannedDeltaKg: 1.1, allowedDeltaKg: 1 }]);
  });

  it("月途中開始は残り日数で上限を按分", () => {
    const violations = findBulkMonthlyGainLimitViolations({
      startDate: "2026-03-15",
      targetDate: "2026-03-31",
      entries: [entry("2026-03", 75.6, 0.6)],
    });
    expect(violations[0]).toEqual({
      month: "2026-03",
      plannedDeltaKg: 0.6,
      allowedDeltaKg: 0.55,
    });
  });
});

describe("validateBulkMonthlyPlanLimit", () => {
  it("端数月を含む自動計画を月内日数に応じて配分する", () => {
    expect(validateBulkMonthlyPlanLimit({
      phase: "Bulk",
      startDate: "2026-03-15",
      startWeight: 75,
      targetDate: "2026-05-31",
      targetWeight: 77.5,
    })).toEqual([]);
  });

  it("期間全体の増量可能量を超える目標は保存不可", () => {
    expect(validateBulkMonthlyPlanLimit({
      phase: "Bulk",
      startDate: "2026-03-15",
      startWeight: 75,
      targetDate: "2026-05-31",
      targetWeight: 77.7,
    }).length).toBeGreaterThan(0);
  });
});

describe("buildBulkDailyPlanWeightMap", () => {
  it("開始体重から月末目標までを日別に線形補間", () => {
    const plan = buildBulkDailyPlanWeightMap({
      startDate: "2026-04-01",
      startWeight: 75,
      targetDate: "2026-04-30",
      entries: [entry("2026-04", 76, 1)],
    });
    expect(plan.get("2026-04-01")).toBeCloseTo(75);
    expect(plan.get("2026-04-30")).toBeCloseTo(76);
    expect(plan.get("2026-04-15")).toBeGreaterThan(75);
  });

  it("月境界で前月末目標を共有し、次月目標へ連続する", () => {
    const plan = buildBulkDailyPlanWeightMap({
      startDate: "2026-03-15",
      startWeight: 75,
      targetDate: "2026-04-30",
      entries: [entry("2026-03", 75.5, 0.5), entry("2026-04", 76.5, 1)],
    });
    expect(plan.get("2026-03-31")).toBeCloseTo(75.5);
    expect(plan.get("2026-04-01")).toBeGreaterThan(75.5);
    expect(plan.get("2026-04-30")).toBeCloseTo(76.5);
  });
});

describe("classifyBulkWeeklyPace", () => {
  const planned = 0.23;

  it.each([
    [-0.06, "wrong_direction"],
    [0.11, "slow"],
    [0.12, "on_plan"],
    [0.25, "on_plan"],
    [0.3, "slightly_fast"],
    [0.35, "over_pace"],
  ] as const)("実績%fkgを%sに分類", (actual, expected) => {
    expect(classifyBulkWeeklyPace(actual, planned)).toBe(expected);
  });

  it("維持相当の計画は固定閾値で分類", () => {
    expect(classifyBulkWeeklyPace(0.05, 0.04)).toBe("on_plan");
    expect(classifyBulkWeeklyPace(0.08, 0.04)).toBe("slightly_fast");
    expect(classifyBulkWeeklyPace(0.11, 0.04)).toBe("over_pace");
  });
});

describe("calcBulkWeeklyPlanPace", () => {
  const base = {
    startDate: "2026-04-01",
    startWeight: 75,
    targetDate: "2026-04-30",
    entries: [entry("2026-04", 76, 1)],
    today: "2026-04-14",
  };

  it("月+1kgに沿った実績を計画内と判定", () => {
    const result = calcBulkWeeklyPlanPace({
      ...base,
      logs: dailyLogs(1, 14, 1 / 29),
    });
    expect(result.state).toBe("on_plan");
    expect(result.actualChangeKg).toBeCloseTo(result.plannedChangeKg!, 8);
    expect(result.plannedChangeKg).toBeCloseTo(0.24, 1);
    expect(result.paceRatioPct).toBeCloseTo(100);
  });

  it("計画の150%超を増量ペース超過と判定", () => {
    const result = calcBulkWeeklyPlanPace({
      ...base,
      logs: dailyLogs(1, 14, 0.06),
    });
    expect(result.state).toBe("over_pace");
    expect(result.paceRatioPct).toBeGreaterThan(150);
  });

  it("各7日窓の記録が5日未満ならデータ不足", () => {
    const result = calcBulkWeeklyPlanPace({
      ...base,
      logs: [...dailyLogs(1, 4, 0.03), ...dailyLogs(8, 11, 0.03)],
    });
    expect(result.state).toBe("data_insufficient");
    expect(result.currentWeightDays).toBe(4);
    expect(result.previousWeightDays).toBe(4);
  });

  it("月+1kg上限を超える保存済み計画は計画確認", () => {
    const result = calcBulkWeeklyPlanPace({
      ...base,
      entries: [entry("2026-04", 76.1, 1.1)],
      logs: dailyLogs(1, 14, 0.03),
    });
    expect(result.state).toBe("plan_check");
    expect(result.monthlyLimitViolations).toHaveLength(1);
  });
});
