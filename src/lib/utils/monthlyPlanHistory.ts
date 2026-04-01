import type { MonthlyGoalOverride } from "@/lib/utils/monthlyGoalPlan";
import { parseLocalDateStr } from "@/lib/utils/date";

export interface ResolveMonthlyPlanHistoryInput {
  explicitStartMonth?: string | null;
  explicitStartWeight?: number | null;
  goalDeadlineDate?: string | null;
  overrides?: MonthlyGoalOverride[] | null;
  currentWeight?: number | null;
  today: string;
}

export interface MonthlyPlanHistoryAnchor {
  startMonth: string | null;
  startWeight: number | null;
  source: "explicit" | "legacy_override" | "current_month" | "unavailable";
}

export function isValidYearMonth(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function isValidWeight(value: number | null | undefined): value is number {
  return typeof value === "number" && isFinite(value) && value > 0 && value <= 300;
}

function toDeadlineMonth(goalDeadlineDate: string | null | undefined): string | null {
  if (!goalDeadlineDate || parseLocalDateStr(goalDeadlineDate) === null) return null;
  return goalDeadlineDate.slice(0, 7);
}

/**
 * 月次計画の履歴アンカー (開始月 + 開始時基準体重) を解決する。
 *
 * 優先順位:
 * 1. 保存済みの explicit start metadata
 * 2. legacy data の最古 override 月 (その月の手動 target を開始アンカーとみなす)
 * 3. 現在月 + 現在体重
 *
 * legacy データでは開始時の基準体重が保存されていないため、
 * 最古 override 月を plan start とし、その targetWeight を開始アンカーとして扱う。
 * これにより past override を履歴として残しつつ、過去月の plan rows を継続表示できる。
 */
export function resolveMonthlyPlanHistoryAnchor(
  input: ResolveMonthlyPlanHistoryInput
): MonthlyPlanHistoryAnchor {
  const deadlineMonth = toDeadlineMonth(input.goalDeadlineDate);
  const todayMonth = input.today.slice(0, 7);

  if (
    isValidYearMonth(input.explicitStartMonth) &&
    isValidWeight(input.explicitStartWeight) &&
    (deadlineMonth === null || input.explicitStartMonth <= deadlineMonth)
  ) {
    return {
      startMonth: input.explicitStartMonth,
      startWeight: input.explicitStartWeight,
      source: "explicit",
    };
  }

  const validOverrides = (input.overrides ?? [])
    .filter((override) =>
      isValidYearMonth(override.month) &&
      isValidWeight(override.targetWeight) &&
      (deadlineMonth === null || override.month <= deadlineMonth)
    )
    .sort((a, b) => a.month.localeCompare(b.month));

  if (validOverrides.length > 0) {
    return {
      startMonth: validOverrides[0]!.month,
      startWeight: validOverrides[0]!.targetWeight,
      source: "legacy_override",
    };
  }

  if (deadlineMonth !== null && isValidWeight(input.currentWeight)) {
    return {
      startMonth: todayMonth,
      startWeight: input.currentWeight,
      source: "current_month",
    };
  }

  return {
    startMonth: null,
    startWeight: null,
    source: "unavailable",
  };
}
