/**
 * calendarUtils テスト
 *
 * buildCalendarDayMap の差分計算・タグ処理・コンディション整形を検証する。
 */

import { buildCalendarDayMap, buildConditionTags, toDateKey } from "./calendarUtils";
import type { DailyLog } from "@/lib/supabase/types";

// ── テストデータ工場 ─────────────────────────────────────────────────────────

function makeLog(overrides: Partial<DailyLog> & { log_date: string }): DailyLog {
  return {
    log_date:           overrides.log_date,
    weight:             overrides.weight             ?? null,
    calories:           overrides.calories           ?? null,
    protein:            overrides.protein            ?? null,
    fat:                overrides.fat                ?? null,
    carbs:              overrides.carbs              ?? null,
    note:               overrides.note               ?? null,
    is_cheat_day:       overrides.is_cheat_day       ?? false,
    is_refeed_day:      overrides.is_refeed_day      ?? false,
    is_eating_out:      overrides.is_eating_out      ?? false,
    is_travel_day:      overrides.is_travel_day      ?? false,
    is_poor_sleep:      overrides.is_poor_sleep      ?? false,
    sleep_hours:        overrides.sleep_hours        ?? null,
    had_bowel_movement: overrides.had_bowel_movement ?? null,
    training_type:      overrides.training_type      ?? null,
    work_mode:          overrides.work_mode          ?? null,
    leg_flag:           overrides.leg_flag           ?? null,
    updated_at:         overrides.updated_at         ?? "2026-03-01T00:00:00Z",
  };
}

// ── buildCalendarDayMap ──────────────────────────────────────────────────────

describe("buildCalendarDayMap", () => {
  it("ログがない場合は空 Map を返す", () => {
    const result = buildCalendarDayMap([]);
    expect(result.size).toBe(0);
  });

  it("ログ日が Map のキーになる", () => {
    const logs = [
      makeLog({ log_date: "2026-03-10", weight: 75.0, calories: 2000 }),
      makeLog({ log_date: "2026-03-12", weight: 74.8, calories: 1900 }),
    ];
    const map = buildCalendarDayMap(logs);
    expect(map.has("2026-03-10")).toBe(true);
    expect(map.has("2026-03-12")).toBe(true);
    expect(map.has("2026-03-11")).toBe(false); // ログなし日は含まれない
  });

  // ── 体重差分 ──────────────────────────────────────────────────────────────

  describe("weightDelta", () => {
    it("最初の体重記録の weightDelta は null", () => {
      const logs = [makeLog({ log_date: "2026-03-10", weight: 75.0 })];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-10")!.weightDelta).toBeNull();
    });

    it("連続ログの weightDelta = 当日 - 前日", () => {
      const logs = [
        makeLog({ log_date: "2026-03-10", weight: 75.0 }),
        makeLog({ log_date: "2026-03-11", weight: 74.7 }),
      ];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-11")!.weightDelta).toBeCloseTo(-0.3);
    });

    it("欠損日を跨いだ差分: 直前体重記録との差分を返す", () => {
      const logs = [
        makeLog({ log_date: "2026-03-10", weight: 75.0 }),
        // 2026-03-11 欠損
        makeLog({ log_date: "2026-03-12", weight: 74.6 }),
      ];
      const map = buildCalendarDayMap(logs);
      // 直前体重記録は 2026-03-10 (75.0)
      expect(map.get("2026-03-12")!.weightDelta).toBeCloseTo(-0.4);
    });

    it("体重が null のエントリは weightDelta も null", () => {
      const logs = [
        makeLog({ log_date: "2026-03-10", weight: 75.0 }),
        makeLog({ log_date: "2026-03-11", weight: null }), // 体重なし
      ];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-11")!.weightDelta).toBeNull();
    });

    it("体重 0.0 は有効値として扱い差分を計算する (falsy trap)", () => {
      const logs = [
        makeLog({ log_date: "2026-03-10", weight: 0.1 }),
        makeLog({ log_date: "2026-03-11", weight: 0.0 }),
      ];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-11")!.weightDelta).toBeCloseTo(-0.1);
    });
  });

  // ── カロリー差分 ──────────────────────────────────────────────────────────

  describe("calDelta", () => {
    it("最初のカロリー記録の calDelta は null", () => {
      const logs = [makeLog({ log_date: "2026-03-10", calories: 2000 })];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-10")!.calDelta).toBeNull();
    });

    it("連続ログの calDelta = 当日 - 前日", () => {
      const logs = [
        makeLog({ log_date: "2026-03-10", calories: 2000 }),
        makeLog({ log_date: "2026-03-11", calories: 1800 }),
      ];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-11")!.calDelta).toBe(-200);
    });

    it("calories が null の場合 calDelta は null", () => {
      const logs = [
        makeLog({ log_date: "2026-03-10", calories: 2000 }),
        makeLog({ log_date: "2026-03-11", calories: null }),
      ];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-11")!.calDelta).toBeNull();
    });

    it("欠損日を跨いだカロリー差分: 直前カロリー記録との差分を返す", () => {
      const logs = [
        makeLog({ log_date: "2026-03-10", calories: 2000 }),
        makeLog({ log_date: "2026-03-13", calories: 2200 }), // 11, 12 は欠損
      ];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-13")!.calDelta).toBe(200);
    });

    it("体重とカロリーの差分は独立して計算される", () => {
      // 2026-03-11: 体重あり・カロリーなし → weightDelta あり、calDelta なし
      const logs = [
        makeLog({ log_date: "2026-03-10", weight: 75.0, calories: 2000 }),
        makeLog({ log_date: "2026-03-11", weight: 74.8, calories: null }),
        makeLog({ log_date: "2026-03-12", weight: null, calories: 1900 }),
      ];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-11")!.weightDelta).toBeCloseTo(-0.2);
      expect(map.get("2026-03-11")!.calDelta).toBeNull();
      expect(map.get("2026-03-12")!.weightDelta).toBeNull();
      expect(map.get("2026-03-12")!.calDelta).toBe(-100);
    });
  });

  // ── 特殊日タグ ────────────────────────────────────────────────────────────

  describe("dayTags", () => {
    it("is_cheat_day=true のとき dayTags にチートデイが含まれる", () => {
      const logs = [makeLog({ log_date: "2026-03-10", is_cheat_day: true })];
      const map = buildCalendarDayMap(logs);
      const tags = map.get("2026-03-10")!.dayTags;
      expect(tags.some((t) => t.key === "is_cheat_day")).toBe(true);
      expect(tags.find((t) => t.key === "is_cheat_day")!.label).toBe("チートデイ");
    });

    it("is_cheat_day=false のとき dayTags に含まれない", () => {
      const logs = [makeLog({ log_date: "2026-03-10", is_cheat_day: false })];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-10")!.dayTags).toHaveLength(0);
    });

    it("複数タグが同時に true のとき全て含まれる", () => {
      const logs = [makeLog({ log_date: "2026-03-10", is_cheat_day: true, is_eating_out: true })];
      const map = buildCalendarDayMap(logs);
      const keys = map.get("2026-03-10")!.dayTags.map((t) => t.key);
      expect(keys).toContain("is_cheat_day");
      expect(keys).toContain("is_eating_out");
    });

    it("is_travel_day=true のとき dayTags に旅行が含まれる", () => {
      const logs = [makeLog({ log_date: "2026-03-10", is_travel_day: true })];
      const map = buildCalendarDayMap(logs);
      const tags = map.get("2026-03-10")!.dayTags;
      expect(tags.some((t) => t.key === "is_travel_day")).toBe(true);
      expect(tags.find((t) => t.key === "is_travel_day")!.label).toBe("旅行");
    });

    it("is_travel_day=false のとき dayTags に含まれない", () => {
      const logs = [makeLog({ log_date: "2026-03-10", is_travel_day: false })];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-10")!.dayTags).toHaveLength(0);
    });
  });

  // ── コンディション ────────────────────────────────────────────────────────

  describe("conditionSummary", () => {
    it("便通・training_type・work_mode から1行テキストを生成する", () => {
      const logs = [makeLog({
        log_date: "2026-03-10",
        had_bowel_movement: true,
        training_type: "quads",
        work_mode: "remote",
      })];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-10")!.conditionSummary).toBe("便通あり / 四頭 / 在宅");
    });

    it("全て null の場合 conditionSummary は null", () => {
      const logs = [makeLog({ log_date: "2026-03-10" })];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-10")!.conditionSummary).toBeNull();
    });

    it("had_bowel_movement=false のとき「便通なし」が含まれる", () => {
      const logs = [makeLog({ log_date: "2026-03-10", had_bowel_movement: false })];
      const map = buildCalendarDayMap(logs);
      expect(map.get("2026-03-10")!.conditionSummary).toBe("便通なし");
    });
  });
});

// ── conditionTags (buildCalendarDayMap 経由) ─────────────────────────────────

describe("conditionTags (buildCalendarDayMap)", () => {
  it("had_bowel_movement=true → key=bowel, label=便通, green color", () => {
    const logs = [makeLog({ log_date: "2026-03-10", had_bowel_movement: true })];
    const map = buildCalendarDayMap(logs);
    const tags = map.get("2026-03-10")!.conditionTags;
    expect(tags.find((t) => t.key === "bowel")?.label).toBe("便通");
    expect(tags.find((t) => t.key === "bowel")?.colorClass).toContain("green");
  });

  it("had_bowel_movement=false → key=bowel, label=便通なし, slate color", () => {
    const logs = [makeLog({ log_date: "2026-03-10", had_bowel_movement: false })];
    const map = buildCalendarDayMap(logs);
    const tags = map.get("2026-03-10")!.conditionTags;
    expect(tags.find((t) => t.key === "bowel")?.label).toBe("便通なし");
    expect(tags.find((t) => t.key === "bowel")?.colorClass).toContain("slate");
  });

  it("training_type=glutes_hamstrings → key=training, label=ハム・ケツ", () => {
    const logs = [makeLog({ log_date: "2026-03-10", training_type: "glutes_hamstrings" })];
    const map = buildCalendarDayMap(logs);
    const tags = map.get("2026-03-10")!.conditionTags;
    expect(tags.find((t) => t.key === "training")?.label).toBe("ハム・ケツ");
  });

  it("work_mode=off → key=work, label=休日, amber color", () => {
    const logs = [makeLog({ log_date: "2026-03-10", work_mode: "off" })];
    const map = buildCalendarDayMap(logs);
    const tags = map.get("2026-03-10")!.conditionTags;
    expect(tags.find((t) => t.key === "work")?.label).toBe("休日");
    expect(tags.find((t) => t.key === "work")?.colorClass).toContain("amber");
  });

  it("全て null → conditionTags は空配列", () => {
    const logs = [makeLog({ log_date: "2026-03-10" })];
    const map = buildCalendarDayMap(logs);
    expect(map.get("2026-03-10")!.conditionTags).toHaveLength(0);
  });
});

// ── buildConditionTags (standalone) ─────────────────────────────────────────

describe("buildConditionTags", () => {
  it("全 null → 空配列", () => {
    expect(buildConditionTags({ had_bowel_movement: null, training_type: null, work_mode: null }))
      .toHaveLength(0);
  });

  it("全て指定 → 3タグ返す", () => {
    const tags = buildConditionTags({
      had_bowel_movement: true,
      training_type: "chest",
      work_mode: "remote",
    });
    expect(tags).toHaveLength(3);
    expect(tags.map((t) => t.key)).toEqual(["bowel", "training", "work"]);
  });

  it("未知 training_type は除外される", () => {
    const tags = buildConditionTags({ had_bowel_movement: null, training_type: "unknown_type", work_mode: null });
    expect(tags).toHaveLength(0);
  });

  it("work_mode=remote → cyan color", () => {
    const tags = buildConditionTags({ had_bowel_movement: null, training_type: null, work_mode: "remote" });
    expect(tags[0].colorClass).toContain("cyan");
  });
});

// ── toDateKey ────────────────────────────────────────────────────────────────

describe("toDateKey", () => {
  it("Date → YYYY-MM-DD 文字列に変換する", () => {
    expect(toDateKey(new Date(2026, 2, 10))).toBe("2026-03-10"); // 月は 0-indexed
  });

  it("1桁の月・日をゼロパディングする", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
