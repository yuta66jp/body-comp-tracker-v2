import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { searchParams } = req.nextUrl;
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  const table = searchParams.get("table") ?? "daily_logs";

  const supabase = createClient();

  if (table === "daily_logs") {
    let query = supabase.from("daily_logs").select("*").order("log_date", { ascending: true });
    if (start) query = query.gte("log_date", start);
    if (end) query = query.lte("log_date", end);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const columns = [
      "log_date", "weight", "calories", "protein", "fat", "carbs", "note",
      "is_cheat_day", "is_refeed_day", "is_eating_out", "is_travel_day", "is_poor_sleep",
      "sleep_hours", "had_bowel_movement", "training_type", "work_mode", "leg_flag",
    ];
    const csv = toCSV((data ?? []) as Record<string, unknown>[], columns);
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
