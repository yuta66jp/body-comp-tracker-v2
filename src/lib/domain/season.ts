import type { SeasonRow, Json } from "@/lib/supabase/types";
import type { MonthlyGoalEntry, MonthlyGoalOverride } from "@/lib/utils/monthlyGoalPlan";

export type SeasonPhase = "Cut" | "Bulk";
export type SeasonStatus = "active" | "completed";

export interface Season {
  id: number;
  userId: string;
  name: string;
  phase: SeasonPhase;
  startDate: string;
  startWeight: number;
  targetDate: string;
  targetWeight: number | null;
  status: SeasonStatus;
  endDate: string | null;
  endWeight: number | null;
  monthlyPlanStartMonth: string | null;
  monthlyPlanStartWeight: number | null;
  monthlyPlanOverrides: MonthlyGoalOverride[];
  monthlyPlanSnapshot: MonthlyGoalEntry[] | null;
  createdAt: string;
  updatedAt: string;
}

function parseMonthlyPlanSnapshot(value: Json | null): MonthlyGoalEntry[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) throw new Error("invalid_season_plan_snapshot");

  return value.map((item) => {
    if (item === null || Array.isArray(item) || typeof item !== "object") {
      throw new Error("invalid_season_plan_snapshot");
    }
    const { month, targetWeight, source, requiredDeltaKg, actualWeight } = item;
    if (
      typeof month !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      typeof targetWeight !== "number" ||
      !Number.isFinite(targetWeight) ||
      typeof source !== "string" ||
      !["manual", "auto_redistributed", "actual_fixed"].includes(source) ||
      typeof requiredDeltaKg !== "number" ||
      !Number.isFinite(requiredDeltaKg) ||
      !(actualWeight === null || (typeof actualWeight === "number" && Number.isFinite(actualWeight)))
    ) {
      throw new Error("invalid_season_plan_snapshot");
    }
    return {
      month,
      targetWeight,
      source: source as MonthlyGoalEntry["source"],
      requiredDeltaKg,
      actualWeight,
    };
  });
}

export type SeasonResolution =
  | { kind: "matched"; season: Season }
  | { kind: "unassigned" }
  | { kind: "ambiguous"; seasonIds: number[] };

function isSeasonPhase(value: string): value is SeasonPhase {
  return value === "Cut" || value === "Bulk";
}

function isSeasonStatus(value: string): value is SeasonStatus {
  return value === "active" || value === "completed";
}

function parseMonthlyPlanOverrides(value: Json): MonthlyGoalOverride[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (item === null || Array.isArray(item) || typeof item !== "object") return [];

    const month = item.month;
    const targetWeight = item.targetWeight;
    if (
      typeof month !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      typeof targetWeight !== "number" ||
      !Number.isFinite(targetWeight) ||
      targetWeight < 20 ||
      targetWeight > 200
    ) {
      return [];
    }

    return [{ month, targetWeight }];
  });
}

export function mapSeasonRow(row: SeasonRow): Season {
  if (!isSeasonPhase(row.phase)) {
    throw new Error(`invalid_season_phase:${row.phase}`);
  }
  if (!isSeasonStatus(row.status)) {
    throw new Error(`invalid_season_status:${row.status}`);
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phase: row.phase,
    startDate: row.start_date,
    startWeight: row.start_weight,
    targetDate: row.target_date,
    targetWeight: row.target_weight,
    status: row.status,
    endDate: row.end_date,
    endWeight: row.end_weight,
    monthlyPlanStartMonth: row.monthly_plan_start_month,
    monthlyPlanStartWeight: row.monthly_plan_start_weight,
    monthlyPlanOverrides: parseMonthlyPlanOverrides(row.monthly_plan_overrides),
    monthlyPlanSnapshot: parseMonthlyPlanSnapshot(row.monthly_plan_snapshot),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 日付が所属する season を解決する。
 *
 * DB 制約により通常は最大 1 件だが、legacy / mock data の重複を誤って 1 件に
 * 決め打ちしないため ambiguous を明示的に返す。
 */
export function resolveSeasonForDate(
  seasons: Season[],
  logDate: string
): SeasonResolution {
  const matches = seasons.filter(
    (season) =>
      season.startDate <= logDate &&
      (season.endDate === null || season.endDate >= logDate)
  );

  if (matches.length === 0) return { kind: "unassigned" };
  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      seasonIds: matches.map((season) => season.id).sort((a, b) => a - b),
    };
  }
  return { kind: "matched", season: matches[0]! };
}
