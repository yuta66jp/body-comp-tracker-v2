import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { isValidDateParam } from "@/lib/utils/date";
import type { MealEntry, MealEntryWithItems, MealItem } from "@/lib/supabase/types";

const RESOURCES = [
  "daily_logs",
  "meal_entries",
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

  if (resource === "meal_entries") {
    const date = request.nextUrl.searchParams.get("date") ?? "";
    if (!isValidDateParam(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const { data: entries, error: entriesError } = await supabase
      .from("meal_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("log_date", date)
      .order("created_at", { ascending: true });
    if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 });

    const mealEntries = (entries as MealEntry[] | null) ?? [];
    if (mealEntries.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const { data: items, error: itemsError } = await supabase
      .from("meal_items")
      .select("*")
      .eq("user_id", user.id)
      .in("meal_entry_id", mealEntries.map((entry) => entry.id))
      .order("item_order", { ascending: true });
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

    const itemsByEntry = new Map<string, MealItem[]>();
    for (const item of ((items as MealItem[] | null) ?? [])) {
      const list = itemsByEntry.get(item.meal_entry_id) ?? [];
      list.push(item);
      itemsByEntry.set(item.meal_entry_id, list);
    }

    const data: MealEntryWithItems[] = mealEntries.map((entry) => ({
      ...entry,
      items: itemsByEntry.get(entry.id) ?? [],
    }));

    return NextResponse.json({ data });
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
