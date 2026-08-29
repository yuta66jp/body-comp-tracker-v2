import { createClient } from "@/lib/supabase/server";
import { mapSeasonRow, resolveSeasonForDate } from "@/lib/domain/season";
import type { Season, SeasonResolution } from "@/lib/domain/season";
import type { SeasonRow } from "@/lib/supabase/types";
import type { QueryResult } from "./queryResult";

export async function fetchSeasons(): Promise<QueryResult<Season[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .order("start_date", { ascending: true });

  if (error) {
    console.error("[fetchSeasons] seasons fetch error:", error.message, {
      code: error.code,
    });
    return { kind: "error", message: error.message };
  }

  try {
    return {
      kind: "ok",
      data: ((data as SeasonRow[] | null) ?? []).map(mapSeasonRow),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_season_data";
    console.error("[fetchSeasons] seasons mapping error:", message);
    return { kind: "error", message };
  }
}

export async function fetchActiveSeason(): Promise<QueryResult<Season | null>> {
  const result = await fetchSeasons();
  if (result.kind === "error") return result;

  const active = result.data.filter((season) => season.status === "active");
  if (active.length > 1) {
    return { kind: "error", message: "multiple_active_seasons" };
  }
  return { kind: "ok", data: active[0] ?? null };
}

export async function fetchSeasonResolutionForDate(
  logDate: string
): Promise<QueryResult<SeasonResolution>> {
  const result = await fetchSeasons();
  if (result.kind === "error") return result;
  return { kind: "ok", data: resolveSeasonForDate(result.data, logDate) };
}
