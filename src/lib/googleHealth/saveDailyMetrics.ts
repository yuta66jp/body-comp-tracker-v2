import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { GoogleHealthDailyMetric, GoogleHealthStepsResult } from "./dailyMetrics";
import { parseLocalDateStr } from "@/lib/utils/date";

type SupabaseLike = Pick<SupabaseClient<Database>, "from">;
type GoogleHealthDailyMetricInsert =
  Database["public"]["Tables"]["google_health_daily_metrics"]["Insert"];

export type GoogleHealthStepsSource = Extract<
  GoogleHealthStepsResult,
  { ok: true }
>["source"];

export type SaveGoogleHealthDailyMetricsResult =
  | {
      ok: true;
      savedCount: number;
      skippedCount: number;
      savedDates: string[];
      skippedDates: string[];
    }
  | { ok: false; message: string };

function toNullableNonNegativeInteger(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function toNullableNonNegativeNumber(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function uniqSortedDates(metrics: GoogleHealthDailyMetric[]): string[] {
  return [...new Set(metrics.map((metric) => metric.date).filter((date) => parseLocalDateStr(date) !== null))]
    .sort();
}

export async function saveGoogleHealthDailyMetrics(
  supabase: SupabaseLike,
  args: {
    userId: string;
    metrics: GoogleHealthDailyMetric[];
    stepsSource: GoogleHealthStepsSource;
    syncedAt?: string;
  },
): Promise<SaveGoogleHealthDailyMetricsResult> {
  const dates = uniqSortedDates(args.metrics);
  if (dates.length === 0) {
    return { ok: true, savedCount: 0, skippedCount: 0, savedDates: [], skippedDates: [] };
  }

  const { data: existingLogs, error: fetchError } = await supabase
    .from("daily_logs")
    .select("log_date")
    .eq("user_id", args.userId)
    .in("log_date", dates);

  if (fetchError) {
    return { ok: false, message: "daily_logs の取得に失敗しました: " + fetchError.message };
  }

  const existingDateSet = new Set((existingLogs ?? []).map((row) => row.log_date));
  const rows: GoogleHealthDailyMetricInsert[] = [];
  const savedDates: string[] = [];
  const skippedDates: string[] = [];
  const syncedAt = args.syncedAt ?? new Date().toISOString();

  for (const metric of args.metrics) {
    if (parseLocalDateStr(metric.date) === null) continue;

    if (!existingDateSet.has(metric.date)) {
      skippedDates.push(metric.date);
      continue;
    }

    savedDates.push(metric.date);
    rows.push({
      user_id: args.userId,
      metric_date: metric.date,
      step_count: toNullableNonNegativeInteger(metric.stepCount),
      sleep_minutes: toNullableNonNegativeInteger(metric.sleepMinutes),
      deep_sleep_minutes: toNullableNonNegativeInteger(metric.deepSleepMinutes),
      sleep_bed_at: null,
      sleep_wake_at: null,
      hrv_ms: toNullableNonNegativeNumber(metric.hrvMs),
      rhr_bpm: toNullableNonNegativeNumber(metric.rhrBpm),
      google_health_steps_source: args.stepsSource,
      synced_at: syncedAt,
    });
  }

  if (rows.length === 0) {
    return {
      ok: true,
      savedCount: 0,
      skippedCount: skippedDates.length,
      savedDates: [],
      skippedDates,
    };
  }

  const { error: upsertError } = await supabase
    .from("google_health_daily_metrics")
    .upsert(rows, { onConflict: "user_id,metric_date" });

  if (upsertError) {
    return { ok: false, message: "Google Health 日次メトリクスの保存に失敗しました: " + upsertError.message };
  }

  return {
    ok: true,
    savedCount: rows.length,
    skippedCount: skippedDates.length,
    savedDates,
    skippedDates,
  };
}
