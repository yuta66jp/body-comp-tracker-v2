/**
 * calendarUtils テスト
 *
 * buildCalendarDayMap の差分計算・タグ処理・コンディション整形を検証する。
 */

import { buildCalendarDayMap, buildConditionTags, getMobileTrainingLabel, toDateKey, calcFastingHours } from "./calendarUtils";
import type { CalendarDayTagInfo } from "./calendarUtils";
import type { DailyLog } from "@/lib/supabase/types";

// ── テストデータ工場 ─────────────────────────────────────────────────────────

function makeLog(overrides: Omit<Partial<DailyLog>, "weight"> & { log_date: string; weight?: number | null }): DailyLog {
  return {
    id:                 "test-id",
    log_date:           overrides.log_date,
    weight:             (overrides.weight ?? null) as number,
    created_at:         null,
    calories:           overrides.calories           ?? null,
    protein:            overrides.protein            ?? null,
    fat:                overrides.fat                ?? null,
    carbs:              overrides.carbs              ?? null,
    note:               overrides.note               ?? null,
    is_cheat_day:       overrides.is_cheat_day       ?? false,
    is_refeed_day:      overrides.is_refeed_day      ?? false,
    is_eating_out:      overrides.is_eating_out      ?? false,
    is_travel_day:      overrides.is_travel_day      ?? false,
    sleep_hours:        overrides.sleep_hours        ?? null,
    had_bowel_movement: overrides.had_bowel_movement ?? null,
    training_type:      overrides.training_type      ?? null,
    work_mode:          overrides.work_mode          ?? null,
    leg_flag:           overrides.leg_flag           ?? null,
    last_meal_end_time: overrides.last_meal_end_time ?? null,
    weigh_in_time:      overrides.weigh_in_time      ?? null,
    step_count:         overrides.step_count         ?? null,
    bed_time:           overrides.bed_time           ?? null,
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
    expect(tags[0]!.colorClass).toContain("cyan");
  });
});

// ── buildCalendarDayMap — fasting_hours (前日参照仕様) ─────────────────────────

describe("buildCalendarDayMap — fasting_hours", () => {
  it("前日 last_meal_end_time と当日 weigh_in_time から算出する", () => {
    // 前日 22:30 → 当日 07:00 = 8.5h
    const logs = [
      makeLog({ log_date: "2026-03-09", weight: 70, last_meal_end_time: "22:30:00" }),
      makeLog({ log_date: "2026-03-10", weight: 70, weigh_in_time: "07:00:00" }),
    ];
    const map = buildCalendarDayMap(logs);
    expect(map.get("2026-03-10")!.fasting_hours).toBe(8.5);
  });

  it("前日ログがない場合は null", () => {
    // 2026-03-11 の前日 (2026-03-10) はログなし
    const logs = [
      makeLog({ log_date: "2026-03-09", weight: 70, last_meal_end_time: "22:30:00" }),
      makeLog({ log_date: "2026-03-11", weight: 70, weigh_in_time: "07:00:00" }),
    ];
    const map = buildCalendarDayMap(logs);
    // 2026-03-10 のログが存在しないので 2026-03-11 は null
    expect(map.get("2026-03-11")!.fasting_hours).toBeNull();
  });

  it("前日 last_meal_end_time がない場合は null", () => {
    const logs = [
      makeLog({ log_date: "2026-03-09", weight: 70, last_meal_end_time: null }),
      makeLog({ log_date: "2026-03-10", weight: 70, weigh_in_time: "07:00:00" }),
    ];
    const map = buildCalendarDayMap(logs);
    expect(map.get("2026-03-10")!.fasting_hours).toBeNull();
  });

  it("当日 weigh_in_time がない場合は null", () => {
    const logs = [
      makeLog({ log_date: "2026-03-09", weight: 70, last_meal_end_time: "22:30:00" }),
      makeLog({ log_date: "2026-03-10", weight: 70, weigh_in_time: null }),
    ];
    const map = buildCalendarDayMap(logs);
    expect(map.get("2026-03-10")!.fasting_hours).toBeNull();
  });

  it("当日の same-day last_meal_end_time は断食時間に使われない", () => {
    // 当日 D に last_meal_end_time があっても、前日がなければ null
    const logs = [
      makeLog({ log_date: "2026-03-10", weight: 70, last_meal_end_time: "22:30:00", weigh_in_time: "07:00:00" }),
    ];
    const map = buildCalendarDayMap(logs);
    // 前日ログがないので null（旧仕様では 8.5h だった）
    expect(map.get("2026-03-10")!.fasting_hours).toBeNull();
  });

  it("ログが1件のみ（前日参照不能）の場合は null", () => {
    const logs = [
      makeLog({ log_date: "2026-03-10", weight: 70, last_meal_end_time: "22:30:00", weigh_in_time: "07:00:00" }),
    ];
    const map = buildCalendarDayMap(logs);
    expect(map.get("2026-03-10")!.fasting_hours).toBeNull();
  });

  it("連続ログが複数ある場合、各日は正しく前日を参照する", () => {
    const logs = [
      makeLog({ log_date: "2026-03-08", weight: 70, last_meal_end_time: "21:00:00" }),
      makeLog({ log_date: "2026-03-09", weight: 70, last_meal_end_time: "22:30:00", weigh_in_time: "06:00:00" }),
      makeLog({ log_date: "2026-03-10", weight: 70, weigh_in_time: "07:00:00" }),
    ];
    const map = buildCalendarDayMap(logs);
    // 2026-03-09: 前日(08) 21:00 → 当日(09) 06:00 = 9h
    expect(map.get("2026-03-09")!.fasting_hours).toBe(9);
    // 2026-03-10: 前日(09) 22:30 → 当日(10) 07:00 = 8.5h
    expect(map.get("2026-03-10")!.fasting_hours).toBe(8.5);
    // 2026-03-08: 前日ログなし → null
    expect(map.get("2026-03-08")!.fasting_hours).toBeNull();
  });
});

// ── calcFastingHours ─────────────────────────────────────────────────────────

describe("calcFastingHours", () => {
  it("通常ケース: 22:30 → 07:00 は 8.5h", () => {
    expect(calcFastingHours("22:30", "07:00")).toBe(8.5);
  });

  it("日またぎなし: 08:00 → 12:30 は 4.5h", () => {
    expect(calcFastingHours("08:00", "12:30")).toBe(4.5);
  });

  it("秒付き形式 (PostgreSQL TIME の戻り値) も解釈できる", () => {
    expect(calcFastingHours("22:30:00", "07:00:00")).toBe(8.5);
  });

  it("整数時間: 20:00 → 06:00 は 10h", () => {
    expect(calcFastingHours("20:00", "06:00")).toBe(10);
  });

  it("片方 null → null を返す", () => {
    expect(calcFastingHours(null, "07:00")).toBeNull();
    expect(calcFastingHours("22:30", null)).toBeNull();
    expect(calcFastingHours(null, null)).toBeNull();
  });

  it("片方 undefined → null を返す", () => {
    expect(calcFastingHours(undefined, "07:00")).toBeNull();
    expect(calcFastingHours("22:30", undefined)).toBeNull();
  });

  it("同一時刻 (delta=0) → null を返す（0h断食は無意味）", () => {
    expect(calcFastingHours("07:00", "07:00")).toBeNull();
  });

  it("24h 以上になるケース → null を返す（異常値除外）", () => {
    // delta = 0 に折りたたまれるため null
    expect(calcFastingHours("07:00:01", "07:00:01")).toBeNull();
  });

  it("不正フォーマット → null を返す", () => {
    expect(calcFastingHours("invalid", "07:00")).toBeNull();
    expect(calcFastingHours("22:30", "not-a-time")).toBeNull();
  });

  // 境界値テスト
  it("delta=1439（23h59m）: null にならず 24.0h を返す（丸め結果）", () => {
    // lastMealEndTime=00:01, wakeUpTime=00:00 → delta=-1+1440=1439 < 1440 → 有効
    // Math.round(1439/60*10)/10 = Math.round(239.83)/10 = 240/10 = 24.0
    expect(calcFastingHours("00:01", "00:00")).toBe(24.0);
  });

  it("小数点切り捨て: 2分差(0.033h) → 0.0h に丸まる", () => {
    // weighMins=422(07:02) - lastMins=420(07:00) = 2 → Math.round(2/60*10)/10 = 0
    expect(calcFastingHours("07:00", "07:02")).toBe(0.0);
  });

  it("小数点切り上げ: 3分差(0.05h) → 0.1h に丸まる", () => {
    // weighMins=423(07:03) - lastMins=420(07:00) = 3 → Math.round(3/60*10)/10 = 0.1
    expect(calcFastingHours("07:00", "07:03")).toBe(0.1);
  });

  it("日またぎ + 小数丸め(切り捨て): 22:00→07:02 → 9.0h", () => {
    // delta=422-1320=-898+1440=542 → Math.round(542/60*10)/10 = Math.round(90.33)/10 = 9.0
    expect(calcFastingHours("22:00", "07:02")).toBe(9.0);
  });

  it("日またぎ + 小数丸め(切り上げ): 22:00→07:05 → 9.1h", () => {
    // delta=425-1320=-895+1440=545 → Math.round(545/60*10)/10 = Math.round(90.83)/10 = 9.1
    expect(calcFastingHours("22:00", "07:05")).toBe(9.1);
  });
});

// ── getMobileTrainingLabel ────────────────────────────────────────────────────

const NO_TAGS: CalendarDayTagInfo[] = [];
const WITH_TAGS: CalendarDayTagInfo[] = [{ key: "is_cheat_day", label: "チートデイ", colorClass: "bg-rose-100 text-rose-700" }];

describe("getMobileTrainingLabel", () => {
  it("特殊日なし + 有効 training_type → ラベルを返す", () => {
    const result = getMobileTrainingLabel(NO_TAGS, "chest");
    expect(result).not.toBeNull();
    expect(result!.label).toBe("胸");
    expect(result!.colorClass).toContain("indigo");
  });

  it("特殊日なし + glutes_hamstrings → ハム・ケツ を返す", () => {
    expect(getMobileTrainingLabel(NO_TAGS, "glutes_hamstrings")!.label).toBe("ハム・ケツ");
  });

  it("特殊日あり → null を返す（特殊日優先）", () => {
    expect(getMobileTrainingLabel(WITH_TAGS, "chest")).toBeNull();
  });

  it("特殊日あり + training_type null → null を返す", () => {
    expect(getMobileTrainingLabel(WITH_TAGS, null)).toBeNull();
  });

  it("training_type = off → オフ ラベルを返す（月全体のトレーニング配分確認のため表示する）", () => {
    const result = getMobileTrainingLabel(NO_TAGS, "off");
    expect(result).not.toBeNull();
    expect(result!.label).toBe("オフ");
  });

  it("training_type = null → null を返す", () => {
    expect(getMobileTrainingLabel(NO_TAGS, null)).toBeNull();
  });

  it("training_type = 無効値 → null を返す", () => {
    expect(getMobileTrainingLabel(NO_TAGS, "unknown_muscle")).toBeNull();
  });

  it("特殊日なし + training_type = quads → 四頭 を返す", () => {
    expect(getMobileTrainingLabel(NO_TAGS, "quads")!.label).toBe("四頭");
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
