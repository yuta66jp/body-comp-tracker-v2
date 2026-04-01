import { parseLocalDateStr } from "@/lib/utils/date";
import { normalizeMonthlyGoalOverrides } from "@/lib/utils/monthlyGoalPlan";
import { resolveMonthlyPlanHistoryAnchor } from "@/lib/utils/monthlyPlanHistory";
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

    const history = resolveMonthlyPlanHistoryAnchor({
      explicitStartMonth: input.monthly_plan_start_month || null,
      explicitStartWeight: (() => {
        const parsedWeight = parseFloat(input.monthly_plan_start_weight ?? "");
        return isFinite(parsedWeight) ? parsedWeight : null;
      })(),
      goalDeadlineDate: contestDate,
      overrides: parsed,
      currentWeight: (() => {
        const parsedWeight = parseFloat(input.monthly_plan_start_weight ?? "");
        return isFinite(parsedWeight) ? parsedWeight : null;
      })(),
      today,
    });

    const normalized = history.startMonth
      ? normalizeMonthlyGoalOverrides({
          overrides: parsed,
          planStartMonth: history.startMonth,
          goalDeadlineDate: contestDate,
        })
      : parsed;

    return {
      ...input,
      monthly_plan_start_month: history.startMonth ?? "",
      monthly_plan_start_weight:
        history.startWeight !== null ? String(history.startWeight) : "",
      monthly_plan_overrides:
        normalized.length > 0 ? JSON.stringify(normalized) : "",
    };
  } catch {
    return input;
  }
}
