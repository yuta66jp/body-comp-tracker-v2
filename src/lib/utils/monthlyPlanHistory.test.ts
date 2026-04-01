import { resolveMonthlyPlanHistoryAnchor } from "./monthlyPlanHistory";

describe("resolveMonthlyPlanHistoryAnchor", () => {
  it("保存済み start metadata があればそれを優先する", () => {
    const result = resolveMonthlyPlanHistoryAnchor({
      explicitStartMonth: "2026-03",
      explicitStartWeight: 78.2,
      goalDeadlineDate: "2026-06-30",
      overrides: [{ month: "2026-04", targetWeight: 75.0 }],
      currentWeight: 74.8,
      today: "2026-04-02",
    });

    expect(result).toEqual({
      startMonth: "2026-03",
      startWeight: 78.2,
      source: "explicit",
    });
  });

  it("legacy data では最古 override を開始アンカーとして使う", () => {
    const result = resolveMonthlyPlanHistoryAnchor({
      explicitStartMonth: null,
      explicitStartWeight: null,
      goalDeadlineDate: "2026-06-30",
      overrides: [
        { month: "2026-05", targetWeight: 73.5 },
        { month: "2026-03", targetWeight: 76.0 },
      ],
      currentWeight: 74.8,
      today: "2026-04-02",
    });

    expect(result).toEqual({
      startMonth: "2026-03",
      startWeight: 76.0,
      source: "legacy_override",
    });
  });

  it("履歴 metadata も override もなければ current month/current weight を使う", () => {
    const result = resolveMonthlyPlanHistoryAnchor({
      explicitStartMonth: null,
      explicitStartWeight: null,
      goalDeadlineDate: "2026-06-30",
      overrides: [],
      currentWeight: 74.8,
      today: "2026-04-02",
    });

    expect(result).toEqual({
      startMonth: "2026-04",
      startWeight: 74.8,
      source: "current_month",
    });
  });
});
