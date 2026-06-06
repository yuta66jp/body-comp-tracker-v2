import {
  calcMonthlyBehaviorStats,
  sortedTrainingEntries,
  sortedWorkModeEntries,
} from "../calcMonthlyBehaviorStats";
import type { DashboardDailyLog } from "@/lib/supabase/types";
import type { GoogleHealthDailyMetricForDisplay } from "@/lib/googleHealth/displayMetrics";

/** テスト用に最低限のフィールドを持つ DashboardDailyLog を生成するヘルパー */
function makeLog(
  log_date: string,
  overrides: Partial<DashboardDailyLog> = {},
): DashboardDailyLog {
  return {
    id: log_date,
    log_date,
    weight: 70,
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
    sleep_hours: null,
    training_type: null,
    work_mode: null,
    had_bowel_movement: null,
    is_cheat_day:   false,
    is_refeed_day:  false,
    is_eating_out:  false,
    is_travel_day:  false,
    is_tanning_day: false,
    is_posing_day:  false,
    last_meal_end_time: null,
    step_count: null,
    created_at: null,
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("calcMonthlyBehaviorStats", () => {
  describe("便通集計", () => {
    test("had_bowel_movement === true のみ日数としてカウントする", () => {
      const logs = [
        makeLog("2026-03-01", { had_bowel_movement: true }),
        makeLog("2026-03-02", { had_bowel_movement: false }),
        makeLog("2026-03-03", { had_bowel_movement: null }),
        makeLog("2026-03-04", { had_bowel_movement: true }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.bowelDays).toBe(2);
    });

    test("had_bowel_movement が全て null の月は bowelDays = 0", () => {
      const logs = [
        makeLog("2026-03-01", { had_bowel_movement: null }),
        makeLog("2026-03-02", { had_bowel_movement: null }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.bowelDays).toBe(0);
    });

    test("had_bowel_movement === false は集計対象外", () => {
      const logs = [
        makeLog("2026-03-01", { had_bowel_movement: false }),
        makeLog("2026-03-02", { had_bowel_movement: false }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.bowelDays).toBe(0);
    });
  });

  describe("training_type 集計", () => {
    test("カテゴリ別件数が正しく計算される", () => {
      const logs = [
        makeLog("2026-03-01", { training_type: "chest" }),
        makeLog("2026-03-02", { training_type: "chest" }),
        makeLog("2026-03-03", { training_type: "back" }),
        makeLog("2026-03-04", { training_type: "off" }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.trainingCounts).toEqual({
        chest: 2,
        back: 1,
        off: 1,
      });
    });

    test("null は集計対象外", () => {
      const logs = [
        makeLog("2026-03-01", { training_type: null }),
        makeLog("2026-03-02", { training_type: "chest" }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.trainingCounts).toEqual({ chest: 1 });
    });

    test("無効な training_type 文字列は集計対象外", () => {
      const logs = [
        makeLog("2026-03-01", { training_type: "unknown_type" }),
        makeLog("2026-03-02", { training_type: "chest" }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.trainingCounts).toEqual({ chest: 1 });
    });

    test("off は有効値として集計される", () => {
      const logs = [
        makeLog("2026-03-01", { training_type: "off" }),
        makeLog("2026-03-02", { training_type: "off" }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.trainingCounts).toEqual({ off: 2 });
    });

    test("記録がない月は trainingCounts が空オブジェクト", () => {
      const logs = [makeLog("2026-03-01", { training_type: null })];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.trainingCounts).toEqual({});
    });
  });

  describe("work_mode 集計", () => {
    test("カテゴリ別件数が正しく計算される", () => {
      const logs = [
        makeLog("2026-03-01", { work_mode: "remote" }),
        makeLog("2026-03-02", { work_mode: "remote" }),
        makeLog("2026-03-03", { work_mode: "office" }),
        makeLog("2026-03-04", { work_mode: "off" }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.workModeCounts).toEqual({
        remote: 2,
        office: 1,
        off: 1,
      });
    });

    test("null は集計対象外", () => {
      const logs = [
        makeLog("2026-03-01", { work_mode: null }),
        makeLog("2026-03-02", { work_mode: "remote" }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.workModeCounts).toEqual({ remote: 1 });
    });

    test("off (休日) は有効値として集計される", () => {
      const logs = [
        makeLog("2026-03-01", { work_mode: "off" }),
        makeLog("2026-03-02", { work_mode: "off" }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.workModeCounts).toEqual({ off: 2 });
    });
  });

  describe("特殊日フラグ集計", () => {
    test("各フラグが正しく集計される", () => {
      const logs = [
        makeLog("2026-03-01", { is_cheat_day: true }),
        makeLog("2026-03-02", { is_refeed_day: true }),
        makeLog("2026-03-03", { is_refeed_day: true }),
        makeLog("2026-03-04", { is_eating_out: true }),
        makeLog("2026-03-05", { is_eating_out: true }),
        makeLog("2026-03-06", { is_eating_out: true }),
        makeLog("2026-03-07", { is_travel_day: true }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.flagCounts).toEqual({
        is_cheat_day:  1,
        is_refeed_day: 2,
        is_eating_out: 3,
        is_travel_day: 1,
      });
    });

    test("false は集計対象外", () => {
      const logs = [
        makeLog("2026-03-01", { is_cheat_day: false }),
        makeLog("2026-03-02", { is_refeed_day: false }),
        makeLog("2026-03-03", { is_travel_day: false }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.flagCounts).toEqual({
        is_cheat_day:  0,
        is_refeed_day: 0,
        is_eating_out: 0,
        is_travel_day: 0,
      });
    });
  });

  describe("月分割・複数月", () => {
    test("月をまたいでログが正しく分割される", () => {
      const logs = [
        makeLog("2026-02-28", { had_bowel_movement: true }),
        makeLog("2026-03-01", { had_bowel_movement: true }),
        makeLog("2026-03-02", { had_bowel_movement: true }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      // 2026-03 が先 (降順)
      expect(result[0]!.month).toBe("2026-03");
      expect(result[0]!.bowelDays).toBe(2);
      expect(result[1]!.month).toBe("2026-02");
      expect(result[1]!.bowelDays).toBe(1);
    });

    test("months パラメータで返す月数を制限できる", () => {
      const logs = [
        makeLog("2026-01-01", { had_bowel_movement: true }),
        makeLog("2026-02-01", { had_bowel_movement: true }),
        makeLog("2026-03-01", { had_bowel_movement: true }),
      ];
      const result = calcMonthlyBehaviorStats(logs, 2);
      expect(result).toHaveLength(2);
      expect(result[0]!.month).toBe("2026-03");
      expect(result[1]!.month).toBe("2026-02");
    });

    test("months = 0 (デフォルト) で全月を返す", () => {
      const logs = [
        makeLog("2026-01-01"),
        makeLog("2026-02-01"),
        makeLog("2026-03-01"),
      ];
      const result = calcMonthlyBehaviorStats(logs, 0);
      expect(result).toHaveLength(3);
    });
  });

  describe("空データ・エッジケース", () => {
    test("ログが空配列の場合は空配列を返す", () => {
      const result = calcMonthlyBehaviorStats([]);
      expect(result).toEqual([]);
    });

    test("全フィールドが null / false のログでも UI が破綻しない (各集計が 0 になる)", () => {
      const logs = [makeLog("2026-03-01")];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result).toHaveLength(1);
      expect(result[0]!.bowelDays).toBe(0);
      expect(result[0]!.trainingCounts).toEqual({});
      expect(result[0]!.workModeCounts).toEqual({});
      expect(result[0]!.flagCounts).toEqual({
        is_cheat_day: 0,
        is_refeed_day: 0,
        is_eating_out: 0,
        is_travel_day: 0,
      });
    });

    test("null と有効値が混在する月でも正しく集計される", () => {
      const logs = [
        makeLog("2026-03-01", {
          had_bowel_movement: true,
          training_type: "chest",
          work_mode: "remote",
          is_cheat_day: true,
        }),
        makeLog("2026-03-02", {
          had_bowel_movement: null,
          training_type: null,
          work_mode: null,
          is_cheat_day: false,
        }),
        makeLog("2026-03-03", {
          had_bowel_movement: false,
          training_type: "back",
          work_mode: "office",
        }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0]!.bowelDays).toBe(1);
      expect(result[0]!.trainingCounts).toEqual({ chest: 1, back: 1 });
      expect(result[0]!.workModeCounts).toEqual({ remote: 1, office: 1 });
      expect(result[0]!.flagCounts.is_cheat_day).toBe(1);
    });
  });
});

describe("calcMonthlyBehaviorStats — sleepStats", () => {
  /**
   * テスト用 sleep_session を生成する。
   * bed_hhmm > wake_hhmm（前日夜就寝）の場合は bed_at を wake_date の前日に設定し、
   * DB制約 `bed_at < wake_at` を正しく再現する。
   * これは production の buildSleepSessionDatetimes と同じ判定ロジック。
   */
  function makeSession(wake_date: string, bed_hhmm: string, wake_hhmm: string) {
    const isOvernight = bed_hhmm > wake_hhmm; // 辞書順比較: "23:00" > "07:00" は真
    const bedDate = isOvernight ? prevDate(wake_date) : wake_date;
    return {
      wake_date,
      bed_at:  `${bedDate}T${bed_hhmm}:00+09:00`,
      wake_at: `${wake_date}T${wake_hhmm}:00+09:00`,
    };
  }

  /** wake_date の前日を "YYYY-MM-DD" で返す */
  function prevDate(dateStr: string): string {
    const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
    const prev = new Date(Date.UTC(y, m - 1, d - 1));
    return prev.toISOString().slice(0, 10);
  }

  test("sleepSessions を渡さない場合 sleepStats は null", () => {
    const logs = [makeLog("2026-03-15")];
    const result = calcMonthlyBehaviorStats(logs);
    expect(result[0]!.sleepStats).toBeNull();
  });

  test("空の sleepSessions を渡した場合 sleepStats は null", () => {
    const logs = [makeLog("2026-03-15")];
    const result = calcMonthlyBehaviorStats(logs, 0, []);
    expect(result[0]!.sleepStats).toBeNull();
  });

  test("該当月にセッションがある場合 avgSleepHours / medianBedTime / medianWakeTime が計算される", () => {
    const logs = [
      makeLog("2026-03-15", { work_mode: "office" }),
      makeLog("2026-03-16", { work_mode: "remote" }),
    ];
    const sessions = [
      // 前日夜就寝: bed_at = 2026-03-14T23:00+09, wake_at = 2026-03-15T07:00+09 → 8h
      makeSession("2026-03-15", "23:00", "07:00"),
      // 当日深夜就寝: bed_at = 2026-03-16T00:00+09, wake_at = 2026-03-16T07:30+09 → 7.5h
      makeSession("2026-03-16", "00:00", "07:30"),
    ];
    const result = calcMonthlyBehaviorStats(logs, 0, sessions);
    const stats = result[0]!.sleepStats;
    expect(stats).not.toBeNull();
    // 8h + 7.5h = 15.5h / 2 = 7.75 → 7.8
    expect(stats!.avgSleepHours).toBe(7.8);
    // 就寝中央値: bedTimeToMinutes("23:00")=1380, bedTimeToMinutes("00:00")=1440 → 中央値 1410 → "23:30"
    expect(stats!.medianBedTime).toBe("23:30");
    // 起床中央値: wakeTimeToMinutes("07:00")=420, wakeTimeToMinutes("07:30")=450 → 中央値 435 → "07:15"
    expect(stats!.medianWakeTime).toBe("07:15");
  });

  test("別月のセッションは他月の sleepStats に影響しない", () => {
    const logs = [
      makeLog("2026-03-15"),
      makeLog("2026-04-15"),
    ];
    const sessions = [
      makeSession("2026-03-15", "23:00", "07:00"),
    ];
    const result = calcMonthlyBehaviorStats(logs, 0, sessions);
    // 降順: 2026-04 が result[0], 2026-03 が result[1]
    expect(result[0]!.month).toBe("2026-04");
    expect(result[0]!.sleepStats).toBeNull(); // 4月にセッションなし
    expect(result[1]!.month).toBe("2026-03");
    expect(result[1]!.sleepStats).not.toBeNull();
  });

  test("Supabase が UTC (+00:00) 形式で返す TIMESTAMPTZ でも正しく集計できる", () => {
    // Supabase は TIMESTAMPTZ を UTC 形式で返す (例: "2026-03-14T14:30:00+00:00")
    // JST 23:30 = UTC 14:30、JST 07:00 = UTC 22:00 (前日の UTC 日付になる)
    const logs = [makeLog("2026-03-15")];
    const sessions = [
      {
        wake_date: "2026-03-15",
        bed_at:    "2026-03-14T14:30:00+00:00", // UTC = JST 2026-03-14 23:30
        wake_at:   "2026-03-14T22:00:00+00:00", // UTC = JST 2026-03-15 07:00
      },
    ];
    const result = calcMonthlyBehaviorStats(logs, 0, sessions);
    const stats = result[0]!.sleepStats;
    expect(stats).not.toBeNull();
    // 23:30 → 07:00 = 7.5h
    expect(stats!.avgSleepHours).toBe(7.5);
    expect(stats!.medianBedTime).toBe("23:30");
    expect(stats!.medianWakeTime).toBe("07:00");
  });

  test("Google Health metrics を渡した場合は睡眠集計と心肺機能を Google Health 由来で計算する", () => {
    const logs = [
      makeLog("2026-06-03", { work_mode: "office" }),
      makeLog("2026-06-04", { work_mode: "remote" }),
    ];
    const googleHealthMetrics: GoogleHealthDailyMetricForDisplay[] = [
      {
        metric_date: "2026-06-03",
        step_count: 972,
        sleep_minutes: 300,
        deep_sleep_minutes: 54,
        sleep_bed_at: "2026-06-02T15:34:00Z",
        sleep_wake_at: "2026-06-02T20:29:00Z",
        hrv_ms: 125.8,
        rhr_bpm: 43,
      },
      {
        metric_date: "2026-06-04",
        step_count: 5126,
        sleep_minutes: 336,
        deep_sleep_minutes: 63,
        sleep_bed_at: "2026-06-03T15:02:00Z",
        sleep_wake_at: "2026-06-03T20:38:00Z",
        hrv_ms: 128.8,
        rhr_bpm: 45,
      },
    ];

    const result = calcMonthlyBehaviorStats(logs, 0, [], googleHealthMetrics);
    const stats = result[0]!;

    expect(stats.sleepStats?.avgSleepHours).toBe(5.3);
    expect(stats.sleepStats?.avgByWorkMode.office).toBe(5);
    expect(stats.sleepStats?.avgByWorkMode.remote).toBe(5.6);
    expect(stats.cardioStats).toEqual({
      avgHrvMs: 127.3,
      avgRhrBpm: 44,
    });
  });
});

describe("sortedTrainingEntries", () => {
  test("TRAINING_TYPES の定義順で返す", () => {
    const counts = { back: 3, chest: 2, off: 1 };
    const result = sortedTrainingEntries(counts);
    // TRAINING_TYPES = ["off", "chest", "back", "shoulders", "glutes_hamstrings", "quads"]
    expect(result.map((e) => e.type)).toEqual(["off", "chest", "back"]);
    expect(result.map((e) => e.count)).toEqual([1, 2, 3]);
  });

  test("件数が 0 のエントリーは含まない", () => {
    const counts = { chest: 0, back: 2 };
    const result = sortedTrainingEntries(counts);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("back");
  });

  test("空オブジェクトは空配列を返す", () => {
    expect(sortedTrainingEntries({})).toEqual([]);
  });
});

describe("sortedWorkModeEntries", () => {
  test("WORK_MODES の定義順で返す", () => {
    const counts = { remote: 10, off: 8, office: 12 };
    const result = sortedWorkModeEntries(counts);
    // WORK_MODES = ["off", "office", "remote"]
    expect(result.map((e) => e.mode)).toEqual(["off", "office", "remote"]);
  });

  test("件数が 0 のエントリーは含まない", () => {
    const counts = { off: 0, office: 3 };
    const result = sortedWorkModeEntries(counts);
    expect(result).toHaveLength(1);
    expect(result[0]!.mode).toBe("office");
  });
});
