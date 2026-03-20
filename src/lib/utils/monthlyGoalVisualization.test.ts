/**
 * monthlyGoalVisualization.test.ts
 *
 * buildMonthlyGoalDateMap / buildMonthlyGoalSummaryRows の unit tests。
 * buildMonthlyGoalPlan の real 実装を使うケースと、直接 plan オブジェクトを
 * 構築するケースを混在させて網羅する。
 */

import {
  buildMonthlyGoalDateMap,
  buildMonthlyGoalSummaryRows,
  classifyMonthlyPlanGap,
  buildMonthlyGoalComparisonRows,
  PLAN_GAP_THRESHOLD_KG,
} from "./monthlyGoalVisualization";
import type { MonthlyGoalSummaryRow } from "./monthlyGoalVisualization";
import type { MonthlyGoalPlan } from "./monthlyGoalPlan";
import { buildMonthlyGoalPlan } from "./monthlyGoalPlan";

// ─── テスト用ファクトリ ─────────────────────────────────────────────────────

/** MonthlyGoalPlan を直接構築するヘルパー (buildMonthlyGoalPlan を経由しない) */
function makePlan(entries: MonthlyGoalPlan["entries"]): MonthlyGoalPlan {
  return { isValid: true, entries, errors: [], warnings: [] };
}

function makeInvalidPlan(): MonthlyGoalPlan {
  return {
    isValid: false,
    entries: [],
    errors: [{ code: "DEADLINE_IN_PAST" }],
    warnings: [],
  };
}

/** 月次エントリーのショートハンド */
function entry(month: string, targetWeight: number, requiredDeltaKg = -1.0) {
  return {
    month,
    targetWeight,
    source: "auto_redistributed" as const,
    requiredDeltaKg,
    actualWeight: null,
  };
}

/** ログのショートハンド */
function log(log_date: string, weight: number | null) {
  return { log_date, weight };
}

// ─── buildMonthlyGoalDateMap ─────────────────────────────────────────────────

describe("buildMonthlyGoalDateMap", () => {
  it("entries が空なら空 Map を返す", () => {
    const result = buildMonthlyGoalDateMap([], ["2026-07-15", "2026-07-16"]);
    expect(result.size).toBe(0);
  });

  it("allDates が空なら空 Map を返す", () => {
    const result = buildMonthlyGoalDateMap([entry("2026-07", 73.8)], []);
    expect(result.size).toBe(0);
  });

  it("単月: その月内の日付が全て同じ target にマップされる", () => {
    const entries = [entry("2026-07", 73.8)];
    const allDates = ["2026-07-01", "2026-07-15", "2026-07-31"];
    const result = buildMonthlyGoalDateMap(entries, allDates);
    expect(result.get("2026-07-01")).toBe(73.8);
    expect(result.get("2026-07-15")).toBe(73.8);
    expect(result.get("2026-07-31")).toBe(73.8);
    expect(result.size).toBe(3);
  });

  it("plan にない月の日付はマップに含まれない", () => {
    const entries = [entry("2026-07", 73.8)];
    const allDates = ["2026-06-30", "2026-07-01", "2026-08-01"];
    const result = buildMonthlyGoalDateMap(entries, allDates);
    expect(result.has("2026-06-30")).toBe(false);
    expect(result.has("2026-08-01")).toBe(false);
    expect(result.has("2026-07-01")).toBe(true);
  });

  it("複数月: 月境界で値が切り替わる (step 表現)", () => {
    const entries = [
      entry("2026-07", 73.8),
      entry("2026-08", 72.5),
    ];
    const allDates = ["2026-07-31", "2026-08-01"];
    const result = buildMonthlyGoalDateMap(entries, allDates);
    expect(result.get("2026-07-31")).toBe(73.8);
    expect(result.get("2026-08-01")).toBe(72.5);
  });

  it("buildMonthlyGoalPlan 結果と組み合わせて動作する (3ヶ月プラン)", () => {
    const plan = buildMonthlyGoalPlan({
      currentWeight: 75.0,
      today: "2026-07-15",
      finalGoalWeight: 72.0,
      goalDeadlineDate: "2026-09-30",
      monthlyActuals: [],
      overrides: [],
    });
    expect(plan.isValid).toBe(true);
    // Jul, Aug, Sep の 3 エントリー
    const julDates = ["2026-07-15", "2026-07-31"];
    const map = buildMonthlyGoalDateMap(plan.entries, julDates);
    // Jul の target は Aug・Sep へ向かう線形補間の結果
    expect(map.size).toBe(2);
    // 全て同じ値 (July 内なのでフラット)
    expect(map.get("2026-07-15")).toBe(map.get("2026-07-31"));
  });
});

// ─── buildMonthlyGoalSummaryRows — unavailable / empty ───────────────────────

describe("buildMonthlyGoalSummaryRows — unavailable / empty", () => {
  it("plan.isValid = false → 空配列", () => {
    const result = buildMonthlyGoalSummaryRows(makeInvalidPlan(), [], "2026-07-15");
    expect(result).toHaveLength(0);
  });

  it("plan.entries が空 → 空配列", () => {
    const plan: MonthlyGoalPlan = { isValid: true, entries: [], errors: [], warnings: [] };
    const result = buildMonthlyGoalSummaryRows(plan, [], "2026-07-15");
    expect(result).toHaveLength(0);
  });

  it("logs が空でも plan が valid なら rows を返す", () => {
    const plan = makePlan([entry("2026-07", 73.8), entry("2026-08", 72.5)]);
    const result = buildMonthlyGoalSummaryRows(plan, [], "2026-07-15");
    expect(result).toHaveLength(2);
  });
});

// ─── buildMonthlyGoalSummaryRows — 基本フィールド ────────────────────────────

describe("buildMonthlyGoalSummaryRows — 基本フィールド", () => {
  const plan = makePlan([
    entry("2026-07", 73.8, -1.2),
    entry("2026-08", 72.5, -1.3),
    entry("2026-09", 71.5, -1.0),
  ]);
  const today = "2026-07-15"; // 当月 = 2026-07

  it("行数は plan.entries と一致する", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows).toHaveLength(3);
  });

  it("各行の month が plan entry と一致する", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[0]!.month).toBe("2026-07");
    expect(rows[1]!.month).toBe("2026-08");
    expect(rows[2]!.month).toBe("2026-09");
  });

  it("monthEndTarget が plan entry の targetWeight と一致する", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[0]!.monthEndTarget).toBeCloseTo(73.8);
    expect(rows[1]!.monthEndTarget).toBeCloseTo(72.5);
    expect(rows[2]!.monthEndTarget).toBeCloseTo(71.5);
  });

  it("当月 (2026-07) は isCurrentMonth=true, isFutureMonth=false", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[0]!.isCurrentMonth).toBe(true);
    expect(rows[0]!.isFutureMonth).toBe(false);
  });

  it("翌月 (2026-08) は isFutureMonth=true", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[1]!.isFutureMonth).toBe(true);
    expect(rows[1]!.isCurrentMonth).toBe(false);
  });
});

// ─── buildMonthlyGoalSummaryRows — isPartialActual ───────────────────────────

describe("buildMonthlyGoalSummaryRows — isPartialActual (当月)", () => {
  const plan = makePlan([entry("2026-07", 73.8)]);
  const today = "2026-07-15";

  it("当月: isPartialActual = true", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[0]!.isPartialActual).toBe(true);
  });

  it("当月: logs あれば actualMonthEndWeight に直近値が入る", () => {
    const logs = [
      log("2026-07-01", 74.5),
      log("2026-07-10", 74.2),
      log("2026-07-15", 74.0),
    ];
    const rows = buildMonthlyGoalSummaryRows(plan, logs, today);
    expect(rows[0]!.actualMonthEndWeight).toBeCloseTo(74.0);
  });

  it("当月: logs なければ actualMonthEndWeight = null", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[0]!.actualMonthEndWeight).toBeNull();
  });

  it("当月: diffKg は常に null (isPartialActual のため)", () => {
    const logs = [log("2026-07-15", 75.0)];
    const rows = buildMonthlyGoalSummaryRows(plan, logs, today);
    expect(rows[0]!.diffKg).toBeNull();
  });
});

// ─── buildMonthlyGoalSummaryRows — 未来月 ────────────────────────────────────

describe("buildMonthlyGoalSummaryRows — 未来月", () => {
  const plan = makePlan([entry("2026-08", 72.5)]);
  const today = "2026-07-15";

  it("未来月: isFutureMonth=true, isPartialActual=false", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[0]!.isFutureMonth).toBe(true);
    expect(rows[0]!.isPartialActual).toBe(false);
  });

  it("未来月: logs があっても actualMonthEndWeight = null", () => {
    // 未来月のログは通常存在しないが、仮に存在しても無視される
    const rows = buildMonthlyGoalSummaryRows(
      plan,
      [log("2026-08-01", 73.0)],
      today
    );
    expect(rows[0]!.actualMonthEndWeight).toBeNull();
  });

  it("未来月: diffKg = null", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[0]!.diffKg).toBeNull();
  });
});

// ─── buildMonthlyGoalSummaryRows — 過去月 ────────────────────────────────────

describe("buildMonthlyGoalSummaryRows — 過去月", () => {
  // today = 2026-08-10 → 2026-07 は過去月
  const plan = makePlan([entry("2026-07", 73.8), entry("2026-08", 72.5)]);
  const today = "2026-08-10";

  it("過去月: isFutureMonth=false, isCurrentMonth=false, isPartialActual=false", () => {
    const logs = [log("2026-07-31", 74.0)];
    const rows = buildMonthlyGoalSummaryRows(plan, logs, today);
    expect(rows[0]!.isFutureMonth).toBe(false);
    expect(rows[0]!.isCurrentMonth).toBe(false);
    expect(rows[0]!.isPartialActual).toBe(false);
  });

  it("過去月: actualMonthEndWeight は月の最終 log の weight", () => {
    const logs = [
      log("2026-07-01", 75.0),
      log("2026-07-15", 74.5),
      log("2026-07-31", 74.0),
    ];
    const rows = buildMonthlyGoalSummaryRows(plan, logs, today);
    expect(rows[0]!.actualMonthEndWeight).toBeCloseTo(74.0);
  });

  it("過去月: diffKg = actualMonthEndWeight - monthEndTarget (0.01 丸め)", () => {
    // 74.0 - 73.8 = 0.2
    const logs = [log("2026-07-31", 74.0)];
    const rows = buildMonthlyGoalSummaryRows(plan, logs, today);
    expect(rows[0]!.diffKg).toBeCloseTo(0.2, 2);
  });

  it("過去月: logs なければ actualMonthEndWeight = null, diffKg = null", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[0]!.actualMonthEndWeight).toBeNull();
    expect(rows[0]!.diffKg).toBeNull();
  });

  it("過去月: diff が負なら先行 (Cut の場合良い方向)", () => {
    // 73.0 - 73.8 = -0.8 (目標より軽い = Cut で先行)
    const logs = [log("2026-07-31", 73.0)];
    const rows = buildMonthlyGoalSummaryRows(plan, logs, today);
    expect(rows[0]!.diffKg).toBeCloseTo(-0.8, 2);
  });
});

// ─── buildMonthlyGoalSummaryRows — 月初体重 ─────────────────────────────────

describe("buildMonthlyGoalSummaryRows — 月初体重の定義", () => {
  const plan = makePlan([entry("2026-07", 73.8)]);
  const today = "2026-07-15";

  it("前月末実績がある場合: 前月最終 log の weight を優先", () => {
    const logs = [
      log("2026-06-28", 76.0),
      log("2026-06-30", 75.5), // 前月末実績
      log("2026-07-01", 75.2), // 当月最初
    ];
    const rows = buildMonthlyGoalSummaryRows(plan, logs, today);
    expect(rows[0]!.monthStartWeight).toBeCloseTo(75.5);
  });

  it("前月実績なし: 当月最初の log の weight を使う", () => {
    const logs = [
      log("2026-07-01", 75.2),
      log("2026-07-10", 74.8),
    ];
    const rows = buildMonthlyGoalSummaryRows(plan, logs, today);
    expect(rows[0]!.monthStartWeight).toBeCloseTo(75.2);
  });

  it("前月・当月ともに logs なし: monthStartWeight = null", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[0]!.monthStartWeight).toBeNull();
  });

  it("前月の weight=null な log は無視して当月最初を使う", () => {
    const logs = [
      log("2026-06-30", null), // 前月だが weight=null
      log("2026-07-05", 75.0), // 当月最初の実測値
    ];
    const rows = buildMonthlyGoalSummaryRows(plan, logs, today);
    expect(rows[0]!.monthStartWeight).toBeCloseTo(75.0);
  });
});

// ─── buildMonthlyGoalSummaryRows — nextRequiredDeltaKg ───────────────────────

describe("buildMonthlyGoalSummaryRows — nextRequiredDeltaKg", () => {
  const plan = makePlan([
    entry("2026-07", 73.8, -1.2),
    entry("2026-08", 72.5, -1.3),
    entry("2026-09", 71.5, -1.0),
  ]);
  const today = "2026-07-15";

  it("最初の行: nextRequiredDeltaKg は 2 番目エントリーの requiredDeltaKg", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[0]!.nextRequiredDeltaKg).toBeCloseTo(-1.3);
  });

  it("中間の行: nextRequiredDeltaKg は 3 番目エントリーの requiredDeltaKg", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[1]!.nextRequiredDeltaKg).toBeCloseTo(-1.0);
  });

  it("最後の行: nextRequiredDeltaKg = null", () => {
    const rows = buildMonthlyGoalSummaryRows(plan, [], today);
    expect(rows[2]!.nextRequiredDeltaKg).toBeNull();
  });
});

// ─── buildMonthlyGoalSummaryRows — Cut/Bulk の符号 ──────────────────────────

describe("buildMonthlyGoalSummaryRows — Cut/Bulk の diff 符号", () => {
  // Bulk プラン: targetWeight が増加方向
  const bulkPlan = makePlan([entry("2026-07", 76.5, +1.5)]);
  const today = "2026-08-01"; // 2026-07 は過去月

  it("Bulk 過去月: 実績 > 目標なら diffKg が正 (先行)", () => {
    const logs = [log("2026-07-31", 77.0)]; // 77.0 - 76.5 = 0.5
    const rows = buildMonthlyGoalSummaryRows(bulkPlan, logs, today);
    expect(rows[0]!.diffKg).toBeCloseTo(0.5, 2);
  });

  it("Bulk 過去月: 実績 < 目標なら diffKg が負 (遅れ)", () => {
    const logs = [log("2026-07-31", 76.0)]; // 76.0 - 76.5 = -0.5
    const rows = buildMonthlyGoalSummaryRows(bulkPlan, logs, today);
    expect(rows[0]!.diffKg).toBeCloseTo(-0.5, 2);
  });
});

// ─── buildMonthlyGoalSummaryRows — buildMonthlyGoalPlan との統合 ────────────

describe("buildMonthlyGoalSummaryRows — buildMonthlyGoalPlan との統合", () => {
  it("buildMonthlyGoalPlan の isValid=true プランで rows が返る", () => {
    const plan = buildMonthlyGoalPlan({
      currentWeight: 75.0,
      today: "2026-07-15",
      finalGoalWeight: 72.0,
      goalDeadlineDate: "2026-09-30",
      monthlyActuals: [],
      overrides: [],
    });
    expect(plan.isValid).toBe(true);
    const rows = buildMonthlyGoalSummaryRows(plan, [], "2026-07-15");
    // Jul, Aug, Sep の 3 ヶ月
    expect(rows).toHaveLength(3);
    expect(rows[0]!.month).toBe("2026-07");
    expect(rows[0]!.isCurrentMonth).toBe(true);
    expect(rows[2]!.month).toBe("2026-09");
    expect(rows[2]!.nextRequiredDeltaKg).toBeNull(); // 最終月
  });

  it("buildMonthlyGoalPlan の isValid=false (過去期限) → 空配列", () => {
    const plan = buildMonthlyGoalPlan({
      currentWeight: 75.0,
      today: "2026-07-15",
      finalGoalWeight: 72.0,
      goalDeadlineDate: "2025-01-01", // 過去
      monthlyActuals: [],
      overrides: [],
    });
    expect(plan.isValid).toBe(false);
    const rows = buildMonthlyGoalSummaryRows(plan, [], "2026-07-15");
    expect(rows).toHaveLength(0);
  });
});

// ─── classifyMonthlyPlanGap ──────────────────────────────────────────────────

describe("classifyMonthlyPlanGap", () => {
  it("PLAN_GAP_THRESHOLD_KG が 0.2 kg", () => {
    expect(PLAN_GAP_THRESHOLD_KG).toBe(0.2);
  });

  describe("pending ケース", () => {
    it("diffKg = null → pending", () => {
      expect(classifyMonthlyPlanGap(null, true, false, false)).toBe("pending");
    });
    it("isPartialActual = true → pending", () => {
      expect(classifyMonthlyPlanGap(0.5, true, true, false)).toBe("pending");
    });
    it("isFutureMonth = true → pending", () => {
      expect(classifyMonthlyPlanGap(0.5, true, false, true)).toBe("pending");
    });
  });

  describe("on_track ケース (|diffKg| <= threshold)", () => {
    it("diffKg = 0.0 → on_track", () => {
      expect(classifyMonthlyPlanGap(0.0, true, false, false)).toBe("on_track");
    });
    it("diffKg = 0.2 → on_track (境界値)", () => {
      expect(classifyMonthlyPlanGap(0.2, true, false, false)).toBe("on_track");
    });
    it("diffKg = -0.2 → on_track (境界値)", () => {
      expect(classifyMonthlyPlanGap(-0.2, true, false, false)).toBe("on_track");
    });
  });

  describe("Cut フェーズ", () => {
    it("diffKg = -0.5 → ahead (目標より軽い)", () => {
      expect(classifyMonthlyPlanGap(-0.5, true, false, false)).toBe("ahead");
    });
    it("diffKg = 0.5 → behind (目標より重い)", () => {
      expect(classifyMonthlyPlanGap(0.5, true, false, false)).toBe("behind");
    });
    it("diffKg = 0.21 → behind (閾値超え)", () => {
      expect(classifyMonthlyPlanGap(0.21, true, false, false)).toBe("behind");
    });
  });

  describe("Bulk フェーズ", () => {
    it("diffKg = 0.5 → ahead (目標より重い)", () => {
      expect(classifyMonthlyPlanGap(0.5, false, false, false)).toBe("ahead");
    });
    it("diffKg = -0.5 → behind (目標より軽い)", () => {
      expect(classifyMonthlyPlanGap(-0.5, false, false, false)).toBe("behind");
    });
  });
});

// ─── buildMonthlyGoalComparisonRows ─────────────────────────────────────────

describe("buildMonthlyGoalComparisonRows — 基本動作", () => {
  it("空配列を渡すと空配列を返す", () => {
    expect(buildMonthlyGoalComparisonRows([], "Cut")).toHaveLength(0);
  });

  it("元の MonthlyGoalSummaryRow フィールドが保持される", () => {
    const plan = makePlan([entry("2026-07", 73.8), entry("2026-08", 72.5)]);
    const summaryRows = buildMonthlyGoalSummaryRows(plan, [], "2026-07-15");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.month).toBe("2026-07");
    expect(rows[0]!.monthEndTarget).toBeCloseTo(73.8);
    expect(rows[1]!.month).toBe("2026-08");
  });

  it("progressState フィールドが追加される", () => {
    const plan = makePlan([entry("2026-07", 73.8)]);
    const summaryRows = buildMonthlyGoalSummaryRows(plan, [], "2026-07-15");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]).toHaveProperty("progressState");
  });

  it("cumulativeGapKg フィールドが追加される", () => {
    const plan = makePlan([entry("2026-07", 73.8)]);
    const summaryRows = buildMonthlyGoalSummaryRows(plan, [], "2026-07-15");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]).toHaveProperty("cumulativeGapKg");
  });
});

describe("buildMonthlyGoalComparisonRows — progressState", () => {
  it("当月 (partial) → progressState = pending", () => {
    const plan = makePlan([entry("2026-07", 73.8)]);
    const logs = [log("2026-07-15", 74.0)];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-07-15");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.progressState).toBe("pending");
  });

  it("未来月 → progressState = pending", () => {
    const plan = makePlan([entry("2026-07", 73.8), entry("2026-08", 72.5)]);
    const summaryRows = buildMonthlyGoalSummaryRows(plan, [], "2026-07-15");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[1]!.progressState).toBe("pending"); // 2026-08 は未来月
  });

  it("Cut 過去月: 実績 < 目標 → ahead", () => {
    // today = 2026-08-01 → 2026-07 は過去月
    // diff = 73.0 - 73.8 = -0.8 (目標より軽い = Cut で先行)
    const plan = makePlan([entry("2026-07", 73.8), entry("2026-08", 72.5)]);
    const logs = [log("2026-07-31", 73.0)];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-08-01");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.progressState).toBe("ahead");
  });

  it("Cut 過去月: 実績 > 目標 → behind", () => {
    // diff = 74.5 - 73.8 = 0.7 (目標より重い = Cut で遅れ)
    const plan = makePlan([entry("2026-07", 73.8), entry("2026-08", 72.5)]);
    const logs = [log("2026-07-31", 74.5)];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-08-01");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.progressState).toBe("behind");
  });

  it("Cut 過去月: |diff| <= 0.2 → on_track", () => {
    // diff = 73.9 - 73.8 = 0.1 (閾値内)
    const plan = makePlan([entry("2026-07", 73.8), entry("2026-08", 72.5)]);
    const logs = [log("2026-07-31", 73.9)];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-08-01");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.progressState).toBe("on_track");
  });

  it("Bulk 過去月: 実績 > 目標 → ahead", () => {
    // diff = 77.0 - 76.5 = 0.5 (目標より重い = Bulk で先行)
    const plan = makePlan([entry("2026-07", 76.5, +1.5)]);
    const logs = [log("2026-07-31", 77.0)];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-08-01");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Bulk");
    expect(rows[0]!.progressState).toBe("ahead");
  });

  it("Bulk 過去月: 実績 < 目標 → behind", () => {
    // diff = 75.8 - 76.5 = -0.7 (目標より軽い = Bulk で遅れ)
    const plan = makePlan([entry("2026-07", 76.5, +1.5)]);
    const logs = [log("2026-07-31", 75.8)];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-08-01");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Bulk");
    expect(rows[0]!.progressState).toBe("behind");
  });
});

describe("buildMonthlyGoalComparisonRows — cumulativeGapKg", () => {
  it("当月 (partial) → cumulativeGapKg = null", () => {
    const plan = makePlan([entry("2026-07", 73.8)]);
    const logs = [log("2026-07-15", 74.0)];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-07-15");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.cumulativeGapKg).toBeNull();
  });

  it("未来月 → cumulativeGapKg = null", () => {
    const plan = makePlan([entry("2026-07", 73.8), entry("2026-08", 72.5)]);
    const summaryRows = buildMonthlyGoalSummaryRows(plan, [], "2026-07-15");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[1]!.cumulativeGapKg).toBeNull();
  });

  it("過去月: データなし → cumulativeGapKg = null", () => {
    const plan = makePlan([entry("2026-07", 73.8), entry("2026-08", 72.5)]);
    const summaryRows = buildMonthlyGoalSummaryRows(plan, [], "2026-08-10");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.cumulativeGapKg).toBeNull();
  });

  it("過去月 1 ヶ月: diffKg = 0.2 → cumulativeGapKg = 0.2", () => {
    // 74.0 - 73.8 = 0.2
    const plan = makePlan([entry("2026-07", 73.8), entry("2026-08", 72.5)]);
    const logs = [log("2026-07-31", 74.0)];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-08-10");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.cumulativeGapKg).toBeCloseTo(0.2, 2);
  });

  it("過去月 2 ヶ月: 累積が正しく積算される", () => {
    // today = 2026-09-01 → 2026-07, 2026-08 が過去月
    const plan = makePlan([
      entry("2026-07", 73.8, -1.2),
      entry("2026-08", 72.5, -1.3),
      entry("2026-09", 71.5, -1.0),
    ]);
    const logs = [
      log("2026-07-31", 74.0), // diff = 74.0 - 73.8 = +0.2
      log("2026-08-31", 73.0), // diff = 73.0 - 72.5 = +0.5
    ];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-09-01");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.cumulativeGapKg).toBeCloseTo(0.2, 2);  // month1 のみ
    expect(rows[1]!.cumulativeGapKg).toBeCloseTo(0.7, 2);  // 0.2 + 0.5
    expect(rows[2]!.cumulativeGapKg).toBeNull();            // 当月は null
  });

  it("データなし月を挟んでも後続月は累積を継続する", () => {
    // today = 2026-09-01 → 2026-07 はデータなし、2026-08 はデータあり
    const plan = makePlan([
      entry("2026-07", 73.8, -1.2),
      entry("2026-08", 72.5, -1.3),
      entry("2026-09", 71.5, -1.0),
    ]);
    const logs = [
      // 2026-07 のログはなし
      log("2026-08-31", 73.0), // diff = 73.0 - 72.5 = +0.5
    ];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-09-01");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.cumulativeGapKg).toBeNull();           // データなし
    expect(rows[1]!.cumulativeGapKg).toBeCloseTo(0.5, 2); // 0.5 (07 は null なので加算対象外)
    expect(rows[2]!.cumulativeGapKg).toBeNull();           // 当月
  });

  it("負の diffKg (先行) は累積から引かれる", () => {
    // today = 2026-09-01
    const plan = makePlan([
      entry("2026-07", 73.8, -1.2),
      entry("2026-08", 72.5, -1.3),
      entry("2026-09", 71.5, -1.0),
    ]);
    const logs = [
      log("2026-07-31", 74.0), // diff = +0.2 (遅れ)
      log("2026-08-31", 72.0), // diff = 72.0 - 72.5 = -0.5 (先行)
    ];
    const summaryRows = buildMonthlyGoalSummaryRows(plan, logs, "2026-09-01");
    const rows = buildMonthlyGoalComparisonRows(summaryRows, "Cut");
    expect(rows[0]!.cumulativeGapKg).toBeCloseTo(0.2, 2);   // +0.2
    expect(rows[1]!.cumulativeGapKg).toBeCloseTo(-0.3, 2);  // 0.2 + (-0.5) = -0.3
  });
});
