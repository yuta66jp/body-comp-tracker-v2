import type { GoogleHealthDailyMetricRow } from "@/lib/supabase/types";

export type GoogleHealthDailyMetricForDisplay = Pick<
  GoogleHealthDailyMetricRow,
  | "metric_date"
  | "step_count"
  | "sleep_minutes"
  | "deep_sleep_minutes"
  | "sleep_bed_at"
  | "sleep_wake_at"
  | "hrv_ms"
  | "rhr_bpm"
>;

export function buildGoogleHealthDailyMetricMap(
  metrics: GoogleHealthDailyMetricForDisplay[],
): Map<string, GoogleHealthDailyMetricForDisplay> {
  return new Map(metrics.map((metric) => [metric.metric_date, metric]));
}

export function metricMinutesToHours(minutes: number | null | undefined): number | null {
  if (minutes === null || minutes === undefined) return null;
  return Math.round((minutes / 60) * 10) / 10;
}

export function formatMinutesAsHoursMinutes(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours <= 0) return `${restMinutes}m`;
  if (restMinutes === 0) return `${hours}h`;
  return `${hours}h${String(restMinutes).padStart(2, "0")}m`;
}

export function formatCompactNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

export function formatGoogleHealthDailyMetricLine(
  metric: GoogleHealthDailyMetricForDisplay | null | undefined,
): string {
  if (!metric) return "データなし";

  const parts = [
    metric.step_count !== null ? `歩数 ${metric.step_count.toLocaleString()}歩` : null,
    metric.sleep_minutes !== null ? `睡眠 ${formatMinutesAsHoursMinutes(metric.sleep_minutes)}` : null,
    metric.deep_sleep_minutes !== null ? `深睡眠 ${formatMinutesAsHoursMinutes(metric.deep_sleep_minutes)}` : null,
    metric.hrv_ms !== null ? `HRV ${formatCompactNumber(metric.hrv_ms)}ms` : null,
    metric.rhr_bpm !== null ? `安静時 ${formatCompactNumber(metric.rhr_bpm)}bpm` : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(" / ") : "データなし";
}
