import type { Season } from "@/lib/domain/season";
import type { DashboardDailyLog } from "@/lib/supabase/types";

type MonthlySeason = Pick<Season, "id" | "name" | "startDate">;

export type MonthlySeasonSummary =
  | { status: "unavailable" }
  | {
      status: "ok";
      seasons: MonthlySeason[];
      unassignedDays: number;
      unknownDays: number;
    };

/** 月内の記録に保存された所属だけを集約する。nullの一覧は取得失敗を表す。 */
export function buildMonthlySeasonSummary(
  logs: Pick<DashboardDailyLog, "log_date" | "season_id">[],
  seasons: MonthlySeason[] | null
): MonthlySeasonSummary {
  if (seasons === null) return { status: "unavailable" };

  const byId = new Map(seasons.map((season) => [season.id, season]));
  const matched = new Map<number, MonthlySeason>();
  const unassignedDates = new Set<string>();
  const unknownDates = new Set<string>();

  for (const log of logs) {
    if (log.season_id === null) {
      unassignedDates.add(log.log_date);
      continue;
    }
    const season = log.season_id === undefined ? undefined : byId.get(log.season_id);
    if (season) {
      matched.set(season.id, { id: season.id, name: season.name, startDate: season.startDate });
    } else {
      // 未取得のIDや参照先不明を、未所属・現在シーズンへ置き換えない。
      unknownDates.add(log.log_date);
    }
  }

  return {
    status: "ok",
    seasons: [...matched.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id),
    unassignedDays: unassignedDates.size,
    unknownDays: unknownDates.size,
  };
}
