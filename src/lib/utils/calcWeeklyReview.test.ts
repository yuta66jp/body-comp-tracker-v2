import { calcWeeklyReview } from "./calcWeeklyReview";
import type { DashboardDailyLog, SleepSession } from "@/lib/supabase/types";
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

  it("直近 7 暦日の平均睡眠時間を算出する", () => {
    const logs = [
      makeLog("2026-03-27", { sleep_hours: 7.0 }),
      makeLog("2026-03-28", { sleep_hours: 8.0 }),
      makeLog("2026-03-29", { sleep_hours: 7.5 }),
      makeLog("2026-03-30", { sleep_hours: null }), // 欠損は除外
      makeLog("2026-03-31", { sleep_hours: 6.5 }),
      makeLog("2026-04-01", { sleep_hours: 8.0 }),
      makeLog("2026-04-02", { sleep_hours: 7.0 }),
    ];

    const result = calcWeeklyReview(
      logs,
      makeMetrics(),
      makeQualityReport(),
      { today: "2026-04-02", phase: "Cut" }
    );

    // (7.0 + 8.0 + 7.5 + 6.5 + 8.0 + 7.0) / 6 = 44 / 6 ≈ 7.333
    expect(result.sleep.avgSleepHours).toBeCloseTo(44 / 6, 5);
    expect(result.sleep.sleepDaysLogged).toBe(6);
  });

  it("sleep_hours が全て null のときは avgSleepHours が null になる", () => {
    const logs = [
      makeLog("2026-03-27", { sleep_hours: null }),
      makeLog("2026-03-28", { sleep_hours: null }),
    ];

    const result = calcWeeklyReview(
      logs,
      makeMetrics(),
      makeQualityReport(),
      { today: "2026-04-02", phase: "Cut" }
    );

    expect(result.sleep.avgSleepHours).toBeNull();
    expect(result.sleep.sleepDaysLogged).toBe(0);
  });

  it("新フィールドのデフォルト: sleepSessions 未指定のとき全て null / 0", () => {
    const result = calcWeeklyReview(
      [makeLog("2026-04-02")],
      makeMetrics(),
      makeQualityReport(),
      { today: "2026-04-02" }
    );
    expect(result.sleep.avgBedTime).toBeNull();
    expect(result.sleep.avgWakeTime).toBeNull();
    expect(result.sleep.avgBedTimeDeltaMins).toBeNull();
    expect(result.sleep.avgWakeTimeDeltaMins).toBeNull();
    expect(result.sleep.timeDaysLogged).toBe(0);
  });

  // ─── 就寝・起床平均時刻 ───────────────────────────────────────────────────────

  function makeSleepSession(
    wakeDate: string,
    bedAtUtc: string,
    wakeAtUtc: string
  ): SleepSession {
    return {
      id: `session-${wakeDate}`,
      wake_date: wakeDate,
      bed_at: bedAtUtc,
      wake_at: wakeAtUtc,
      source: "manual",
      note: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
  }

  it("sleepSessions から就寝・起床平均時刻を算出する", () => {
    // today = 2026-04-02, 当週: 2026-03-27〜2026-04-02
    // セッション 1 (wake_date=2026-04-01): bed 23:00 JST, wake 7:00 JST
    //   bed_at UTC: JST23:00=UTC14:00 → "2026-03-31T14:00:00Z"
    //   wake_at UTC: JST07:00=UTC22:00(前日) → "2026-03-31T22:00:00Z"
    // セッション 2 (wake_date=2026-04-02): bed 23:30 JST, wake 7:00 JST
    //   bed_at UTC: JST23:30=UTC14:30 → "2026-04-01T14:30:00Z"
    //   wake_at UTC: JST07:00=UTC22:00 → "2026-04-01T22:00:00Z"
    const sessions = [
      makeSleepSession("2026-04-01", "2026-03-31T14:00:00Z", "2026-03-31T22:00:00Z"),
      makeSleepSession("2026-04-02", "2026-04-01T14:30:00Z", "2026-04-01T22:00:00Z"),
    ];
    const result = calcWeeklyReview(
      [makeLog("2026-04-01"), makeLog("2026-04-02")],
      makeMetrics(),
      makeQualityReport(),
      { today: "2026-04-02", sleepSessions: sessions }
    );
    // avg bed: (23:00=1380 + 23:30=1410) / 2 = 1395 → 23:15
    expect(result.sleep.avgBedTime).toBe("23:15");
    // avg wake: (7:00=420 + 7:00=420) / 2 = 420 → 07:00
    expect(result.sleep.avgWakeTime).toBe("07:00");
    expect(result.sleep.timeDaysLogged).toBe(2);
  });

  it("就寝時刻の日付越え補正: 0:30 と 23:30 の平均が 0:00", () => {
    // 0:30 JST = UTC 15:30 前日 → timestampToJstMinutes → 30 → +1440 = 1470
    // 23:30 JST = UTC 14:30 → 1410 → 補正なし
    // avg = (1470 + 1410) / 2 = 1440 → minutesToHHMM(1440) = 1440%1440=0 → "00:00"
    const sessions = [
      makeSleepSession("2026-04-01", "2026-03-31T15:30:00Z", "2026-04-01T22:00:00Z"),
      makeSleepSession("2026-04-02", "2026-04-01T14:30:00Z", "2026-04-01T22:00:00Z"),
    ];
    const result = calcWeeklyReview(
      [makeLog("2026-04-01"), makeLog("2026-04-02")],
      makeMetrics(),
      makeQualityReport(),
      { today: "2026-04-02", sleepSessions: sessions }
    );
    expect(result.sleep.avgBedTime).toBe("00:00");
  });

  it("前週データがある場合に就寝・起床時刻の前週比を算出する", () => {
    // today = 2026-04-14
    // 当週: 2026-04-08〜2026-04-14  前週: 2026-04-01〜2026-04-07
    //
    // 前週 (wake_date=2026-04-07): bed 23:00(1380), wake 07:00(420)
    //   bed_at UTC: "2026-04-06T14:00:00Z", wake_at UTC: "2026-04-06T22:00:00Z"
    // 当週 (wake_date=2026-04-14): bed 23:30(1410), wake 07:30(450)
    //   bed_at UTC: "2026-04-13T14:30:00Z", wake_at UTC: "2026-04-13T22:30:00Z"
    const sessions = [
      makeSleepSession("2026-04-07", "2026-04-06T14:00:00Z", "2026-04-06T22:00:00Z"),
      makeSleepSession("2026-04-14", "2026-04-13T14:30:00Z", "2026-04-13T22:30:00Z"),
    ];
    const result = calcWeeklyReview(
      [makeLog("2026-04-07"), makeLog("2026-04-14")],
      makeMetrics(),
      makeQualityReport(),
      { today: "2026-04-14", sleepSessions: sessions }
    );
    // bed delta: 1410 - 1380 = 30 分 (30分遅くなった)
    expect(result.sleep.avgBedTimeDeltaMins).toBe(30);
    // wake delta: 450 - 420 = 30 分 (30分遅くなった)
    expect(result.sleep.avgWakeTimeDeltaMins).toBe(30);
  });

  it("前週データがない場合は delta が null", () => {
    // 当週のみのセッション (前週は空)
    const sessions = [
      makeSleepSession("2026-04-02", "2026-04-01T14:30:00Z", "2026-04-01T22:00:00Z"),
    ];
    const result = calcWeeklyReview(
      [makeLog("2026-04-02")],
      makeMetrics(),
      makeQualityReport(),
      { today: "2026-04-02", sleepSessions: sessions }
    );
    expect(result.sleep.avgBedTime).toBe("23:30");
    expect(result.sleep.avgBedTimeDeltaMins).toBeNull();
    expect(result.sleep.avgWakeTimeDeltaMins).toBeNull();
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
