import { parseLocalDateStr } from "@/lib/utils/date";
import { normalizeMonthlyGoalOverrides } from "@/lib/utils/monthlyGoalPlan";
import type { SettingsInput } from "@/lib/schemas/settingsSchema";

export function normalizeMonthlyPlanOverridesBeforeSave(
  input: SettingsInput,
  today: string
): SettingsInput {
  const rawOverrides = input.monthly_plan_overrides.trim();
  const contestDate = input.contest_date.trim();

  if (rawOverrides === "" || parseLocalDateStr(contestDate) === null) {
    return input;
  }

  try {
    const parsed = JSON.parse(rawOverrides);
    if (!Array.isArray(parsed)) return input;

    const normalized = normalizeMonthlyGoalOverrides({
      overrides: parsed,
      today,
      goalDeadlineDate: contestDate,
    });

    return {
      ...input,
      monthly_plan_overrides:
        normalized.length > 0 ? JSON.stringify(normalized) : "",
    };
  } catch {
    return input;
  }
}
