import {
  calcMonthlyBehaviorStats,
  sortedTrainingEntries,
  sortedWorkModeEntries,
} from "../calcMonthlyBehaviorStats";
import type { DashboardDailyLog } from "@/lib/supabase/types";

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
    is_cheat_day: false,
    is_refeed_day: false,
    is_eating_out: false,
    is_travel_day: false,
    is_poor_sleep: null,
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
      expect(result[0].bowelDays).toBe(2);
    });

    test("had_bowel_movement が全て null の月は bowelDays = 0", () => {
      const logs = [
        makeLog("2026-03-01", { had_bowel_movement: null }),
        makeLog("2026-03-02", { had_bowel_movement: null }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0].bowelDays).toBe(0);
    });

    test("had_bowel_movement === false は集計対象外", () => {
      const logs = [
        makeLog("2026-03-01", { had_bowel_movement: false }),
        makeLog("2026-03-02", { had_bowel_movement: false }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0].bowelDays).toBe(0);
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
      expect(result[0].trainingCounts).toEqual({
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
      expect(result[0].trainingCounts).toEqual({ chest: 1 });
    });

    test("無効な training_type 文字列は集計対象外", () => {
      const logs = [
        makeLog("2026-03-01", { training_type: "unknown_type" }),
        makeLog("2026-03-02", { training_type: "chest" }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0].trainingCounts).toEqual({ chest: 1 });
    });

    test("off は有効値として集計される", () => {
      const logs = [
        makeLog("2026-03-01", { training_type: "off" }),
        makeLog("2026-03-02", { training_type: "off" }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0].trainingCounts).toEqual({ off: 2 });
    });

    test("記録がない月は trainingCounts が空オブジェクト", () => {
      const logs = [makeLog("2026-03-01", { training_type: null })];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0].trainingCounts).toEqual({});
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
      expect(result[0].workModeCounts).toEqual({
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
      expect(result[0].workModeCounts).toEqual({ remote: 1 });
    });

    test("off (休日) は有効値として集計される", () => {
      const logs = [
        makeLog("2026-03-01", { work_mode: "off" }),
        makeLog("2026-03-02", { work_mode: "off" }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0].workModeCounts).toEqual({ off: 2 });
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
        makeLog("2026-03-08", { is_poor_sleep: true }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0].flagCounts).toEqual({
        is_cheat_day:  1,
        is_refeed_day: 2,
        is_eating_out: 3,
        is_travel_day: 1,
        is_poor_sleep: 1,
      });
    });

    test("false / null は集計対象外", () => {
      const logs = [
        makeLog("2026-03-01", { is_cheat_day: false }),
        makeLog("2026-03-02", { is_poor_sleep: null }),
        makeLog("2026-03-03", { is_refeed_day: false }),
      ];
      const result = calcMonthlyBehaviorStats(logs);
      expect(result[0].flagCounts).toEqual({
        is_cheat_day:  0,
        is_refeed_day: 0,
        is_eating_out: 0,
        is_travel_day: 0,
        is_poor_sleep: 0,
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
      expect(result[0].month).toBe("2026-03");
      expect(result[0].bowelDays).toBe(2);
      expect(result[1].month).toBe("2026-02");
      expect(result[1].bowelDays).toBe(1);
    });

    test("months パラメータで返す月数を制限できる", () => {
      const logs = [
        makeLog("2026-01-01", { had_bowel_movement: true }),
        makeLog("2026-02-01", { had_bowel_movement: true }),
        makeLog("2026-03-01", { had_bowel_movement: true }),
      ];
      const result = calcMonthlyBehaviorStats(logs, 2);
      expect(result).toHaveLength(2);
      expect(result[0].month).toBe("2026-03");
      expect(result[1].month).toBe("2026-02");
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
      expect(result[0].bowelDays).toBe(0);
      expect(result[0].trainingCounts).toEqual({});
      expect(result[0].workModeCounts).toEqual({});
      expect(result[0].flagCounts).toEqual({
        is_cheat_day: 0,
        is_refeed_day: 0,
        is_eating_out: 0,
        is_travel_day: 0,
        is_poor_sleep: 0,
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
      expect(result[0].bowelDays).toBe(1);
      expect(result[0].trainingCounts).toEqual({ chest: 1, back: 1 });
      expect(result[0].workModeCounts).toEqual({ remote: 1, office: 1 });
      expect(result[0].flagCounts.is_cheat_day).toBe(1);
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
    expect(result[0].type).toBe("back");
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
    expect(result[0].mode).toBe("office");
  });
});
