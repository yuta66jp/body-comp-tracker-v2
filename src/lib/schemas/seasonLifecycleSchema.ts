import { parseLocalDateStr } from "@/lib/utils/date";
import { parseStrictNumber } from "@/lib/utils/parseNumber";
import type { SeasonPhase } from "@/lib/domain/season";

export interface SeasonStartInput {
  expectedActiveSeasonId: number | null;
  name: string;
  phase: string;
  startDate: string;
  targetDate: string;
  targetWeight: string;
}

export interface SeasonEndInput {
  expectedActiveSeasonId: number;
  endDate: string;
}

export interface SeasonGoalInput {
  expectedActiveSeasonId: number;
  targetDate: string;
  targetWeight: string;
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
}> {
  const errors: SeasonLifecycleValidationError[] = [];
  const expectedActiveSeasonId = validateExpectedSeasonId(
    input.expectedActiveSeasonId,
    true,
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
    data: { name, phase, startDate, targetDate, targetWeight, expectedActiveSeasonId },
  };
}

export function parseSeasonEndInput(
  input: SeasonEndInput,
  today: string
): ValidationResult<{ endDate: string; expectedActiveSeasonId: number }> {
  const errors: SeasonLifecycleValidationError[] = [];
  const expectedActiveSeasonId = validateExpectedSeasonId(
    input.expectedActiveSeasonId,
    false,
    errors
  );
  const endDate = validateDate("endDate", input.endDate, "終了日", errors);
  if (endDate !== null && endDate > today) {
    errors.push({ field: "endDate", message: "終了日は今日以前にしてください" });
  }
  if (errors.length > 0 || endDate === null || expectedActiveSeasonId === null) {
    return { ok: false, errors };
  }
  return { ok: true, data: { endDate, expectedActiveSeasonId } };
}

export function parseSeasonGoalInput(
  input: SeasonGoalInput
): ValidationResult<{
  targetDate: string;
  targetWeight: number;
  expectedActiveSeasonId: number;
}> {
  const errors: SeasonLifecycleValidationError[] = [];
  const expectedActiveSeasonId = validateExpectedSeasonId(
    input.expectedActiveSeasonId,
    false,
    errors
  );
  const targetDate = validateDate("targetDate", input.targetDate, "目標日", errors);
  const targetWeight = validateTargetWeight(input.targetWeight, errors);
  if (
    errors.length > 0 ||
    targetDate === null ||
    targetWeight === null ||
    expectedActiveSeasonId === null
  ) {
    return { ok: false, errors };
  }
  return { ok: true, data: { targetDate, targetWeight, expectedActiveSeasonId } };
}
