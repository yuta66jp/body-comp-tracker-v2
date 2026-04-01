import { normalizeMonthlyPlanOverridesBeforeSave } from "@/lib/utils/normalizeMonthlyPlanOverridesBeforeSave";
import { EMPTY_SETTINGS_INPUT } from "@/lib/schemas/settingsSchema";

describe("normalizeMonthlyPlanOverridesBeforeSave", () => {
  it("開始月より前・期限月・期限後の override を保存前に除外する", () => {
    const result = normalizeMonthlyPlanOverridesBeforeSave({
      ...EMPTY_SETTINGS_INPUT,
      contest_date: "2026-06-30",
      monthly_plan_start_month: "2026-03",
      monthly_plan_start_weight: "78.0",
      monthly_plan_overrides: JSON.stringify([
        { month: "2026-02", targetWeight: 77.5 },
        { month: "2026-03", targetWeight: 76.0 },
        { month: "2026-04", targetWeight: 75.0 },
        { month: "2026-06", targetWeight: 72.5 },
        { month: "2026-07", targetWeight: 71.0 },
      ]),
    }, "2026-04-02");

    expect(JSON.parse(result.monthly_plan_overrides)).toEqual([
      { month: "2026-03", targetWeight: 76.0 },
      { month: "2026-04", targetWeight: 75.0 },
    ]);
    expect(result.monthly_plan_start_month).toBe("2026-03");
    expect(result.monthly_plan_start_weight).toBe("78");
  });

  it("有効な期限日がない場合は monthly_plan_overrides を変更しない", () => {
    const monthlyPlanOverrides = JSON.stringify([
      { month: "2026-03", targetWeight: 76.0 },
    ]);

    const result = normalizeMonthlyPlanOverridesBeforeSave({
      ...EMPTY_SETTINGS_INPUT,
      contest_date: "invalid-date",
      monthly_plan_overrides: monthlyPlanOverrides,
    }, "2026-04-02");

    expect(result.monthly_plan_overrides).toBe(monthlyPlanOverrides);
  });
});
