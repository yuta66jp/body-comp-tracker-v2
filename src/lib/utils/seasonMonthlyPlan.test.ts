import {
  buildSeasonMonthlyPlanSnapshot,
  previewSeasonGoalChange,
} from "./seasonMonthlyPlan";

const season = {
  startDate: "2026-03-15",
  startWeight: 75,
  planStartDate: "2026-03-15",
  targetDate: "2026-06-30",
  targetWeight: 69,
  planStartMonth: "2026-03",
  planStartWeight: 75,
  overrides: [{ month: "2026-04", targetWeight: 72 }],
};

describe("previewSeasonGoalChange", () => {
  it("新しい範囲内のoverrideを保持し、最終月と範囲外を削除対象にする", () => {
    const preview = previewSeasonGoalChange(
      {
        ...season,
        overrides: [
          { month: "2026-04", targetWeight: 72 },
          { month: "2026-05", targetWeight: 71 },
          { month: "2026-06", targetWeight: 70 },
        ],
      },
      "2026-05-31",
      70
    );

    expect(preview?.retainedOverrides).toEqual([
      { month: "2026-04", targetWeight: 72 },
    ]);
    expect(preview?.removedOverrides.map((override) => override.month)).toEqual([
      "2026-05",
      "2026-06",
    ]);
    expect(preview?.entries.at(-1)).toMatchObject({
      month: "2026-05",
      targetWeight: 70,
      source: "auto_redistributed",
    });
  });
});

describe("buildSeasonMonthlyPlanSnapshot", () => {
  it("月途中開始でも開始月を含め、終了日までの各月最終体重を固定する", () => {
    const snapshot = buildSeasonMonthlyPlanSnapshot(
      season,
      [
        { log_date: "2026-03-01", weight: 76 },
        { log_date: "2026-03-20", weight: 74.5 },
        { log_date: "2026-03-31", weight: 74 },
        { log_date: "2026-04-15", weight: 72.5 },
        { log_date: "2026-07-01", weight: 68 },
      ],
      "2026-04-30"
    );

    expect(snapshot.map((entry) => entry.month)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    expect(snapshot[0]).toMatchObject({ actualWeight: 74 });
    expect(snapshot[1]).toMatchObject({
      targetWeight: 72,
      source: "manual",
      actualWeight: 72.5,
    });
    expect(snapshot[2]).toMatchObject({ actualWeight: null });
  });

  it("開始月と目標月が同じ場合も1ヶ月のsnapshotを作る", () => {
    const snapshot = buildSeasonMonthlyPlanSnapshot(
      {
        ...season,
        targetDate: "2026-03-31",
        targetWeight: 73,
        overrides: [],
      },
      [{ log_date: "2026-03-20", weight: 74 }],
      "2026-03-31"
    );

    expect(snapshot).toEqual([
      {
        month: "2026-03",
        targetWeight: 73,
        source: "auto_redistributed",
        requiredDeltaKg: -2,
        actualWeight: 74,
      },
    ]);
  });

  it("Bulk計画は目標日超過後に終了しても増量方向のsnapshotを保持する", () => {
    const snapshot = buildSeasonMonthlyPlanSnapshot(
      {
        ...season,
        startWeight: 70,
        planStartWeight: 70,
        targetDate: "2026-05-31",
        targetWeight: 74,
        overrides: [],
      },
      [{ log_date: "2026-05-31", weight: 73.5 }],
      "2026-06-15"
    );

    expect(snapshot.at(-1)).toMatchObject({
      month: "2026-05",
      targetWeight: 74,
      actualWeight: 73.5,
    });
    expect(snapshot.every((entry) => entry.requiredDeltaKg >= 0)).toBe(true);
  });

  it("増量計画開始日前の体重を月末実績へ混入させない", () => {
    const snapshot = buildSeasonMonthlyPlanSnapshot(
      {
        ...season,
        phase: "Bulk",
        planStartDate: "2026-04-15",
        planStartMonth: "2026-04",
        planStartWeight: 70,
        targetWeight: 72,
        overrides: [],
      },
      [
        { log_date: "2026-04-10", weight: 75 },
      ],
      "2026-04-30"
    );

    expect(snapshot[0]).toMatchObject({
      month: "2026-04",
      actualWeight: null,
    });
  });
});
