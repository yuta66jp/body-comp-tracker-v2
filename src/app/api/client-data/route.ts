import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { isValidDateParam } from "@/lib/utils/date";

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
    const date = request.nextUrl.searchParams.get("date") ?? "";
    if (date) {
      if (!isValidDateParam(date)) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("daily_logs")
        .select("*")
        .eq("log_date", date)
        .limit(1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: data?.[0] ?? null });
    }

    const { data, error } = await supabase
      .from("daily_logs")
      .select("*")
      .order("log_date", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  if (resource === "sleep_sessions") {
    const date = request.nextUrl.searchParams.get("date") ?? "";
    if (date) {
      if (!isValidDateParam(date)) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("sleep_sessions")
        .select("*")
        .eq("wake_date", date)
        .limit(1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: data?.[0] ?? null });
    }

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
