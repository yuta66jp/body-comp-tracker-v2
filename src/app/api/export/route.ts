/**
 * /api/export — CSV エクスポートエンドポイント
 *
 * セキュリティ前提:
 *   - Supabase Auth の access token を server client に渡し、RLS でユーザー単位に絞る。
 *   - 未ログイン時は 401 を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { isValidDateParam } from "@/lib/utils/date";

// ── バリデーション ────────────────────────────────────────────────────────────

const ALLOWED_TABLES = ["daily_logs", "food_master", "predictions"] as const;

const DAILY_LOG_EXPORT_COLUMNS = [
  "log_date", "weight", "calories", "protein", "fat", "carbs", "note",
  "is_cheat_day", "is_refeed_day", "is_eating_out", "is_travel_day",
  "is_tanning_day", "is_posing_day",
  "had_bowel_movement", "training_type", "work_mode", "leg_flag",
];

const GOOGLE_HEALTH_EXPORT_COLUMNS = [
  "google_health_step_count",
  "google_health_sleep_minutes",
  "google_health_deep_sleep_minutes",
  "google_health_sleep_bed_at",
  "google_health_sleep_wake_at",
  "google_health_hrv_ms",
  "google_health_rhr_bpm",
  "google_health_steps_source",
  "google_health_synced_at",
];

const GOOGLE_HEALTH_SELECT_COLUMNS = [
  "metric_date",
  "step_count",
  "sleep_minutes",
  "deep_sleep_minutes",
  "sleep_bed_at",
  "sleep_wake_at",
  "hrv_ms",
  "rhr_bpm",
  "google_health_steps_source",
  "synced_at",
];

type GoogleHealthExportRow = {
  metric_date: string;
  step_count: number | null;
  sleep_minutes: number | null;
  deep_sleep_minutes: number | null;
  sleep_bed_at: string | null;
  sleep_wake_at: string | null;
  hrv_ms: number | null;
  rhr_bpm: number | null;
  google_health_steps_source: string | null;
  synced_at: string | null;
};

function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const body = rows.map((row) =>
    columns
      .map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(",")
  );
  return [header, ...body].join("\n");
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  const table = searchParams.get("table") ?? "daily_logs";

  // ── 入力バリデーション（DB 呼び出し前） ─────────────────────────────────────
  if (!(ALLOWED_TABLES as readonly string[]).includes(table)) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }
  if (start && !isValidDateParam(start)) {
    return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
  }
  if (end && !isValidDateParam(end)) {
    return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
  }

  const supabase = await createClient();

  if (table === "daily_logs") {
    // CSV エクスポート専用に daily_logs と Google Health 日次メトリクスを日付でマージする。
    // front SSR 用 projection query (src/lib/queries/dailyLogs.ts) とは異なる経路。
    let dailyLogsQuery = supabase
      .from("daily_logs")
      .select(DAILY_LOG_EXPORT_COLUMNS.join(","))
      .order("log_date", { ascending: true });
    if (start) dailyLogsQuery = dailyLogsQuery.gte("log_date", start);
    if (end) dailyLogsQuery = dailyLogsQuery.lte("log_date", end);

    let googleHealthQuery = supabase
      .from("google_health_daily_metrics")
      .select(GOOGLE_HEALTH_SELECT_COLUMNS.join(","))
      .order("metric_date", { ascending: true });
    if (start) googleHealthQuery = googleHealthQuery.gte("metric_date", start);
    if (end) googleHealthQuery = googleHealthQuery.lte("metric_date", end);

    const [
      { data: dailyLogsData, error: dailyLogsError },
      { data: googleHealthData, error: googleHealthError },
    ] = await Promise.all([dailyLogsQuery, googleHealthQuery]);
    if (dailyLogsError) return NextResponse.json({ error: dailyLogsError.message }, { status: 500 });
    if (googleHealthError) return NextResponse.json({ error: googleHealthError.message }, { status: 500 });

    const rowsByDate = new Map<string, Record<string, unknown>>();
    for (const rawLog of ((dailyLogsData ?? []) as unknown as Record<string, unknown>[])) {
      const logDate = rawLog.log_date;
      if (typeof logDate !== "string") continue;
      rowsByDate.set(logDate, { ...rawLog, log_date: logDate });
    }

    for (const metric of ((googleHealthData ?? []) as unknown as GoogleHealthExportRow[])) {
      const metricDate = metric.metric_date;
      if (typeof metricDate !== "string") continue;
      const row = rowsByDate.get(metricDate) ?? { log_date: metricDate };
      row.google_health_step_count = metric.step_count;
      row.google_health_sleep_minutes = metric.sleep_minutes;
      row.google_health_deep_sleep_minutes = metric.deep_sleep_minutes;
      row.google_health_sleep_bed_at = metric.sleep_bed_at;
      row.google_health_sleep_wake_at = metric.sleep_wake_at;
      row.google_health_hrv_ms = metric.hrv_ms;
      row.google_health_rhr_bpm = metric.rhr_bpm;
      row.google_health_steps_source = metric.google_health_steps_source;
      row.google_health_synced_at = metric.synced_at;
      rowsByDate.set(metricDate, row);
    }

    const columns = [...DAILY_LOG_EXPORT_COLUMNS, ...GOOGLE_HEALTH_EXPORT_COLUMNS];
    const rows = Array.from(rowsByDate.values()).sort((a, b) =>
      String(a.log_date).localeCompare(String(b.log_date))
    );
    const csv = toCSV(rows, columns);
    const filename = `bodymake_log_${start || "all"}_${end || "all"}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (table === "food_master") {
    const { data, error } = await supabase.from("food_master").select("*").order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const columns = ["name", "calories", "protein", "fat", "carbs", "category"];
    const csv = toCSV((data ?? []) as Record<string, unknown>[], columns);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="food_master.csv"`,
      },
    });
  }

  if (table === "predictions") {
    const { data, error } = await supabase.from("predictions").select("ds,yhat,model_version,created_at").order("ds");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const columns = ["ds", "yhat", "model_version", "created_at"];
    const csv = toCSV((data ?? []) as Record<string, unknown>[], columns);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="predictions.csv"`,
      },
    });
  }

  return NextResponse.json({ error: "Unknown table" }, { status: 400 });
}
