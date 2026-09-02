import {
  buildMonthlyGoalPlan,
  normalizeMonthlyGoalOverrides,
} from "@/lib/utils/monthlyGoalPlan";
import type {
  MonthlyGoalEntry,
  MonthlyGoalOverride,
} from "@/lib/utils/monthlyGoalPlan";

export interface SeasonMonthlyPlanInput {
  phase?: string;
  startDate: string;
  startWeight: number;
  planStartDate: string;
  targetDate: string;
  targetWeight: number;
  planStartMonth: string;
  planStartWeight: number;
  overrides: MonthlyGoalOverride[];
}

interface WeightLog {
  log_date: string;
  weight: number | null;
}

export interface GoalChangePreview {
  entries: MonthlyGoalEntry[];
  retainedOverrides: MonthlyGoalOverride[];
  removedOverrides: MonthlyGoalOverride[];
}

export function previewSeasonGoalChange(
  season: SeasonMonthlyPlanInput,
  targetDate: string,
  targetWeight: number
): GoalChangePreview | null {
  const retainedOverrides = normalizeMonthlyGoalOverrides({
    overrides: season.overrides,
    planStartMonth: season.planStartMonth,
    goalDeadlineDate: targetDate,
  });
  const retainedMonths = new Set(retainedOverrides.map((override) => override.month));
  const removedOverrides = season.overrides.filter(
    (override) => !retainedMonths.has(override.month)
  );
  const plan = buildMonthlyGoalPlan({
    currentWeight: season.planStartWeight,
    today: season.planStartDate,
    planStartMonth: season.planStartMonth,
    planStartDate: season.planStartDate,
    phase: season.phase,
    finalGoalWeight: targetWeight,
    goalDeadlineDate: targetDate,
    monthlyActuals: [],
    overrides: retainedOverrides,
  });

  if (!plan.isValid) return null;
  return { entries: plan.entries, retainedOverrides, removedOverrides };
}

export function buildSeasonMonthlyPlanSnapshot(
  season: SeasonMonthlyPlanInput,
  logs: WeightLog[],
  snapshotDate: string
): MonthlyGoalEntry[] {
  const latestByMonth = new Map<string, { date: string; weight: number }>();
  for (const log of logs) {
    if (
      log.weight === null ||
      log.log_date < season.planStartDate ||
      log.log_date > snapshotDate
    ) {
      continue;
    }
    const month = log.log_date.slice(0, 7);
    const current = latestByMonth.get(month);
    if (!current || log.log_date > current.date) {
      latestByMonth.set(month, { date: log.log_date, weight: log.weight });
    }
  }

  const plan = buildMonthlyGoalPlan({
    currentWeight: season.planStartWeight,
    today: season.planStartDate,
    planStartMonth: season.planStartMonth,
    planStartDate: season.planStartDate,
    phase: season.phase,
    finalGoalWeight: season.targetWeight,
    goalDeadlineDate: season.targetDate,
    monthlyActuals: [...latestByMonth.entries()].map(([month, value]) => ({
      month,
      endWeight: value.weight,
    })),
    overrides: season.overrides,
  });

  return plan.isValid ? plan.entries : [];
}
