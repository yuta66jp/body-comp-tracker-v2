import { parseLocalDateStr } from "@/lib/utils/date";
import { parseStrictNumber } from "@/lib/utils/parseNumber";
import type { SeasonPhase } from "@/lib/domain/season";

export interface SeasonStartInput {
  expectedActiveSeasonId: number | null;
  expectedActiveSeasonUpdatedAt: string | null;
  name: string;
  phase: string;
  startDate: string;
  targetDate: string;
  targetWeight: string;
}

export interface SeasonEndInput {
  expectedActiveSeasonId: number;
  expectedActiveSeasonUpdatedAt: string;
  endDate: string;
}

export interface SeasonGoalInput {
  expectedActiveSeasonId: number;
  expectedActiveSeasonUpdatedAt: string;
  targetDate: string;
  targetWeight: string;
}

export interface SeasonPlanOverridesInput {
  expectedActiveSeasonId: number;
  expectedActiveSeasonUpdatedAt: string;
  overrides: Array<{ month: string; targetWeight: number }>;
  resetAll: boolean;
}

export interface SeasonPlanStartInput {
  expectedActiveSeasonId: number;
  expectedActiveSeasonUpdatedAt: string;
  planStartDate: string;
}

export interface CompletedSeasonEditInput {
  expectedCompletedSeasonId: number;
  expectedCompletedSeasonUpdatedAt: string;
  name: string;
  phase: string;
  endDate: string;
}

export interface SeasonLifecycleValidationError {
  field: string;
  message: string;
}

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: SeasonLifecycleValidationError[] };

function validateExpectedSeasonId(
  value: number | null,
  nullable: boolean,
  errors: SeasonLifecycleValidationError[]
): number | null {
  if (value === null && nullable) return null;
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    errors.push({ field: "season", message: "画面を再読み込みしてください" });
    return null;
  }
  return value;
}

function validateExpectedSeasonUpdatedAt(
  value: string | null,
  nullable: boolean,
  errors: SeasonLifecycleValidationError[]
): string | null {
  if (value === null && nullable) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    errors.push({ field: "season", message: "画面を再読み込みしてください" });
    return null;
  }
  return value;
}

function validateTargetWeight(
  raw: string,
  errors: SeasonLifecycleValidationError[]
): number | null {
  const targetWeight = parseStrictNumber(raw.trim());
  if (targetWeight === null || targetWeight < 20 || targetWeight > 200) {
    errors.push({ field: "targetWeight", message: "20〜200kgで入力してください" });
    return null;
  }
  return targetWeight;
}

function validateDate(
  field: string,
  raw: string,
  label: string,
  errors: SeasonLifecycleValidationError[]
): string | null {
  if (parseLocalDateStr(raw) === null) {
    errors.push({ field, message: `${label}を正しく入力してください` });
    return null;
  }
  return raw;
}

export function parseSeasonStartInput(
  input: SeasonStartInput,
  today: string
): ValidationResult<{
  name: string;
  phase: SeasonPhase;
  startDate: string;
  targetDate: string;
  targetWeight: number;
  expectedActiveSeasonId: number | null;
  expectedActiveSeasonUpdatedAt: string | null;
}> {
  const errors: SeasonLifecycleValidationError[] = [];
  const expectedActiveSeasonId = validateExpectedSeasonId(
    input.expectedActiveSeasonId,
    true,
    errors
  );
  const expectedActiveSeasonUpdatedAt = validateExpectedSeasonUpdatedAt(
    input.expectedActiveSeasonUpdatedAt,
    true,
    errors
  );
  if ((expectedActiveSeasonId === null) !== (expectedActiveSeasonUpdatedAt === null)) {
    errors.push({ field: "season", message: "画面を再読み込みしてください" });
  }
  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) {
    errors.push({ field: "name", message: "1〜100文字で入力してください" });
  }

  const phase = input.phase === "Cut" || input.phase === "Bulk"
    ? input.phase
    : null;
  if (phase === null) {
    errors.push({ field: "phase", message: "CutまたはBulkを選択してください" });
  }

  const startDate = validateDate("startDate", input.startDate, "開始日", errors);
  const targetDate = validateDate("targetDate", input.targetDate, "目標日", errors);
  const targetWeight = validateTargetWeight(input.targetWeight, errors);

  if (startDate !== null && startDate > today) {
    errors.push({ field: "startDate", message: "開始日は今日以前にしてください" });
  }
  if (startDate !== null && targetDate !== null && targetDate < startDate) {
    errors.push({ field: "targetDate", message: "目標日は開始日以降にしてください" });
  }

  if (errors.length > 0 || phase === null || startDate === null || targetDate === null || targetWeight === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    data: {
      name,
      phase,
      startDate,
      targetDate,
      targetWeight,
      expectedActiveSeasonId,
      expectedActiveSeasonUpdatedAt,
    },
  };
}

export function parseSeasonEndInput(
  input: SeasonEndInput,
  today: string
): ValidationResult<{
  endDate: string;
  expectedActiveSeasonId: number;
  expectedActiveSeasonUpdatedAt: string;
}> {
  const errors: SeasonLifecycleValidationError[] = [];
  const expectedActiveSeasonId = validateExpectedSeasonId(
    input.expectedActiveSeasonId,
    false,
    errors
  );
  const expectedActiveSeasonUpdatedAt = validateExpectedSeasonUpdatedAt(
    input.expectedActiveSeasonUpdatedAt,
    false,
    errors
  );
  const endDate = validateDate("endDate", input.endDate, "終了日", errors);
  if (endDate !== null && endDate > today) {
    errors.push({ field: "endDate", message: "終了日は今日以前にしてください" });
  }
  if (
    errors.length > 0 ||
    endDate === null ||
    expectedActiveSeasonId === null ||
    expectedActiveSeasonUpdatedAt === null
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    data: { endDate, expectedActiveSeasonId, expectedActiveSeasonUpdatedAt },
  };
}

export function parseCompletedSeasonEditInput(
  input: CompletedSeasonEditInput,
  today: string
): ValidationResult<{
  expectedCompletedSeasonId: number;
  expectedCompletedSeasonUpdatedAt: string;
  name: string;
  phase: SeasonPhase;
  endDate: string;
}> {
  const errors: SeasonLifecycleValidationError[] = [];
  const expectedCompletedSeasonId = validateExpectedSeasonId(
    input.expectedCompletedSeasonId,
    false,
    errors
  );
  const expectedCompletedSeasonUpdatedAt = validateExpectedSeasonUpdatedAt(
    input.expectedCompletedSeasonUpdatedAt,
    false,
    errors
  );
  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) {
    errors.push({ field: "name", message: "1〜100文字で入力してください" });
  }
  const phase = input.phase === "Cut" || input.phase === "Bulk"
    ? input.phase
    : null;
  if (phase === null) {
    errors.push({ field: "phase", message: "CutまたはBulkを選択してください" });
  }
  const endDate = validateDate("endDate", input.endDate, "終了日", errors);
  if (endDate !== null && endDate > today) {
    errors.push({ field: "endDate", message: "終了日は今日以前にしてください" });
  }

  if (
    errors.length > 0 ||
    expectedCompletedSeasonId === null ||
    expectedCompletedSeasonUpdatedAt === null ||
    phase === null ||
    endDate === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      expectedCompletedSeasonId,
      expectedCompletedSeasonUpdatedAt,
      name,
      phase,
      endDate,
    },
  };
}

export function parseSeasonGoalInput(
  input: SeasonGoalInput
): ValidationResult<{
  targetDate: string;
  targetWeight: number;
  expectedActiveSeasonId: number;
  expectedActiveSeasonUpdatedAt: string;
}> {
  const errors: SeasonLifecycleValidationError[] = [];
  const expectedActiveSeasonId = validateExpectedSeasonId(
    input.expectedActiveSeasonId,
    false,
    errors
  );
  const expectedActiveSeasonUpdatedAt = validateExpectedSeasonUpdatedAt(
    input.expectedActiveSeasonUpdatedAt,
    false,
    errors
  );
  const targetDate = validateDate("targetDate", input.targetDate, "目標日", errors);
  const targetWeight = validateTargetWeight(input.targetWeight, errors);
  if (
    errors.length > 0 ||
    targetDate === null ||
    targetWeight === null ||
    expectedActiveSeasonId === null ||
    expectedActiveSeasonUpdatedAt === null
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    data: {
      targetDate,
      targetWeight,
      expectedActiveSeasonId,
      expectedActiveSeasonUpdatedAt,
    },
  };
}

export function parseSeasonPlanStartInput(
  input: SeasonPlanStartInput,
  today: string
): ValidationResult<SeasonPlanStartInput> {
  const errors: SeasonLifecycleValidationError[] = [];
  const expectedActiveSeasonId = validateExpectedSeasonId(
    input.expectedActiveSeasonId,
    false,
    errors
  );
  const expectedActiveSeasonUpdatedAt = validateExpectedSeasonUpdatedAt(
    input.expectedActiveSeasonUpdatedAt,
    false,
    errors
  );
  const planStartDate = validateDate(
    "planStartDate",
    input.planStartDate,
    "増量計画開始日",
    errors
  );
  if (planStartDate !== null && planStartDate > today) {
    errors.push({ field: "planStartDate", message: "増量計画開始日は今日以前にしてください" });
  }
  if (
    errors.length > 0 ||
    expectedActiveSeasonId === null ||
    expectedActiveSeasonUpdatedAt === null ||
    planStartDate === null
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    data: {
      expectedActiveSeasonId,
      expectedActiveSeasonUpdatedAt,
      planStartDate,
    },
  };
}

export function parseSeasonPlanOverridesInput(
  input: SeasonPlanOverridesInput
): ValidationResult<SeasonPlanOverridesInput> {
  const errors: SeasonLifecycleValidationError[] = [];
  const expectedActiveSeasonId = validateExpectedSeasonId(
    input.expectedActiveSeasonId,
    false,
    errors
  );
  const expectedActiveSeasonUpdatedAt = validateExpectedSeasonUpdatedAt(
    input.expectedActiveSeasonUpdatedAt,
    false,
    errors
  );
  const seenMonths = new Set<string>();
  if (typeof input.resetAll !== "boolean" || (input.resetAll && input.overrides.length > 0)) {
    errors.push({ field: "overrides", message: "リセット内容を確認してください" });
  }
  for (const override of input.overrides) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(override.month)) {
      errors.push({ field: "overrides", message: "対象月を確認してください" });
    }
    if (
      !Number.isFinite(override.targetWeight) ||
      override.targetWeight < 20 ||
      override.targetWeight > 200
    ) {
      errors.push({ field: "overrides", message: "20〜200kgで入力してください" });
    }
    if (seenMonths.has(override.month)) {
      errors.push({ field: "overrides", message: "同じ月を重複して設定できません" });
    }
    seenMonths.add(override.month);
  }

  if (
    errors.length > 0 ||
    expectedActiveSeasonId === null ||
    expectedActiveSeasonUpdatedAt === null
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    data: {
      expectedActiveSeasonId,
      expectedActiveSeasonUpdatedAt,
      overrides: input.overrides,
      resetAll: input.resetAll,
    },
  };
}
