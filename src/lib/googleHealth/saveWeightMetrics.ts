import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type {
  GoogleHealthWeightMetric,
  GoogleHealthWeightSkippedMetric,
} from "./dailyMetrics";
import { parseLocalDateStr } from "@/lib/utils/date";

type SupabaseLike = Pick<SupabaseClient<Database>, "from">;
type DailyLogInsert = Database["public"]["Tables"]["daily_logs"]["Insert"];

export type SaveGoogleHealthWeightMetricsResult =
  | {
      ok: true;
      syncedCount: number;
      createdCount: number;
      updatedCount: number;
      skippedCount: number;
      createdDates: string[];
      updatedDates: string[];
      skipped: GoogleHealthWeightSkippedMetric[];
    }
  | { ok: false; message: string };

function isValidWeightMetric(metric: GoogleHealthWeightMetric): boolean {
  return (
    parseLocalDateStr(metric.date) !== null &&
    Number.isFinite(metric.weightKg) &&
    metric.weightKg > 0 &&
    metric.weightKg <= 300
  );
}

function buildInvalidWeightSkippedMetric(metric: GoogleHealthWeightMetric): GoogleHealthWeightSkippedMetric {
  return {
    date: parseLocalDateStr(metric.date) === null ? null : metric.date,
    reason: parseLocalDateStr(metric.date) === null ? "date_unresolved" : "invalid_weight_value",
    message: parseLocalDateStr(metric.date) === null
      ? "Google Health の体重ログの日付を特定できないためスキップしました。"
      : "Google Health の体重値が不正なためスキップしました。",
  };
}

export async function saveGoogleHealthWeightMetrics(
  supabase: SupabaseLike,
  args: {
    userId: string;
    metrics: GoogleHealthWeightMetric[];
    skipped?: GoogleHealthWeightSkippedMetric[];
  },
): Promise<SaveGoogleHealthWeightMetricsResult> {
  const validMetrics: GoogleHealthWeightMetric[] = [];
  const skipped = [...(args.skipped ?? [])];

  for (const metric of args.metrics) {
    if (isValidWeightMetric(metric)) {
      validMetrics.push(metric);
    } else {
      skipped.push(buildInvalidWeightSkippedMetric(metric));
    }
  }

  if (validMetrics.length === 0) {
    return {
      ok: true,
      syncedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: skipped.length,
      createdDates: [],
      updatedDates: [],
      skipped,
    };
  }

  const dates = [...new Set(validMetrics.map((metric) => metric.date))].sort();
  const { data: existingLogs, error: fetchError } = await supabase
    .from("daily_logs")
    .select("log_date")
    .eq("user_id", args.userId)
    .in("log_date", dates);

  if (fetchError) {
    return { ok: false, message: "daily_logs の取得に失敗しました: " + fetchError.message };
  }

  const existingDateSet = new Set((existingLogs ?? []).map((row) => row.log_date));
  const rows: DailyLogInsert[] = validMetrics.map((metric) => ({
    user_id: args.userId,
    log_date: metric.date,
    weight: metric.weightKg,
  }));

  const { error: upsertError } = await supabase
    .from("daily_logs")
    .upsert(rows, { onConflict: "user_id,log_date" });

  if (upsertError) {
    return { ok: false, message: "Google Health 体重ログの保存に失敗しました: " + upsertError.message };
  }

  const createdDates = dates.filter((date) => !existingDateSet.has(date));
  const updatedDates = dates.filter((date) => existingDateSet.has(date));

  return {
    ok: true,
    syncedCount: rows.length,
    createdCount: createdDates.length,
    updatedCount: updatedDates.length,
    skippedCount: skipped.length,
    createdDates,
    updatedDates,
    skipped,
  };
}
