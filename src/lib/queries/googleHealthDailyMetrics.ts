import { createClient } from "@/lib/supabase/server";
import type { GoogleHealthDailyMetricForDisplay } from "@/lib/googleHealth/displayMetrics";
import type { QueryResult } from "./queryResult";

const GOOGLE_HEALTH_DAILY_METRIC_COLUMNS =
  "metric_date, step_count, sleep_minutes, deep_sleep_minutes, sleep_bed_at, sleep_wake_at, hrv_ms, rhr_bpm";

export async function fetchGoogleHealthDailyMetricsForRange(
  startDate: string,
  endDate: string,
): Promise<QueryResult<GoogleHealthDailyMetricForDisplay[]>> {
  if (startDate > endDate) return { kind: "ok", data: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("google_health_daily_metrics")
    .select(GOOGLE_HEALTH_DAILY_METRIC_COLUMNS)
    .gte("metric_date", startDate)
    .lte("metric_date", endDate)
    .order("metric_date", { ascending: true });

  if (error) {
    console.error("[fetchGoogleHealthDailyMetricsForRange] google_health_daily_metrics fetch error:", error.message, { code: error.code });
    return { kind: "error", message: error.message };
  }

  return {
    kind: "ok",
    data: (data as unknown as GoogleHealthDailyMetricForDisplay[]) ?? [],
  };
}
