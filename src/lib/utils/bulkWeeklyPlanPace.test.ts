import type { MonthlyGoalEntry } from "@/lib/utils/monthlyGoalPlan";
import { addDaysStr } from "@/lib/utils/date";
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

  it.each([
    [1, 1, 0],
    [7, 7, 0],
    [12, 7, 5],
    [13, 7, 6],
  ])("開始%d日目は実際の記録日数を返して判定を保留する", (day, currentDays, previousDays) => {
    const result = calcBulkWeeklyPlanPace({
      ...base,
      today: `2026-04-${String(day).padStart(2, "0")}`,
      logs: dailyLogs(1, day, 0.03),
    });
    expect(result).toMatchObject({
      state: "data_insufficient",
      dataInsufficientReason: "season_start",
      earliestEvaluationDate: "2026-04-14",
      currentWeightDays: currentDays,
      previousWeightDays: previousDays,
      actualChangeKg: null,
      plannedChangeKg: null,
      paceRatioPct: null,
      actualChangePct: null,
    });
  });

  it("開始直後は前シーズン・未来日・体重未入力を数えない", () => {
    const result = calcBulkWeeklyPlanPace({
      ...base,
      startDate: "2026-04-10",
      today: "2026-04-13",
      entries: [entry("2026-04", 75.5, 0.5)],
      logs: dailyLogs(1, 15, 0.03).map((log) => ({
        ...log,
        weight: log.log_date === "2026-04-12" ? null : log.weight,
      })),
    });
    expect(result).toMatchObject({
      dataInsufficientReason: "season_start",
      earliestEvaluationDate: "2026-04-23",
      currentWeightDays: 3,
      previousWeightDays: 0,
    });
  });

  it("開始14日目は各期間ちょうど5日でも通常判定する（重複・nullは加算しない）", () => {
    const result = calcBulkWeeklyPlanPace({
      ...base,
      logs: [
        ...dailyLogs(1, 5, 1 / 29),
        ...dailyLogs(8, 12, 1 / 29),
        ...dailyLogs(1, 1, 1 / 29),
        ...dailyLogs(8, 8, 1 / 29),
        { log_date: "2026-04-01", weight: null },
        { log_date: "2026-04-06", weight: null },
        { log_date: "2026-04-13", weight: null },
      ],
    });
    expect(result).toMatchObject({
      state: "on_plan",
      dataInsufficientReason: null,
      earliestEvaluationDate: "2026-04-14",
      currentWeightDays: 5,
      previousWeightDays: 5,
    });
    expect(result.paceRatioPct).toBeCloseTo(100);
  });

  it.each([
    [4, 7],
    [7, 4],
    [0, 0],
  ])("開始14日目でも今週%d日・前週%d日なら体重記録不足", (currentDays, previousDays) => {
    const result = calcBulkWeeklyPlanPace({
      ...base,
      logs: [...dailyLogs(1, previousDays, 0.03), ...dailyLogs(8, 7 + currentDays, 0.03)],
    });
    expect(result).toMatchObject({
      state: "data_insufficient",
      dataInsufficientReason: "weight_records",
      currentWeightDays: currentDays,
      previousWeightDays: previousDays,
    });
  });

  it.each([
    ["2026-03-28", "2026-04-10", "2026-04-30"],
    ["2026-12-28", "2027-01-10", "2027-01-31"],
  ])("月・年をまたぐ開始日%sでも13日目から14日目の境界を正しく扱う", (startDate, today, targetDate) => {
    const input = {
      ...base,
      startDate,
      today,
      targetDate,
      entries: [entry(startDate.slice(0, 7), 75.1, 0.1), entry(targetDate.slice(0, 7), 75.6, 0.5)],
    };
    const logs = [...buildBulkDailyPlanWeightMap(input)].map(([log_date, weight]) => ({ log_date, weight }));
    const waiting = calcBulkWeeklyPlanPace({ ...input, logs, today: addDaysStr(today, -1)! });
    expect(waiting).toMatchObject({
      dataInsufficientReason: "season_start",
      earliestEvaluationDate: today,
      currentWeightDays: 7,
      previousWeightDays: 6,
    });
    const ready = calcBulkWeeklyPlanPace({ ...input, logs });
    expect(ready).toMatchObject({
      state: "on_plan",
      dataInsufficientReason: null,
      currentWeightDays: 7,
      previousWeightDays: 7,
    });
    expect(ready.paceRatioPct).toBeCloseTo(100);
  });

  it("開始14日目より後も今日基準の14日窓だけを集計する", () => {
    const result = calcBulkWeeklyPlanPace({
      ...base,
      today: "2026-04-20",
      logs: [...dailyLogs(1, 6, 0.03), ...dailyLogs(8, 11, 0.03), ...dailyLogs(14, 20, 0.03)],
    });
    expect(result).toMatchObject({
      dataInsufficientReason: "weight_records",
      currentWeightDays: 7,
      previousWeightDays: 4,
    });
  });

  it.each([
    { today: "2026-04-13", entries: [entry("2026-04", 76.1, 1.1)] },
    { today: "2026-04-13", targetDate: "2026-04-12", entries: [entry("2026-04", 75.2, 0.2)] },
  ])("開始直後でも月次計画の問題は判定待ちより優先する: %j", (overrides) => {
    const result = calcBulkWeeklyPlanPace({ ...base, ...overrides, logs: dailyLogs(1, 13, 0.03) });
    expect(result).toMatchObject({
      state: "plan_check",
      dataInsufficientReason: null,
      currentWeightDays: 7,
      previousWeightDays: 6,
    });
  });

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
