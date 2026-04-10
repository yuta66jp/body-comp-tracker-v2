import { calcWeeklyReview } from "./calcWeeklyReview";
import type { DashboardDailyLog } from "@/lib/supabase/types";
import type { ReadinessMetrics } from "./calcReadiness";
import type { DataQualityReport } from "./calcDataQuality";

function makeLog(
  log_date: string,
  overrides: Partial<DashboardDailyLog> = {}
): DashboardDailyLog {
  return {
    id: `log-${log_date}`,
    log_date,
    weight: overrides.weight ?? 70,
    calories: overrides.calories ?? 2000,
    protein: overrides.protein ?? 140,
    fat: overrides.fat ?? 50,
    carbs: overrides.carbs ?? 220,
    created_at: null,
    had_bowel_movement: null,
    is_cheat_day: false,
    is_eating_out: false,
    is_refeed_day: false,
    is_travel_day: false,
    sleep_hours: null,
    training_type: null,
    updated_at: "2026-04-02T00:00:00Z",
    work_mode: null,
    last_meal_end_time: null,
    step_count: null,
    bed_time: null,
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<ReadinessMetrics> = {}): ReadinessMetrics {
  return {
    bowel_movement_missing_days: 0,
    bowel_movement_rate_7d: null,
    calorie_adherence_7d: null,
    carb_adherence_7d: null,
    estimated_weekly_change_kg: null,
    fat_adherence_7d: null,
    macro_adherence_7d: null,
    protein_adherence_7d: null,
    readiness_score: 80,
    weight_7d_avg: 70,
    weight_change_7d: -0.3,
    weekly_rate_kg: -0.35,
    ...overrides,
  } as ReadinessMetrics;
}

function makeQualityReport(overrides: Partial<DataQualityReport> = {}): DataQualityReport {
  return {
    period7: {
      score: 90,
      weightMissingDays: 0,
      caloriesMissingDays: 0,
      anomalies: [],
    },
    period14: {
      score: 90,
      weightMissingDays: 0,
      caloriesMissingDays: 0,
      anomalies: [],
    },
    ...overrides,
  } as DataQualityReport;
}

describe("calcWeeklyReview", () => {
  it("タンパク質 g/kg BW と脂質カロリー比を算出する", () => {
    const logs = [
      makeLog("2026-03-27"),
      makeLog("2026-03-28"),
      makeLog("2026-03-29"),
      makeLog("2026-03-30"),
      makeLog("2026-03-31"),
      makeLog("2026-04-01"),
      makeLog("2026-04-02"),
    ];

    const result = calcWeeklyReview(
      logs,
      makeMetrics({ weight_7d_avg: 70 }),
      makeQualityReport(),
      { today: "2026-04-02", phase: "Cut" }
    );

    expect(result.nutrition.avgProtein).toBe(140);
    expect(result.nutrition.proteinGPerKgBw).toBeCloseTo(2.0, 2);
    expect(result.nutrition.fatCaloriesRatioPct).toBeCloseTo(22.5, 1);
  });

  it("基準体重や脂質/カロリーが欠けるときは null にフォールバックする", () => {
    const logs = [
      makeLog("2026-03-27", { calories: 2000, protein: 140, fat: null }),
      makeLog("2026-03-28", { calories: 1800, protein: 130, fat: null }),
      makeLog("2026-03-29", { calories: null, protein: null, fat: null }),
    ];

    const result = calcWeeklyReview(
      logs,
      makeMetrics({ weight_7d_avg: null }),
      makeQualityReport(),
      { today: "2026-04-02", phase: "Cut" }
    );

    expect(result.nutrition.avgProtein).toBe(135);
    expect(result.nutrition.proteinGPerKgBw).toBeNull();
    expect(result.nutrition.fatCaloriesRatioPct).toBeNull();
  });
});
