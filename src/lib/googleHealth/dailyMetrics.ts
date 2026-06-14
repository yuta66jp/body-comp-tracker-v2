import {
  fetchGoogleHealthPoc,
  type GoogleHealthPocRange,
  type GoogleHealthPocTargetResult,
} from "./poc";

const GOOGLE_HEALTH_API_BASE_URL = "https://health.googleapis.com/v4";
export const GOOGLE_HEALTH_STEPS_PLATFORM = "FITBIT";
export const GOOGLE_HEALTH_STEPS_DATA_SOURCE_FAMILY = "users/me/dataSourceFamilies/google-wearables";
export const GOOGLE_HEALTH_RECONCILED_STEPS_DATA_SOURCE_FAMILY = "users/me/dataSourceFamilies/all-sources";

export const GOOGLE_HEALTH_DAILY_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
] as const;

export type GoogleHealthDailyMetric = {
  date: string;
  stepCount: number | null;
  sleepMinutes: number | null;
  deepSleepMinutes: number | null;
  sleepBedAt: string | null;
  sleepWakeAt: string | null;
  hrvMs: number | null;
  rhrBpm: number | null;
};

export type GoogleHealthWeightMetric = {
  date: string;
  weightKg: number;
  sampleTime: string | null;
  dataPointName: string | null;
};

export type GoogleHealthWeightSkipReason =
  | "multiple_weight_logs"
  | "invalid_weight_value"
  | "date_unresolved";

export type GoogleHealthWeightSkippedMetric = {
  date: string | null;
  reason: GoogleHealthWeightSkipReason;
  count?: number;
  message: string;
};

export type GoogleHealthWeightMetrics = {
  metrics: GoogleHealthWeightMetric[];
  skipped: GoogleHealthWeightSkippedMetric[];
};

export type GoogleHealthStepsError = {
  source: "reconcile" | "dailyRollUp" | "listFallback";
  status: number;
  message: string;
  details?: unknown;
};

export type GoogleHealthStepsAttempt = {
  source: GoogleHealthStepsError["source"];
  ok: boolean;
  status: number;
  message?: string;
};

export type GoogleHealthStepsResult =
  | {
      ok: true;
      dataType: "steps";
      source: "reconcile";
      pageCount: number;
      dataPoints: unknown[];
      nextPageToken: string | null;
      attempts: GoogleHealthStepsAttempt[];
    }
  | {
      ok: true;
      dataType: "steps";
      source: "dailyRollUp";
      pageCount: number;
      rollupDataPoints: unknown[];
      nextPageToken: string | null;
      attempts: GoogleHealthStepsAttempt[];
    }
  | {
      ok: true;
      dataType: "steps";
      source: "listFallback";
      pageCount: number;
      dataPoints: unknown[];
      nextPageToken: string | null;
      fallbackFrom: GoogleHealthStepsError;
      attempts: GoogleHealthStepsAttempt[];
    }
  | {
      ok: false;
      dataType: "steps";
      source: "reconcile" | "dailyRollUp" | "listFallback";
      status: number;
      message: string;
      details?: unknown;
      fallbackFrom?: GoogleHealthStepsError;
      attempts: GoogleHealthStepsAttempt[];
    };

export type GoogleHealthWeightResult =
  | {
      ok: true;
      dataType: "weight";
      pageCount: number;
      dataPoints: unknown[];
      nextPageToken: string | null;
      weightMetrics: GoogleHealthWeightMetrics;
    }
  | {
      ok: false;
      dataType: "weight";
      status: number;
      message: string;
      details?: unknown;
    };

export type GoogleHealthDailyMetricsResult = {
  sourceResults: GoogleHealthPocTargetResult[];
  stepsResult: GoogleHealthStepsResult;
  weightResult: GoogleHealthWeightResult;
  weightMetrics: GoogleHealthWeightMetrics;
  dailyMetrics: GoogleHealthDailyMetric[];
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type DailyRollupResponse = {
  rollupDataPoints?: unknown[];
  nextPageToken?: string;
};

type ListResponse = {
  dataPoints?: unknown[];
  nextPageToken?: string;
};

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseGoogleDate(value: unknown): string | null {
  const date = asRecord(value);
  if (!date) return null;

  const year = parseNumber(date.year);
  const month = parseNumber(date.month);
  const day = parseNumber(date.day);
  if (!year || !month || !day) return null;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseOffsetSeconds(value: unknown): number {
  if (typeof value !== "string") return 0;
  const match = value.match(/^(-?\d+(?:\.\d+)?)s$/);
  if (!match) return 0;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : 0;
}

function deriveCivilDateFromTimestamp(timestamp: unknown, utcOffset: unknown): string | null {
  if (typeof timestamp !== "string") return null;
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return null;

  const local = new Date(time + parseOffsetSeconds(utcOffset) * 1000);
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const d = String(parsed.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function eachDateInRange(range: GoogleHealthPocRange): string[] {
  const dates: string[] = [];
  for (let current = range.startDate; current <= range.endDate; current = addDays(current, 1)) {
    dates.push(current);
  }
  return dates;
}

function ensureMetric(map: Map<string, GoogleHealthDailyMetric>, date: string): GoogleHealthDailyMetric {
  const existing = map.get(date);
  if (existing) return existing;

  const metric: GoogleHealthDailyMetric = {
    date,
    stepCount: null,
    sleepMinutes: null,
    deepSleepMinutes: null,
    sleepBedAt: null,
    sleepWakeAt: null,
    hrvMs: null,
    rhrBpm: null,
  };
  map.set(date, metric);
  return metric;
}

function addNullableNumbers(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

function isTargetStepsPlatform(point: RecordValue): boolean {
  const dataSource = asRecord(point.dataSource);
  const platform = dataSource?.platform;
  return typeof platform !== "string" || platform === GOOGLE_HEALTH_STEPS_PLATFORM;
}

function diffMinutes(start: unknown, end: unknown): number | null {
  if (typeof start !== "string" || typeof end !== "string") return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return (endMs - startMs) / 60_000;
}

function parseTimestampIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function applySleepInterval(
  metric: GoogleHealthDailyMetric,
  startTime: unknown,
  endTime: unknown,
): void {
  const startIso = parseTimestampIso(startTime);
  const endIso = parseTimestampIso(endTime);
  if (startIso === null || endIso === null) return;
  if (Date.parse(endIso) < Date.parse(startIso)) return;

  if (metric.sleepBedAt === null || Date.parse(startIso) < Date.parse(metric.sleepBedAt)) {
    metric.sleepBedAt = startIso;
  }
  if (metric.sleepWakeAt === null || Date.parse(endIso) > Date.parse(metric.sleepWakeAt)) {
    metric.sleepWakeAt = endIso;
  }
}

function getStageSummaryMinutes(summary: unknown, stageType: string): number | null {
  const summaryRecord = asRecord(summary);
  const stagesSummary = summaryRecord?.stagesSummary;
  if (!Array.isArray(stagesSummary)) return null;

  const found = stagesSummary
    .map(asRecord)
    .find((stage) => stage?.type === stageType);
  return found ? parseNumber(found.minutes) : null;
}

function sumStageIntervalsMinutes(stages: unknown, stageTypes: Set<string>): number | null {
  if (!Array.isArray(stages)) return null;

  let total = 0;
  let matched = false;
  for (const rawStage of stages) {
    const stage = asRecord(rawStage);
    if (!stage || typeof stage.type !== "string" || !stageTypes.has(stage.type)) continue;

    const minutes = diffMinutes(stage.startTime, stage.endTime);
    if (minutes === null) continue;
    total += minutes;
    matched = true;
  }

  return matched ? total : null;
}

function normalizeSteps(
  map: Map<string, GoogleHealthDailyMetric>,
  dataPoints: unknown[],
): void {
  for (const rawPoint of dataPoints) {
    const point = asRecord(rawPoint);
    if (!point || !isTargetStepsPlatform(point)) continue;

    const steps = asRecord(point?.steps);
    const interval = asRecord(steps?.interval);
    const civilStartTime = asRecord(point?.civilStartTime) ?? asRecord(interval?.civilStartTime);
    const date =
      parseGoogleDate(civilStartTime?.date) ??
      deriveCivilDateFromTimestamp(interval?.startTime, interval?.startUtcOffset);
    if (!date) continue;

    const count = parseNumber(steps?.countSum) ?? parseNumber(steps?.count);
    if (count === null) continue;

    const metric = ensureMetric(map, date);
    metric.stepCount = addNullableNumbers(metric.stepCount, count);
  }
}

function normalizeSleep(
  map: Map<string, GoogleHealthDailyMetric>,
  dataPoints: unknown[],
): void {
  for (const rawPoint of dataPoints) {
    const point = asRecord(rawPoint);
    const sleep = asRecord(point?.sleep);
    const interval = asRecord(sleep?.interval);
    const date = deriveCivilDateFromTimestamp(interval?.endTime, interval?.endUtcOffset);
    if (!date) continue;

    const summary = asRecord(sleep?.summary);
    const sleepMinutes =
      parseNumber(summary?.minutesAsleep) ??
      sumStageIntervalsMinutes(sleep?.stages, new Set(["LIGHT", "REM", "DEEP", "ASLEEP"]));
    const deepSleepMinutes =
      getStageSummaryMinutes(summary, "DEEP") ??
      sumStageIntervalsMinutes(sleep?.stages, new Set(["DEEP"]));

    const metric = ensureMetric(map, date);
    metric.sleepMinutes = addNullableNumbers(metric.sleepMinutes, sleepMinutes);
    metric.deepSleepMinutes = addNullableNumbers(metric.deepSleepMinutes, deepSleepMinutes);
    applySleepInterval(metric, interval?.startTime, interval?.endTime);
  }
}

function normalizeHrv(
  map: Map<string, GoogleHealthDailyMetric>,
  dataPoints: unknown[],
): void {
  for (const rawPoint of dataPoints) {
    const point = asRecord(rawPoint);
    const hrv = asRecord(point?.dailyHeartRateVariability);
    const date = parseGoogleDate(hrv?.date);
    if (!date) continue;

    const value = parseNumber(hrv?.averageHeartRateVariabilityMilliseconds);
    if (value === null) continue;

    ensureMetric(map, date).hrvMs = value;
  }
}

function normalizeRhr(
  map: Map<string, GoogleHealthDailyMetric>,
  dataPoints: unknown[],
): void {
  for (const rawPoint of dataPoints) {
    const point = asRecord(rawPoint);
    const rhr = asRecord(point?.dailyRestingHeartRate);
    const date = parseGoogleDate(rhr?.date);
    if (!date) continue;

    const value = parseNumber(rhr?.beatsPerMinute);
    if (value === null) continue;

    ensureMetric(map, date).rhrBpm = value;
  }
}

function dataPointsFor(
  sourceResults: GoogleHealthPocTargetResult[],
  key: "sleep" | "heartRateVariability" | "restingHeartRate",
): unknown[] {
  const result = sourceResults.find((item) => item.key === key);
  return result?.ok ? result.dataPoints : [];
}

function buildWeightSkippedMetric(args: {
  date: string | null;
  reason: GoogleHealthWeightSkipReason;
  count?: number;
}): GoogleHealthWeightSkippedMetric {
  const countText = args.count !== undefined ? `${args.count}件` : "";
  const message =
    args.reason === "multiple_weight_logs"
      ? `Google Health の体重ログが同日に${countText}あるためスキップしました。`
      : args.reason === "invalid_weight_value"
        ? "Google Health の体重値が不正なためスキップしました。"
        : "Google Health の体重ログの日付を特定できないためスキップしました。";

  return {
    date: args.date,
    reason: args.reason,
    ...(args.count !== undefined ? { count: args.count } : {}),
    message,
  };
}

function resolveWeightMetricDate(weight: RecordValue): string | null {
  const sampleTime = asRecord(weight.sampleTime);
  const civilTime = asRecord(sampleTime?.civilTime);
  const date = parseGoogleDate(civilTime?.date);
  return date ?? deriveCivilDateFromTimestamp(sampleTime?.physicalTime, sampleTime?.utcOffset);
}

function resolveWeightMetricSampleTime(weight: RecordValue): string | null {
  const sampleTime = asRecord(weight.sampleTime);
  return parseTimestampIso(sampleTime?.physicalTime);
}

function parseWeightKg(value: unknown): number | null {
  const grams = parseNumber(value);
  if (grams === null) return null;

  const kg = Math.round((grams / 1000) * 1000) / 1000;
  return Number.isFinite(kg) && kg > 0 && kg <= 300 ? kg : null;
}

export function normalizeGoogleHealthWeightMetrics(dataPoints: unknown[]): GoogleHealthWeightMetrics {
  const candidatesByDate = new Map<string, GoogleHealthWeightMetric[]>();
  const skipped: GoogleHealthWeightSkippedMetric[] = [];

  for (const rawPoint of dataPoints) {
    const point = asRecord(rawPoint);
    const weight = asRecord(point?.weight);
    if (!point || !weight) {
      skipped.push(buildWeightSkippedMetric({ date: null, reason: "date_unresolved" }));
      continue;
    }

    const date = resolveWeightMetricDate(weight);
    if (!date) {
      skipped.push(buildWeightSkippedMetric({ date: null, reason: "date_unresolved" }));
      continue;
    }

    const weightKg = parseWeightKg(weight.weightGrams);
    if (weightKg === null) {
      skipped.push(buildWeightSkippedMetric({ date, reason: "invalid_weight_value" }));
      continue;
    }

    const candidate: GoogleHealthWeightMetric = {
      date,
      weightKg,
      sampleTime: resolveWeightMetricSampleTime(weight),
      dataPointName: typeof point.name === "string" ? point.name : null,
    };
    candidatesByDate.set(date, [...(candidatesByDate.get(date) ?? []), candidate]);
  }

  const metrics: GoogleHealthWeightMetric[] = [];
  for (const [date, candidates] of candidatesByDate) {
    if (candidates.length === 1) {
      metrics.push(candidates[0]!);
      continue;
    }

    skipped.push(buildWeightSkippedMetric({
      date,
      reason: "multiple_weight_logs",
      count: candidates.length,
    }));
  }

  return {
    metrics: metrics.sort((a, b) => a.date.localeCompare(b.date)),
    skipped: skipped.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
  };
}

export function buildGoogleHealthDailyRollupUrl(dataType: "steps"): string {
  return `${GOOGLE_HEALTH_API_BASE_URL}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`;
}

export function buildGoogleHealthStepsReconcileUrl(range: GoogleHealthPocRange, pageToken?: string): string {
  const url = new URL(`${GOOGLE_HEALTH_API_BASE_URL}/users/me/dataTypes/steps/dataPoints:reconcile`);
  url.searchParams.set("pageSize", "10000");
  url.searchParams.set("dataSourceFamily", GOOGLE_HEALTH_RECONCILED_STEPS_DATA_SOURCE_FAMILY);
  url.searchParams.set(
    "filter",
    `steps.interval.civil_start_time >= "${range.startDate}" AND steps.interval.civil_start_time < "${range.endExclusiveDate}"`,
  );
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }
  return url.toString();
}

export function buildGoogleHealthStepsListUrl(range: GoogleHealthPocRange, pageToken?: string): string {
  const url = new URL(`${GOOGLE_HEALTH_API_BASE_URL}/users/me/dataTypes/steps/dataPoints`);
  url.searchParams.set("pageSize", "10000");
  url.searchParams.set(
    "filter",
    `steps.interval.civil_start_time >= "${range.startDate}" AND steps.interval.civil_start_time < "${range.endExclusiveDate}"`,
  );
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }
  return url.toString();
}

export function buildGoogleHealthWeightListUrl(range: GoogleHealthPocRange, pageToken?: string): string {
  const url = new URL(`${GOOGLE_HEALTH_API_BASE_URL}/users/me/dataTypes/weight/dataPoints`);
  url.searchParams.set("pageSize", "10000");
  url.searchParams.set(
    "filter",
    `weight.sample_time.civil_time >= "${range.startDate}" AND weight.sample_time.civil_time < "${range.endExclusiveDate}"`,
  );
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }
  return url.toString();
}

export function buildGoogleHealthDailyRollupBody(range: GoogleHealthPocRange) {
  const toCivilDateTime = (date: string) => {
    const [year, month, day] = date.split("-").map(Number) as [number, number, number];
    return {
      date: { year, month, day },
    };
  };

  return {
    range: {
      start: toCivilDateTime(range.startDate),
      end: toCivilDateTime(range.endExclusiveDate),
    },
    windowSizeDays: 1,
    pageSize: eachDateInRange(range).length,
    dataSourceFamily: GOOGLE_HEALTH_STEPS_DATA_SOURCE_FAMILY,
  };
}

async function parseGoogleHealthError(response: Response): Promise<Omit<GoogleHealthStepsError, "source" | "status">> {
  try {
    const body = await response.json() as {
      error?: { message?: string; details?: unknown };
      message?: string;
      details?: unknown;
    };
    const details = body.error?.details ?? body.details;
    return {
      message: body.error?.message ?? body.message ?? response.statusText,
      ...(details !== undefined ? { details } : {}),
    };
  } catch {
    return { message: response.statusText };
  }
}

function buildSuccessfulStepsAttempt(source: GoogleHealthStepsError["source"], status: number): GoogleHealthStepsAttempt {
  return { source, ok: true, status };
}

function buildFailedStepsAttempt(error: GoogleHealthStepsError): GoogleHealthStepsAttempt {
  return {
    source: error.source,
    ok: false,
    status: error.status,
    message: error.message,
  };
}

function stepsErrorFromResult(result: Extract<GoogleHealthStepsResult, { ok: false }>): GoogleHealthStepsError {
  return {
    source: result.source,
    status: result.status,
    message: result.message,
    ...(result.details !== undefined ? { details: result.details } : {}),
  };
}

export async function fetchGoogleHealthStepsReconcile(args: {
  range: GoogleHealthPocRange;
  accessToken: string;
  fetchImpl?: FetchLike;
  maxPages?: number;
}): Promise<GoogleHealthStepsResult> {
  const { range, accessToken, fetchImpl = fetch, maxPages = 5 } = args;
  const dataPoints: unknown[] = [];
  let nextPageToken: string | null = null;
  let pageCount = 0;

  do {
    const response = await fetchImpl(buildGoogleHealthStepsReconcileUrl(range, nextPageToken ?? undefined), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    pageCount++;

    if (!response.ok) {
      const error = await parseGoogleHealthError(response);
      const stepsError = {
        source: "reconcile" as const,
        status: response.status,
        ...error,
      };
      return {
        ok: false,
        dataType: "steps",
        ...stepsError,
        attempts: [buildFailedStepsAttempt(stepsError)],
      };
    }

    const body = await response.json() as ListResponse;
    dataPoints.push(...(Array.isArray(body.dataPoints) ? body.dataPoints : []));
    nextPageToken = body.nextPageToken && body.nextPageToken.length > 0 ? body.nextPageToken : null;
  } while (nextPageToken && pageCount < maxPages);

  return {
    ok: true,
    dataType: "steps",
    source: "reconcile",
    pageCount,
    dataPoints,
    nextPageToken,
    attempts: [buildSuccessfulStepsAttempt("reconcile", 200)],
  };
}

export async function fetchGoogleHealthStepsDailyRollup(args: {
  range: GoogleHealthPocRange;
  accessToken: string;
  fetchImpl?: FetchLike;
}): Promise<GoogleHealthStepsResult> {
  const { range, accessToken, fetchImpl = fetch } = args;
  const response = await fetchImpl(buildGoogleHealthDailyRollupUrl("steps"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildGoogleHealthDailyRollupBody(range)),
  });

  if (!response.ok) {
    const error = await parseGoogleHealthError(response);
    const stepsError = {
      source: "dailyRollUp" as const,
      status: response.status,
      ...error,
    };
    return {
      ok: false,
      dataType: "steps",
      ...stepsError,
      attempts: [buildFailedStepsAttempt(stepsError)],
    };
  }

  const body = await response.json() as DailyRollupResponse;
  return {
    ok: true,
    dataType: "steps",
    source: "dailyRollUp",
    pageCount: 1,
    rollupDataPoints: Array.isArray(body.rollupDataPoints) ? body.rollupDataPoints : [],
    nextPageToken: body.nextPageToken && body.nextPageToken.length > 0 ? body.nextPageToken : null,
    attempts: [buildSuccessfulStepsAttempt("dailyRollUp", response.status)],
  };
}

export async function fetchGoogleHealthStepsListFallback(args: {
  range: GoogleHealthPocRange;
  accessToken: string;
  fetchImpl?: FetchLike;
  maxPages?: number;
  fallbackFrom: GoogleHealthStepsError;
  previousAttempts?: GoogleHealthStepsAttempt[];
}): Promise<GoogleHealthStepsResult> {
  const { range, accessToken, fetchImpl = fetch, maxPages = 5, fallbackFrom } = args;
  const previousAttempts = args.previousAttempts ?? [buildFailedStepsAttempt(fallbackFrom)];
  const dataPoints: unknown[] = [];
  let nextPageToken: string | null = null;
  let pageCount = 0;
  let successStatus = 200;

  do {
    const response = await fetchImpl(buildGoogleHealthStepsListUrl(range, nextPageToken ?? undefined), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    pageCount++;

    if (!response.ok) {
      const error = await parseGoogleHealthError(response);
      const stepsError = {
        source: "listFallback" as const,
        status: response.status,
        ...error,
      };
      return {
        ok: false,
        dataType: "steps",
        ...stepsError,
        fallbackFrom,
        attempts: [...previousAttempts, buildFailedStepsAttempt(stepsError)],
      };
    }

    successStatus = response.status;
    const body = await response.json() as ListResponse;
    dataPoints.push(...(Array.isArray(body.dataPoints) ? body.dataPoints : []));
    nextPageToken = body.nextPageToken && body.nextPageToken.length > 0 ? body.nextPageToken : null;
  } while (nextPageToken && pageCount < maxPages);

  return {
    ok: true,
    dataType: "steps",
    source: "listFallback",
    pageCount,
    dataPoints,
    nextPageToken,
    fallbackFrom,
    attempts: [...previousAttempts, buildSuccessfulStepsAttempt("listFallback", successStatus)],
  };
}

export async function fetchGoogleHealthSteps(args: {
  range: GoogleHealthPocRange;
  accessToken: string;
  fetchImpl?: FetchLike;
}): Promise<GoogleHealthStepsResult> {
  const reconcileResult = await fetchGoogleHealthStepsReconcile(args);
  if (reconcileResult.ok || reconcileResult.status === 403) return reconcileResult;

  const rollupResult = await fetchGoogleHealthStepsDailyRollup(args);
  const rollupAttempts = [...reconcileResult.attempts, ...rollupResult.attempts];
  if (rollupResult.ok) {
    return {
      ...rollupResult,
      attempts: rollupAttempts,
    };
  }
  if (rollupResult.status !== 400) {
    return {
      ...rollupResult,
      attempts: rollupAttempts,
    };
  }

  return fetchGoogleHealthStepsListFallback({
    ...args,
    fallbackFrom: stepsErrorFromResult(rollupResult),
    previousAttempts: rollupAttempts,
  });
}

export async function fetchGoogleHealthWeight(args: {
  range: GoogleHealthPocRange;
  accessToken: string;
  fetchImpl?: FetchLike;
  maxPages?: number;
}): Promise<GoogleHealthWeightResult> {
  const { range, accessToken, fetchImpl = fetch, maxPages = 5 } = args;
  const dataPoints: unknown[] = [];
  let nextPageToken: string | null = null;
  let pageCount = 0;

  do {
    const response = await fetchImpl(buildGoogleHealthWeightListUrl(range, nextPageToken ?? undefined), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    pageCount++;

    if (!response.ok) {
      const error = await parseGoogleHealthError(response);
      return {
        ok: false,
        dataType: "weight",
        status: response.status,
        ...error,
      };
    }

    const body = await response.json() as ListResponse;
    dataPoints.push(...(Array.isArray(body.dataPoints) ? body.dataPoints : []));
    nextPageToken = body.nextPageToken && body.nextPageToken.length > 0 ? body.nextPageToken : null;
  } while (nextPageToken && pageCount < maxPages);

  return {
    ok: true,
    dataType: "weight",
    pageCount,
    dataPoints,
    nextPageToken,
    weightMetrics: normalizeGoogleHealthWeightMetrics(dataPoints),
  };
}

function stepsDataPointsForNormalization(result: GoogleHealthStepsResult): unknown[] {
  if (!result.ok) return [];
  return result.source === "dailyRollUp" ? result.rollupDataPoints : result.dataPoints;
}

export function normalizeGoogleHealthDailyMetrics(args: {
  range: GoogleHealthPocRange;
  stepsRollupDataPoints?: unknown[];
  sourceResults: GoogleHealthPocTargetResult[];
}): GoogleHealthDailyMetric[] {
  const { range, stepsRollupDataPoints = [], sourceResults } = args;
  const map = new Map<string, GoogleHealthDailyMetric>();
  for (const date of eachDateInRange(range)) {
    ensureMetric(map, date);
  }

  normalizeSteps(map, stepsRollupDataPoints);
  normalizeSleep(map, dataPointsFor(sourceResults, "sleep"));
  normalizeHrv(map, dataPointsFor(sourceResults, "heartRateVariability"));
  normalizeRhr(map, dataPointsFor(sourceResults, "restingHeartRate"));

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchGoogleHealthDailyMetrics(args: {
  range: GoogleHealthPocRange;
  accessToken: string;
  fetchImpl?: FetchLike;
}): Promise<GoogleHealthDailyMetricsResult> {
  const { range, accessToken, fetchImpl } = args;
  const [sourceResults, stepsResult, weightResult] = await Promise.all([
    fetchGoogleHealthPoc({ range, accessToken, fetchImpl }),
    fetchGoogleHealthSteps({ range, accessToken, fetchImpl }),
    fetchGoogleHealthWeight({ range, accessToken, fetchImpl }),
  ]);
  const weightMetrics = weightResult.ok
    ? weightResult.weightMetrics
    : { metrics: [], skipped: [] };

  return {
    sourceResults,
    stepsResult,
    weightResult,
    weightMetrics,
    dailyMetrics: normalizeGoogleHealthDailyMetrics({
      range,
      stepsRollupDataPoints: stepsDataPointsForNormalization(stepsResult),
      sourceResults,
    }),
  };
}
