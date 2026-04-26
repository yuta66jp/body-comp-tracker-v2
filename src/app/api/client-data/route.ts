import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const RESOURCES = [
  "daily_logs",
  "sleep_sessions",
  "food_master",
  "menu_master",
  "predictions",
  "daily_log_dates",
] as const;

type ClientDataResource = (typeof RESOURCES)[number];

function isResource(value: string): value is ClientDataResource {
  return (RESOURCES as readonly string[]).includes(value);
}

function isValidDateParam(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resource = request.nextUrl.searchParams.get("resource") ?? "";
  if (!isResource(resource)) {
    return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  }

  const supabase = await createClient();

  if (resource === "daily_logs") {
    const { data, error } = await supabase
      .from("daily_logs")
      .select("*")
      .order("log_date", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  if (resource === "sleep_sessions") {
    const { data, error } = await supabase
      .from("sleep_sessions")
      .select("*")
      .order("wake_date", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  if (resource === "food_master") {
    const { data, error } = await supabase
      .from("food_master")
      .select("*")
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  if (resource === "menu_master") {
    const { data, error } = await supabase
      .from("menu_master")
      .select("name, recipe")
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  if (resource === "predictions") {
    const { data, error } = await supabase
      .from("predictions")
      .select("*")
      .order("ds", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  const start = request.nextUrl.searchParams.get("start") ?? "";
  const end = request.nextUrl.searchParams.get("end") ?? "";
  if (!isValidDateParam(start) || !isValidDateParam(end)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date")
    .gte("log_date", start)
    .lte("log_date", end);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
