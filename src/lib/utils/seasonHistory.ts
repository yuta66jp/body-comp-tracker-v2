import type { Season, SeasonPhase } from "@/lib/domain/season";
import type { CareerLog } from "@/lib/supabase/types";
import type { SeasonHistoryDailyLog } from "@/lib/queries/dailyLogs";
import type { MonthlyGoalEntry } from "@/lib/utils/monthlyGoalPlan";
import { buildSeasonMonthlyPlanSnapshot } from "@/lib/utils/seasonMonthlyPlan";

export type SeasonHistorySource = "daily_logs" | "career_logs" | "none";
export type SeasonGoalStatus = "achieved" | "not_achieved" | "unknown";

export interface SeasonHistoryRecord {
  season: Season;
  seriesLabel: string;
  logs: CareerLog[];
  source: SeasonHistorySource;
  latestWeight: number | null;
  goalStatus: SeasonGoalStatus;
  planEntries: MonthlyGoalEntry[];
}

export interface LegacySeasonHistoryRecord {
  key: string;
  name: string;
  targetDate: string;
  startDate: string;
  endDate: string;
  startWeight: number;
  endWeight: number;
  count: number;
}

export interface SeasonHistoryData {
  records: SeasonHistoryRecord[];
  legacyRecords: LegacySeasonHistoryRecord[];
  unassignedLogCount: number;
}

function isWithinSeason(season: Season, logDate: string): boolean {
  return (
    logDate >= season.startDate &&
    (season.endDate === null || logDate <= season.endDate)
  );
}

function goalStatus(
  phase: SeasonPhase,
  targetWeight: number | null,
  actualWeight: number | null
): SeasonGoalStatus {
  if (targetWeight === null || actualWeight === null) return "unknown";
  return phase === "Cut"
    ? actualWeight <= targetWeight + 0.05
      ? "achieved"
      : "not_achieved"
    : actualWeight >= targetWeight - 0.05
      ? "achieved"
      : "not_achieved";
}

function uniqueSeriesLabels(seasons: Season[]): Map<number, string> {
  const counts = new Map<string, number>();
  for (const season of seasons) {
    counts.set(season.name, (counts.get(season.name) ?? 0) + 1);
  }

  return new Map(
    seasons.map((season) => [
      season.id,
      counts.get(season.name) === 1
        ? season.name
        : `${season.name} (${season.startDate})`,
    ])
  );
}

function toCareerLogs(
  season: Season,
  seriesLabel: string,
  logs: Array<{ log_date: string; weight: number | null }>
): CareerLog[] {
  return logs
    .filter(
      (log): log is { log_date: string; weight: number } =>
        log.weight !== null && isWithinSeason(season, log.log_date)
    )
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
    .map((log, index) => ({
      id: index,
      log_date: log.log_date,
      weight: log.weight,
      season: seriesLabel,
      target_date: season.targetDate,
      note: null,
      season_id: season.id,
      user_id: season.userId,
    }));
}

/**
 * seasonsを正本として履歴表示用データを構築する。
 *
 * 同じseasonにdaily_logsとcareer_logsがある場合はdaily_logsだけを採用する。
 * career_logsは移行済みseasonにdaily_logsがない場合だけフォールバックとして使う。
 * season_idを持たないlegacy行は、名称・目標日・期間が一致するseasonへ安全に対応
 * できる場合だけフォールバックし、残りはphase不明のlegacy情報として分離する。
 */
export function buildSeasonHistoryData(
  seasons: Season[],
  dailyLogs: SeasonHistoryDailyLog[],
  careerLogs: CareerLog[],
  today: string
): SeasonHistoryData {
  const sortedSeasons = [...seasons].sort((a, b) =>
    a.startDate.localeCompare(b.startDate) || a.id - b.id
  );
  const labels = uniqueSeriesLabels(sortedSeasons);
  const consumedCareerIndexes = new Set<number>();

  const records = sortedSeasons.map((season) => {
    const label = labels.get(season.id) ?? season.name;
    const dailyForSeason = dailyLogs.filter(
      (log) => log.season_id === season.id && isWithinSeason(season, log.log_date)
    );

    const careerById = careerLogs.flatMap((log, index) => {
      if (log.season_id !== season.id) return [];
      consumedCareerIndexes.add(index);
      return isWithinSeason(season, log.log_date) ? [log] : [];
    });

    const legacyByIdentity = careerLogs.flatMap((log, index) => {
      if (
        log.season_id !== undefined ||
        consumedCareerIndexes.has(index) ||
        log.season !== season.name ||
        log.target_date !== season.targetDate ||
        !isWithinSeason(season, log.log_date)
      ) {
        return [];
      }
      consumedCareerIndexes.add(index);
      return [log];
    });

    const sourceLogs =
      dailyForSeason.some((log) => log.weight !== null)
        ? dailyForSeason
        : careerById.length > 0
          ? careerById
          : legacyByIdentity;
    const source: SeasonHistorySource =
      dailyForSeason.some((log) => log.weight !== null)
        ? "daily_logs"
        : sourceLogs.length > 0
          ? "career_logs"
          : "none";
    const logs = toCareerLogs(season, label, sourceLogs);
    const latestWeight = logs.at(-1)?.weight ?? season.endWeight ?? null;
    const actualForGoal = season.status === "completed"
      ? season.endWeight ?? latestWeight
      : latestWeight;

    let planEntries: MonthlyGoalEntry[] = [];
    if (season.status === "completed") {
      planEntries = season.monthlyPlanSnapshot ?? [];
    } else if (
      season.targetWeight !== null &&
      season.monthlyPlanStartMonth !== null &&
      season.monthlyPlanStartWeight !== null
    ) {
      planEntries = buildSeasonMonthlyPlanSnapshot(
        {
          phase: season.phase,
          startDate: season.startDate,
          startWeight: season.startWeight,
          planStartDate: season.monthlyPlanStartDate ?? season.startDate,
          targetDate: season.targetDate,
          targetWeight: season.targetWeight,
          planStartMonth: season.monthlyPlanStartMonth,
          planStartWeight: season.monthlyPlanStartWeight,
          overrides: season.monthlyPlanOverrides,
        },
        logs,
        today
      );
    }

    return {
      season,
      seriesLabel: label,
      logs,
      source,
      latestWeight,
      goalStatus: goalStatus(season.phase, season.targetWeight, actualForGoal),
      planEntries,
    };
  });

  const remainingLegacy = careerLogs.filter(
    (_, index) => !consumedCareerIndexes.has(index)
  );
  const legacyGroups = new Map<string, CareerLog[]>();
  for (const log of remainingLegacy) {
    const key = `${log.season}\u0000${log.target_date}`;
    legacyGroups.set(key, [...(legacyGroups.get(key) ?? []), log]);
  }
  const legacyRecords = [...legacyGroups.entries()]
    .map(([key, logs]) => {
      const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
      return {
        key,
        name: sorted[0]!.season,
        targetDate: sorted[0]!.target_date,
        startDate: sorted[0]!.log_date,
        endDate: sorted.at(-1)!.log_date,
        startWeight: sorted[0]!.weight,
        endWeight: sorted.at(-1)!.weight,
        count: sorted.length,
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return {
    records,
    legacyRecords,
    unassignedLogCount: dailyLogs.filter((log) => log.season_id === null).length,
  };
}
