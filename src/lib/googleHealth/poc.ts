const GOOGLE_HEALTH_API_BASE_URL = "https://health.googleapis.com/v4";
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_RANGE_DAYS = 90;

export const GOOGLE_HEALTH_POC_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
] as const;

export type GoogleHealthPocTargetKey =
  | "restingHeartRate"
  | "heartRateVariability"
  | "oxygenSaturation"
  | "respiratoryRate"
  | "sleep";

export type GoogleHealthPocTarget = {
  key: GoogleHealthPocTargetKey;
  label: string;
  dataType: string;
  filterField: string;
  scope: (typeof GOOGLE_HEALTH_POC_REQUIRED_SCOPES)[number];
  pageSize: number;
};

export const GOOGLE_HEALTH_POC_TARGETS: readonly GoogleHealthPocTarget[] = [
  {
    key: "restingHeartRate",
    label: "安静時心拍数",
    dataType: "daily-resting-heart-rate",
    filterField: "daily_resting_heart_rate.date",
    scope: "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    pageSize: 100,
  },
  {
    key: "heartRateVariability",
    label: "心拍変動",
    dataType: "daily-heart-rate-variability",
    filterField: "daily_heart_rate_variability.date",
    scope: "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    pageSize: 100,
  },
  {
    key: "oxygenSaturation",
    label: "血中酸素ウェルネス",
    dataType: "daily-oxygen-saturation",
    filterField: "daily_oxygen_saturation.date",
    scope: "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    pageSize: 100,
  },
  {
    key: "respiratoryRate",
    label: "呼吸数",
    dataType: "daily-respiratory-rate",
    filterField: "daily_respiratory_rate.date",
    scope: "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    pageSize: 100,
  },
  {
    key: "sleep",
    label: "睡眠セッション",
    dataType: "sleep",
    filterField: "sleep.interval.civil_end_time",
    scope: "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
    pageSize: 25,
  },
] as const;

export type GoogleHealthPocRange = {
  startDate: string;
  endDate: string;
  endExclusiveDate: string;
};

export type GoogleHealthPocRangeResult =
  | { ok: true; range: GoogleHealthPocRange }
  | { ok: false; message: string };

export type GoogleHealthPocTargetResult =
  | {
      ok: true;
      key: GoogleHealthPocTargetKey;
      label: string;
      dataType: string;
      filter: string;
      pageCount: number;
      dataPoints: unknown[];
      nextPageToken: string | null;
    }
  | {
      ok: false;
      key: GoogleHealthPocTargetKey;
      label: string;
      dataType: string;
      filter: string;
      status: number;
      message: string;
    };

type GoogleHealthListResponse = {
  dataPoints?: unknown[];
  nextPageToken?: string;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type GoogleHealthAccessTokenEnv = {
  GOOGLE_HEALTH_ACCESS_TOKEN?: string;
};

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatUtcDate(parsed);
}

function daysBetween(startDate: string, endDate: string): number {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number) as [number, number, number];
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number) as [number, number, number];
  const startMs = Date.UTC(startYear, startMonth - 1, startDay);
  const endMs = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

export function getTodayDateInJst(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("failed_to_format_jst_date");
  }
  return `${year}-${month}-${day}`;
}

export function resolveGoogleHealthPocRange(
  searchParams: URLSearchParams,
  today = getTodayDateInJst(),
): GoogleHealthPocRangeResult {
  const endDate = searchParams.get("end") ?? today;
  const startDate = searchParams.get("start") ?? addDays(endDate, -(DEFAULT_LOOKBACK_DAYS - 1));

  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return { ok: false, message: "start / end は YYYY-MM-DD 形式で指定してください。" };
  }

  if (startDate > endDate) {
    return { ok: false, message: "start は end 以前の日付を指定してください。" };
  }

  if (daysBetween(startDate, endDate) > MAX_RANGE_DAYS) {
    return { ok: false, message: `PoC の取得範囲は最大 ${MAX_RANGE_DAYS} 日です。` };
  }

  return {
    ok: true,
    range: {
      startDate,
      endDate,
      endExclusiveDate: addDays(endDate, 1),
    },
  };
}

export function buildGoogleHealthFilter(target: GoogleHealthPocTarget, range: GoogleHealthPocRange): string {
  return `${target.filterField} >= "${range.startDate}" AND ${target.filterField} < "${range.endExclusiveDate}"`;
}

export function buildGoogleHealthDataPointsUrl(
  target: GoogleHealthPocTarget,
  range: GoogleHealthPocRange,
  pageToken?: string,
): string {
  const url = new URL(`${GOOGLE_HEALTH_API_BASE_URL}/users/me/dataTypes/${target.dataType}/dataPoints`);
  url.searchParams.set("pageSize", String(target.pageSize));
  url.searchParams.set("filter", buildGoogleHealthFilter(target, range));
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }
  return url.toString();
}

export function getGoogleHealthAccessToken(headers: Headers, env?: GoogleHealthAccessTokenEnv): string | null {
  const authorization = headers.get("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }

  const envToken = (env?.GOOGLE_HEALTH_ACCESS_TOKEN ?? process.env.GOOGLE_HEALTH_ACCESS_TOKEN)?.trim();
  return envToken && envToken.length > 0 ? envToken : null;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function fetchGoogleHealthPocTarget(args: {
  target: GoogleHealthPocTarget;
  range: GoogleHealthPocRange;
  accessToken: string;
  fetchImpl?: FetchLike;
  maxPages?: number;
}): Promise<GoogleHealthPocTargetResult> {
  const { target, range, accessToken, fetchImpl = fetch, maxPages = 5 } = args;
  const dataPoints: unknown[] = [];
  let nextPageToken: string | null = null;
  let pageCount = 0;
  const filter = buildGoogleHealthFilter(target, range);

  do {
    const response = await fetchImpl(buildGoogleHealthDataPointsUrl(target, range, nextPageToken ?? undefined), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    pageCount++;

    if (!response.ok) {
      return {
        ok: false,
        key: target.key,
        label: target.label,
        dataType: target.dataType,
        filter,
        status: response.status,
        message: await parseErrorMessage(response),
      };
    }

    const body = await response.json() as GoogleHealthListResponse;
    dataPoints.push(...(Array.isArray(body.dataPoints) ? body.dataPoints : []));
    nextPageToken = body.nextPageToken && body.nextPageToken.length > 0 ? body.nextPageToken : null;
  } while (nextPageToken && pageCount < maxPages);

  return {
    ok: true,
    key: target.key,
    label: target.label,
    dataType: target.dataType,
    filter,
    pageCount,
    dataPoints,
    nextPageToken,
  };
}

export async function fetchGoogleHealthPoc(args: {
  range: GoogleHealthPocRange;
  accessToken: string;
  fetchImpl?: FetchLike;
}): Promise<GoogleHealthPocTargetResult[]> {
  const { range, accessToken, fetchImpl } = args;
  return Promise.all(
    GOOGLE_HEALTH_POC_TARGETS.map((target) =>
      fetchGoogleHealthPocTarget({ target, range, accessToken, fetchImpl })
    ),
  );
}
