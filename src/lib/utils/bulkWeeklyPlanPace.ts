import {
  buildMonthlyGoalPlan,
  type MonthlyGoalEntry,
  type MonthlyGoalOverride,
} from "@/lib/utils/monthlyGoalPlan";
import { dateRangeStr } from "@/lib/utils/date";

export const MAX_BULK_MONTHLY_GAIN_KG = 1.0;
export const MIN_BULK_WEEKLY_WEIGHT_DAYS = 5;

const DIRECTION_TOLERANCE_KG = 0.05;
const MAINTENANCE_PLAN_THRESHOLD_KG = 0.05;
const MAINTENANCE_FAST_THRESHOLD_KG = 0.1;

export type BulkWeeklyPaceState =
  | "on_plan"
  | "slow"
  | "slightly_fast"
  | "over_pace"
  | "wrong_direction"
  | "data_insufficient"
  | "plan_check";

interface WeightLog {
  log_date: string;
  weight: number | null;
}

export interface BulkMonthlyGainLimitViolation {
  month: string;
  plannedDeltaKg: number;
  allowedDeltaKg: number;
}

export interface BulkWeeklyPlanPace {
  state: BulkWeeklyPaceState;
  actualChangeKg: number | null;
  plannedChangeKg: number | null;
  paceRatioPct: number | null;
  actualChangePct: number | null;
  currentWeightDays: number;
  previousWeightDays: number;
  monthlyLimitViolations: BulkMonthlyGainLimitViolation[];
}

/** Bulkの開始・目標・手動設定から、保存可否に使う月次上限超過を算出する。 */
export function validateBulkMonthlyPlanLimit(input: {
  phase: string;
  startDate: string;
  startWeight: number;
  targetDate: string;
  targetWeight: number;
  planStartMonth?: string | null;
  planStartWeight?: number | null;
  overrides?: MonthlyGoalOverride[];
}): BulkMonthlyGainLimitViolation[] {
  if (input.phase !== "Bulk") return [];

  const plan = buildMonthlyGoalPlan({
    currentWeight: input.planStartWeight ?? input.startWeight,
    today: input.startDate,
    planStartMonth: input.planStartMonth ?? input.startDate.slice(0, 7),
    planStartDate: input.startDate,
    phase: input.phase,
    finalGoalWeight: input.targetWeight,
    goalDeadlineDate: input.targetDate,
    monthlyActuals: [],
    overrides: input.overrides ?? [],
  });
  if (!plan.isValid) return [];

  return findBulkMonthlyGainLimitViolations({
    startDate: input.startDate,
    targetDate: input.targetDate,
    entries: plan.entries,
  });
}

function monthEndDate(month: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const days = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(days).padStart(2, "0")}`;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function effectiveEntryEndDate(month: string, targetDate: string): string | null {
  return month === targetDate.slice(0, 7) ? targetDate : monthEndDate(month);
}

/** Bulkの各月について、月+1kgを日数按分した上限超過を返す。 */
export function findBulkMonthlyGainLimitViolations(input: {
  startDate: string;
  targetDate: string;
  entries: MonthlyGoalEntry[];
}): BulkMonthlyGainLimitViolation[] {
  const startMonth = input.startDate.slice(0, 7);

  return input.entries.flatMap((entry) => {
    const entryEnd = effectiveEntryEndDate(entry.month, input.targetDate);
    const calendarMonthEnd = monthEndDate(entry.month);
    if (!entryEnd || !calendarMonthEnd) return [];

    const entryStart = entry.month === startMonth
      ? input.startDate
      : `${entry.month}-01`;
    const eligibleDays = dateRangeStr(entryStart, entryEnd).length;
    const daysInMonth = dateRangeStr(`${entry.month}-01`, calendarMonthEnd).length;
    if (eligibleDays === 0 || daysInMonth === 0) return [];

    const allowedDeltaKg = MAX_BULK_MONTHLY_GAIN_KG * eligibleDays / daysInMonth;
    if (entry.requiredDeltaKg <= allowedDeltaKg + 0.005) return [];

    return [{
      month: entry.month,
      plannedDeltaKg: round2(entry.requiredDeltaKg),
      allowedDeltaKg: round2(allowedDeltaKg),
    }];
  });
}

/** 月次目標アンカー間を線形補間し、日付ごとの計画体重を返す。 */
export function buildBulkDailyPlanWeightMap(input: {
  startDate: string;
  startWeight: number;
  targetDate: string;
  entries: MonthlyGoalEntry[];
}): Map<string, number> {
  const anchors: Array<{ date: string; weight: number }> = [
    { date: input.startDate, weight: input.startWeight },
  ];

  for (const entry of input.entries) {
    const date = effectiveEntryEndDate(entry.month, input.targetDate);
    if (!date || date < input.startDate || date > input.targetDate) continue;
    const existing = anchors.find((anchor) => anchor.date === date);
    if (existing) {
      existing.weight = entry.targetWeight;
    } else {
      anchors.push({ date, weight: entry.targetWeight });
    }
  }
  anchors.sort((a, b) => a.date.localeCompare(b.date));

  const result = new Map<string, number>();
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const from = anchors[index]!;
    const to = anchors[index + 1]!;
    const dates = dateRangeStr(from.date, to.date);
    if (dates.length === 0) continue;
    const denominator = Math.max(dates.length - 1, 1);
    dates.forEach((date, dayIndex) => {
      const progress = dates.length === 1 ? 1 : dayIndex / denominator;
      result.set(date, from.weight + (to.weight - from.weight) * progress);
    });
  }
  return result;
}

export function classifyBulkWeeklyPace(
  actualChangeKg: number,
  plannedChangeKg: number
): BulkWeeklyPaceState {
  if (plannedChangeKg < 0) return "plan_check";
  if (actualChangeKg < -DIRECTION_TOLERANCE_KG) return "wrong_direction";

  if (plannedChangeKg < MAINTENANCE_PLAN_THRESHOLD_KG) {
    if (actualChangeKg <= DIRECTION_TOLERANCE_KG) return "on_plan";
    if (actualChangeKg <= MAINTENANCE_FAST_THRESHOLD_KG) return "slightly_fast";
    return "over_pace";
  }

  if (actualChangeKg < plannedChangeKg * 0.5) return "slow";
  if (actualChangeKg <= plannedChangeKg * 1.1) return "on_plan";
  if (actualChangeKg <= plannedChangeKg * 1.5) return "slightly_fast";
  return "over_pace";
}

/**
 * 実績と同じ記録日を使って、実績前週比と月次計画上の前週比を比較する。
 * 直近/前週のどちらかが5日未満、シーズン開始から14日未満なら判定保留。
 */
export function calcBulkWeeklyPlanPace(input: {
  startDate: string;
  startWeight: number;
  targetDate: string;
  entries: MonthlyGoalEntry[];
  logs: WeightLog[];
  today: string;
}): BulkWeeklyPlanPace {
  const monthlyLimitViolations = findBulkMonthlyGainLimitViolations(input);
  const fallback = (
    state: BulkWeeklyPaceState,
    currentWeightDays = 0,
    previousWeightDays = 0
  ): BulkWeeklyPlanPace => ({
    state,
    actualChangeKg: null,
    plannedChangeKg: null,
    paceRatioPct: null,
    actualChangePct: null,
    currentWeightDays,
    previousWeightDays,
    monthlyLimitViolations,
  });

  if (monthlyLimitViolations.length > 0 || input.today > input.targetDate) {
    return fallback("plan_check");
  }

  const dailyPlan = buildBulkDailyPlanWeightMap(input);
  const comparisonDates = dateRangeStr(input.startDate, input.today);
  if (comparisonDates.length < 14) return fallback("data_insufficient");

  const currentStartIndex = comparisonDates.length - 7;
  const previousStartIndex = comparisonDates.length - 14;
  const currentDateSet = new Set(comparisonDates.slice(currentStartIndex));
  const previousDateSet = new Set(
    comparisonDates.slice(previousStartIndex, currentStartIndex)
  );

  const latestWeightByDate = new Map<string, number>();
  for (const log of input.logs) {
    if (
      log.weight !== null &&
      log.log_date >= input.startDate &&
      log.log_date <= input.today
    ) {
      latestWeightByDate.set(log.log_date, log.weight);
    }
  }

  const currentDates = [...currentDateSet].filter((date) => latestWeightByDate.has(date));
  const previousDates = [...previousDateSet].filter((date) => latestWeightByDate.has(date));
  if (
    currentDates.length < MIN_BULK_WEEKLY_WEIGHT_DAYS ||
    previousDates.length < MIN_BULK_WEEKLY_WEIGHT_DAYS
  ) {
    return fallback("data_insufficient", currentDates.length, previousDates.length);
  }

  const currentActualAvg = average(currentDates.map((date) => latestWeightByDate.get(date)!));
  const previousActualAvg = average(previousDates.map((date) => latestWeightByDate.get(date)!));
  const currentPlanValues = currentDates.map((date) => dailyPlan.get(date));
  const previousPlanValues = previousDates.map((date) => dailyPlan.get(date));
  if (
    currentActualAvg === null ||
    previousActualAvg === null ||
    currentPlanValues.some((value) => value === undefined) ||
    previousPlanValues.some((value) => value === undefined)
  ) {
    return fallback("plan_check", currentDates.length, previousDates.length);
  }

  const currentPlanAvg = average(currentPlanValues as number[]);
  const previousPlanAvg = average(previousPlanValues as number[]);
  if (currentPlanAvg === null || previousPlanAvg === null) {
    return fallback("plan_check", currentDates.length, previousDates.length);
  }

  const actualChangeKg = currentActualAvg - previousActualAvg;
  const plannedChangeKg = currentPlanAvg - previousPlanAvg;
  const state = classifyBulkWeeklyPace(actualChangeKg, plannedChangeKg);
  const paceRatioPct = plannedChangeKg > 0
    ? actualChangeKg / plannedChangeKg * 100
    : null;
  const actualChangePct = previousActualAvg > 0
    ? actualChangeKg / previousActualAvg * 100
    : null;

  return {
    state,
    actualChangeKg,
    plannedChangeKg,
    paceRatioPct,
    actualChangePct,
    currentWeightDays: currentDates.length,
    previousWeightDays: previousDates.length,
    monthlyLimitViolations,
  };
}
