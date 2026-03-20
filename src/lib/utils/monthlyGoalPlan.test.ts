import {
  buildMonthlyGoalPlan,
  redistributeMonthlyGoals,
  validateMonthlyGoalPlan,
  getMonthlyGoalWarnings,
  MAX_SAFE_MONTHLY_DELTA_KG,
  type MonthlyGoalEntry,
  type MonthlyGoalPlanInput,
} from "./monthlyGoalPlan";

// ─── テスト用ヘルパー ───────────────────────────────────────────────────────

/** 最小限の有効な MonthlyGoalPlanInput を返すベースファクトリ */
function makeInput(
  overrides?: Partial<MonthlyGoalPlanInput>
): MonthlyGoalPlanInput {
  return {
    currentWeight: 78.0,
    today: "2026-03-15",
    finalGoalWeight: 72.0,
    goalDeadlineDate: "2026-06-30",
    monthlyActuals: [],
    overrides: [],
    ...overrides,
  };
}

/** MonthlyGoalEntry のスナップショット (テスト比較用に必要なフィールドのみ) */
function entrySnapshot(e: MonthlyGoalEntry) {
  return { month: e.month, targetWeight: e.targetWeight, source: e.source };
}

// ─── buildMonthlyGoalPlan ────────────────────────────────────────────────────

describe("buildMonthlyGoalPlan", () => {
  describe("正常系: override なし (均等配分)", () => {
    test("4 ヶ月計画で均等に配分される", () => {
      // 78.0 → 72.0 を 4 ヶ月 (Mar〜Jun) で均等配分
      // 各月: 76.5 / 75.0 / 73.5 / 72.0
      const plan = buildMonthlyGoalPlan(makeInput());
      expect(plan.isValid).toBe(true);
      expect(plan.errors).toHaveLength(0);
      expect(plan.entries.map(entrySnapshot)).toEqual([
        { month: "2026-03", targetWeight: 76.5, source: "auto_redistributed" },
        { month: "2026-04", targetWeight: 75.0, source: "auto_redistributed" },
        { month: "2026-05", targetWeight: 73.5, source: "auto_redistributed" },
        { month: "2026-06", targetWeight: 72.0, source: "auto_redistributed" },
      ]);
    });

    test("requiredDeltaKg が正しく計算される", () => {
      const plan = buildMonthlyGoalPlan(makeInput());
      const deltas = plan.entries.map((e) => e.requiredDeltaKg);
      // 78.0→76.5=-1.5, 76.5→75.0=-1.5, 75.0→73.5=-1.5, 73.5→72.0=-1.5
      expect(deltas).toEqual([-1.5, -1.5, -1.5, -1.5]);
    });

    test("actualWeight が monthlyActuals から正しく入る", () => {
      const plan = buildMonthlyGoalPlan(
        makeInput({
          monthlyActuals: [{ month: "2026-03", endWeight: 77.2 }],
        })
      );
      expect(plan.entries[0]!.actualWeight).toBe(77.2);
      expect(plan.entries[1]!.actualWeight).toBeNull();
    });

    test("最終月の targetWeight は必ず finalGoalWeight になる", () => {
      const plan = buildMonthlyGoalPlan(makeInput());
      const last = plan.entries.at(-1)!;
      expect(last.targetWeight).toBe(72.0);
    });
  });

  describe("正常系: override あり", () => {
    test("override 月が manual, 前後が auto_redistributed になる", () => {
      // override: May=74.0
      // アンカー: (-1=78.0), (2=74.0), (3=72.0)
      // Mar: 78+(1/3*(74-78))=76.7, Apr: 78+(2/3*(74-78))=75.3, May: 74 (manual), Jun: 72
      const plan = buildMonthlyGoalPlan(
        makeInput({ overrides: [{ month: "2026-05", targetWeight: 74.0 }] })
      );
      expect(plan.isValid).toBe(true);
      const snap = plan.entries.map(entrySnapshot);
      expect(snap[0]).toEqual({
        month: "2026-03",
        targetWeight: 76.7,
        source: "auto_redistributed",
      });
      expect(snap[1]).toEqual({
        month: "2026-04",
        targetWeight: 75.3,
        source: "auto_redistributed",
      });
      expect(snap[2]).toEqual({
        month: "2026-05",
        targetWeight: 74.0,
        source: "manual",
      });
      expect(snap[3]).toEqual({
        month: "2026-06",
        targetWeight: 72.0,
        source: "auto_redistributed",
      });
    });

    test("最終月への override は無視して finalGoalWeight が使われる", () => {
      // Jun (最終月) に override を指定しても finalGoalWeight=72.0 が優先される
      const plan = buildMonthlyGoalPlan(
        makeInput({ overrides: [{ month: "2026-06", targetWeight: 73.0 }] })
      );
      expect(plan.isValid).toBe(true);
      const last = plan.entries.at(-1)!;
      expect(last.targetWeight).toBe(72.0);
      expect(last.source).toBe("auto_redistributed");
    });

    test("複数 override がある場合にそれぞれの区間で均等配分される", () => {
      // override: Apr=76.0, May=74.0
      // アンカー: (-1=78), (1=76), (2=74), (3=72)
      // Mar: 78+(1/2*(76-78))=77.0
      // Apr: 76.0 (manual)
      // May: 74.0 (manual)
      // Jun: 72.0 (auto)
      const plan = buildMonthlyGoalPlan(
        makeInput({
          overrides: [
            { month: "2026-04", targetWeight: 76.0 },
            { month: "2026-05", targetWeight: 74.0 },
          ],
        })
      );
      expect(plan.isValid).toBe(true);
      expect(plan.entries[0]!.targetWeight).toBe(77.0);
      expect(plan.entries[1]!.targetWeight).toBe(76.0);
      expect(plan.entries[2]!.targetWeight).toBe(74.0);
      expect(plan.entries[3]!.targetWeight).toBe(72.0);
    });
  });

  describe("正常系: 期間が 1 ヶ月 (today と deadline が同月)", () => {
    test("エントリーが 1 件で targetWeight = finalGoalWeight", () => {
      const plan = buildMonthlyGoalPlan(
        makeInput({ today: "2026-06-01", goalDeadlineDate: "2026-06-30" })
      );
      expect(plan.isValid).toBe(true);
      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0]!.targetWeight).toBe(72.0);
      expect(plan.entries[0]!.month).toBe("2026-06");
    });

    test("1 ヶ月計画では DEADLINE_TOO_CLOSE 警告が出る", () => {
      const plan = buildMonthlyGoalPlan(
        makeInput({ today: "2026-06-01", goalDeadlineDate: "2026-06-30" })
      );
      expect(plan.warnings.some((w) => w.code === "DEADLINE_TOO_CLOSE")).toBe(
        true
      );
    });
  });

  describe("正常系: 増量 (Bulk) 方向", () => {
    test("currentWeight < finalGoalWeight の場合に正の delta で計画が組まれる", () => {
      const plan = buildMonthlyGoalPlan(
        makeInput({ currentWeight: 65.0, finalGoalWeight: 68.0 })
      );
      expect(plan.isValid).toBe(true);
      plan.entries.forEach((e) => {
        if (e.month !== plan.entries.at(-1)!.month) {
          // 最終月以外は delta >= 0 (厳密には正の方向)
          expect(e.requiredDeltaKg).toBeGreaterThanOrEqual(0);
        }
      });
      expect(plan.entries.at(-1)!.targetWeight).toBe(68.0);
    });
  });

  describe("正常系: 既に目標達成済み", () => {
    test("currentWeight が finalGoalWeight 以下 (Cut) でも計画は構築される", () => {
      const plan = buildMonthlyGoalPlan(
        makeInput({ currentWeight: 71.8, finalGoalWeight: 72.0 })
      );
      expect(plan.isValid).toBe(true);
      expect(plan.warnings.some((w) => w.code === "ALREADY_AT_GOAL")).toBe(
        true
      );
    });

    test("currentWeight === finalGoalWeight でも計画は構築される", () => {
      const plan = buildMonthlyGoalPlan(
        makeInput({ currentWeight: 72.0, finalGoalWeight: 72.0 })
      );
      expect(plan.isValid).toBe(true);
      expect(plan.warnings.some((w) => w.code === "ALREADY_AT_GOAL")).toBe(
        true
      );
    });
  });

  describe("異常系: 不正入力 → errors が返る", () => {
    test("goalDeadlineDate が不正な形式 → INVALID_DEADLINE", () => {
      const plan = buildMonthlyGoalPlan(
        makeInput({ goalDeadlineDate: "invalid-date" })
      );
      expect(plan.isValid).toBe(false);
      expect(plan.errors[0]!.code).toBe("INVALID_DEADLINE");
    });

    test("goalDeadlineDate が期限月 < currentMonth → DEADLINE_IN_PAST", () => {
      const plan = buildMonthlyGoalPlan(
        makeInput({
          today: "2026-06-15",
          goalDeadlineDate: "2026-05-31",
        })
      );
      expect(plan.isValid).toBe(false);
      expect(plan.errors[0]!.code).toBe("DEADLINE_IN_PAST");
    });

    test("currentWeight が 0 → INVALID_CURRENT_WEIGHT", () => {
      const plan = buildMonthlyGoalPlan(makeInput({ currentWeight: 0 }));
      expect(plan.isValid).toBe(false);
      expect(plan.errors.some((e) => e.code === "INVALID_CURRENT_WEIGHT")).toBe(
        true
      );
    });

    test("finalGoalWeight が負値 → INVALID_GOAL_WEIGHT", () => {
      const plan = buildMonthlyGoalPlan(makeInput({ finalGoalWeight: -5 }));
      expect(plan.isValid).toBe(false);
      expect(plan.errors.some((e) => e.code === "INVALID_GOAL_WEIGHT")).toBe(
        true
      );
    });

    test("override が計画期間外の月を指している → OVERRIDE_MONTH_OUT_OF_RANGE", () => {
      const plan = buildMonthlyGoalPlan(
        makeInput({
          overrides: [{ month: "2025-12", targetWeight: 75.0 }],
        })
      );
      expect(plan.isValid).toBe(false);
      expect(plan.errors[0]!.code).toBe("OVERRIDE_MONTH_OUT_OF_RANGE");
    });

    test("errors がある場合 entries は空配列", () => {
      const plan = buildMonthlyGoalPlan(
        makeInput({ goalDeadlineDate: "bad-date" })
      );
      expect(plan.entries).toHaveLength(0);
    });
  });
});

// ─── redistributeMonthlyGoals ────────────────────────────────────────────────

describe("redistributeMonthlyGoals", () => {
  /** 4ヶ月の均等配分済みエントリー (Mar→Jun, 78→72) を起点に使う */
  const baseEntries: MonthlyGoalEntry[] = [
    {
      month: "2026-03",
      targetWeight: 76.5,
      source: "auto_redistributed",
      requiredDeltaKg: -1.5,
      actualWeight: null,
    },
    {
      month: "2026-04",
      targetWeight: 75.0,
      source: "auto_redistributed",
      requiredDeltaKg: -1.5,
      actualWeight: null,
    },
    {
      month: "2026-05",
      targetWeight: 73.5,
      source: "auto_redistributed",
      requiredDeltaKg: -1.5,
      actualWeight: null,
    },
    {
      month: "2026-06",
      targetWeight: 72.0,
      source: "auto_redistributed",
      requiredDeltaKg: -1.5,
      actualWeight: null,
    },
  ];

  test("先頭月を編集 → 翌月以降が再配分される", () => {
    // Mar を 77.0 に編集 → Apr/May/Jun で 77→72 を再配分
    // Apr: 77+(1/3*-5)=75.3, May: 77+(2/3*-5)=73.7, Jun: 72.0
    const result = redistributeMonthlyGoals(
      baseEntries,
      "2026-03",
      77.0,
      72.0
    );
    expect(result[0]!.targetWeight).toBe(77.0);
    expect(result[0]!.source).toBe("manual");
    expect(result[1]!.targetWeight).toBe(75.3);
    expect(result[2]!.targetWeight).toBe(73.7);
    expect(result[3]!.targetWeight).toBe(72.0);
    expect(result[3]!.source).toBe("auto_redistributed");
  });

  test("中間月を編集 → それ以前は変わらず、以降が再配分される", () => {
    // Apr を 76.0 に編集 → Mar は変わらず (76.5)
    // May/Jun で 76→72 を再配分: May=74.0, Jun=72.0
    const result = redistributeMonthlyGoals(
      baseEntries,
      "2026-04",
      76.0,
      72.0
    );
    expect(result[0]!.targetWeight).toBe(76.5); // Mar 変わらず
    expect(result[1]!.targetWeight).toBe(76.0); // Apr manual
    expect(result[1]!.source).toBe("manual");
    expect(result[2]!.targetWeight).toBe(74.0); // May 再配分
    expect(result[3]!.targetWeight).toBe(72.0); // Jun finalGoal
  });

  test("最後から 2 番目の月を編集 → 最終月は finalGoalWeight になる", () => {
    // May を 74.0 に編集 → Jun は 72.0 のまま
    const result = redistributeMonthlyGoals(
      baseEntries,
      "2026-05",
      74.0,
      72.0
    );
    expect(result[2]!.targetWeight).toBe(74.0);
    expect(result[2]!.source).toBe("manual");
    expect(result[3]!.targetWeight).toBe(72.0);
    expect(result[3]!.source).toBe("auto_redistributed");
  });

  test("最終月を編集しようとしても変更されない", () => {
    // Jun (最終月) は編集不可
    const result = redistributeMonthlyGoals(
      baseEntries,
      "2026-06",
      70.0,
      72.0
    );
    expect(result).toEqual(baseEntries);
  });

  test("存在しない月を指定した場合は元のリストをそのまま返す", () => {
    const result = redistributeMonthlyGoals(
      baseEntries,
      "2026-09",
      75.0,
      72.0
    );
    expect(result).toEqual(baseEntries);
  });

  test("requiredDeltaKg が再配分後に正しく更新される", () => {
    // Mar を 77.0 に編集 (prevWeight = 78.0 だが entries[0] の前は currentWeight)
    // Mar.requiredDeltaKg = 77.0 - 76.5 ... ではなく、前エントリーとの差
    // 先頭エントリーなので prevWeight は entries[-1] がないため自分自身の前が不明
    // redistributeMonthlyGoals は editedIdx>0 の場合のみ prevWeight が前エントリー
    // editedIdx=0 の場合は prevWeight = newTargetWeight (delta=0 になる設計)
    const result = redistributeMonthlyGoals(
      baseEntries,
      "2026-03",
      77.0,
      72.0
    );
    // editedIdx=0: prevWeight=77.0 (newTargetWeight), requiredDeltaKg=0
    expect(result[0]!.requiredDeltaKg).toBe(0);
    // Apr: 75.3 - 77.0 = -1.7
    expect(result[1]!.requiredDeltaKg).toBeCloseTo(-1.7, 1);
  });

  test("中間月編集時 requiredDeltaKg の起点が正しい", () => {
    // Apr を 76.0 に編集。前エントリー Mar の targetWeight = 76.5
    // Apr.requiredDeltaKg = 76.0 - 76.5 = -0.5
    const result = redistributeMonthlyGoals(
      baseEntries,
      "2026-04",
      76.0,
      72.0
    );
    expect(result[1]!.requiredDeltaKg).toBeCloseTo(-0.5, 2);
    // May: 74.0 - 76.0 = -2.0
    expect(result[2]!.requiredDeltaKg).toBeCloseTo(-2.0, 2);
  });

  test("actualWeight が保持される", () => {
    const entriesWithActual: MonthlyGoalEntry[] = baseEntries.map((e, i) =>
      i === 1 ? { ...e, actualWeight: 74.8 } : e
    );
    const result = redistributeMonthlyGoals(
      entriesWithActual,
      "2026-03",
      77.0,
      72.0
    );
    expect(result[1]!.actualWeight).toBe(74.8);
  });
});

// ─── validateMonthlyGoalPlan ─────────────────────────────────────────────────

describe("validateMonthlyGoalPlan", () => {
  test("正常な plan はそのまま isValid=true で返る", () => {
    const plan = buildMonthlyGoalPlan(makeInput());
    const result = validateMonthlyGoalPlan(plan, {
      currentWeight: 78.0,
      finalGoalWeight: 72.0,
      goalDeadlineDate: "2026-06-30",
      today: "2026-03-15",
    });
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("isValid=false の plan を渡すとそのままエラーが返る", () => {
    const plan = buildMonthlyGoalPlan(makeInput({ goalDeadlineDate: "bad" }));
    const result = validateMonthlyGoalPlan(plan, {
      currentWeight: 78.0,
      finalGoalWeight: 72.0,
      goalDeadlineDate: "bad",
      today: "2026-03-15",
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("最終エントリーが期限月と不一致 → OVERRIDE_MONTH_OUT_OF_RANGE", () => {
    const plan = buildMonthlyGoalPlan(makeInput());
    // 期限月を May に変えて validate
    const result = validateMonthlyGoalPlan(plan, {
      currentWeight: 78.0,
      finalGoalWeight: 72.0,
      goalDeadlineDate: "2026-05-31", // Jun まで計画があるのに May で検証
      today: "2026-03-15",
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === "OVERRIDE_MONTH_OUT_OF_RANGE")).toBe(
      true
    );
  });

  test("最終エントリーの targetWeight が finalGoalWeight と大きく乖離 → INVALID_GOAL_WEIGHT", () => {
    const plan = buildMonthlyGoalPlan(makeInput());
    // finalGoalWeight を 70.0 に変えて検証 (計画の最終月は 72.0 のまま)
    const result = validateMonthlyGoalPlan(plan, {
      currentWeight: 78.0,
      finalGoalWeight: 70.0,
      goalDeadlineDate: "2026-06-30",
      today: "2026-03-15",
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_GOAL_WEIGHT")).toBe(
      true
    );
  });
});

// ─── getMonthlyGoalWarnings ──────────────────────────────────────────────────

describe("getMonthlyGoalWarnings", () => {
  const entries4months: MonthlyGoalEntry[] = [
    {
      month: "2026-03",
      targetWeight: 76.5,
      source: "auto_redistributed",
      requiredDeltaKg: -1.5,
      actualWeight: null,
    },
    {
      month: "2026-04",
      targetWeight: 75.0,
      source: "auto_redistributed",
      requiredDeltaKg: -1.5,
      actualWeight: null,
    },
    {
      month: "2026-05",
      targetWeight: 73.5,
      source: "auto_redistributed",
      requiredDeltaKg: -1.5,
      actualWeight: null,
    },
    {
      month: "2026-06",
      targetWeight: 72.0,
      source: "auto_redistributed",
      requiredDeltaKg: -1.5,
      actualWeight: null,
    },
  ];

  test("通常ケースでは warnings は空", () => {
    const warnings = getMonthlyGoalWarnings({
      entries: entries4months,
      currentWeight: 78.0,
      finalGoalWeight: 72.0,
      today: "2026-03-15",
    });
    expect(warnings).toHaveLength(0);
  });

  test("ALREADY_AT_GOAL: currentWeight が finalGoalWeight 以下 (Cut)", () => {
    const warnings = getMonthlyGoalWarnings({
      entries: entries4months,
      currentWeight: 71.9,
      finalGoalWeight: 72.0,
      today: "2026-03-15",
    });
    expect(warnings.some((w) => w.code === "ALREADY_AT_GOAL")).toBe(true);
  });

  test("ALREADY_AT_GOAL: currentWeight === finalGoalWeight", () => {
    const warnings = getMonthlyGoalWarnings({
      entries: entries4months,
      currentWeight: 72.0,
      finalGoalWeight: 72.0,
      today: "2026-03-15",
    });
    expect(warnings.some((w) => w.code === "ALREADY_AT_GOAL")).toBe(true);
  });

  test("ALREADY_AT_GOAL: Bulk 方向で currentWeight >= finalGoalWeight", () => {
    const bulkEntries: MonthlyGoalEntry[] = [
      {
        month: "2026-03",
        targetWeight: 68.0,
        source: "auto_redistributed",
        requiredDeltaKg: 0.1,
        actualWeight: null,
      },
    ];
    const warnings = getMonthlyGoalWarnings({
      entries: bulkEntries,
      currentWeight: 67.9, // finalGoalWeight との差が 0.2 kg 以下
      finalGoalWeight: 68.0,
      today: "2026-03-15",
    });
    expect(warnings.some((w) => w.code === "ALREADY_AT_GOAL")).toBe(true);
  });

  test("DEADLINE_TOO_CLOSE: 残り 1 ヶ月以下で警告", () => {
    const singleEntry: MonthlyGoalEntry[] = [
      {
        month: "2026-03",
        targetWeight: 72.0,
        source: "auto_redistributed",
        requiredDeltaKg: -6.0,
        actualWeight: null,
      },
    ];
    const warnings = getMonthlyGoalWarnings({
      entries: singleEntry,
      currentWeight: 78.0,
      finalGoalWeight: 72.0,
      today: "2026-03-15",
    });
    expect(warnings.some((w) => w.code === "DEADLINE_TOO_CLOSE")).toBe(true);
  });

  test("HIGH_MONTHLY_DELTA: |requiredDeltaKg| が閾値超えで警告", () => {
    const heavyEntries: MonthlyGoalEntry[] = [
      {
        month: "2026-03",
        targetWeight: 74.0,
        source: "auto_redistributed",
        requiredDeltaKg: -(MAX_SAFE_MONTHLY_DELTA_KG + 0.1),
        actualWeight: null,
      },
      {
        month: "2026-04",
        targetWeight: 72.0,
        source: "auto_redistributed",
        requiredDeltaKg: -2.0,
        actualWeight: null,
      },
    ];
    const warnings = getMonthlyGoalWarnings({
      entries: heavyEntries,
      currentWeight: 76.1,
      finalGoalWeight: 72.0,
      today: "2026-03-15",
    });
    const highDelta = warnings.filter((w) => w.code === "HIGH_MONTHLY_DELTA");
    expect(highDelta).toHaveLength(1);
    expect(highDelta[0]!.month).toBe("2026-03");
    expect(highDelta[0]!.threshold).toBe(MAX_SAFE_MONTHLY_DELTA_KG);
  });

  test("HIGH_MONTHLY_DELTA: 閾値ちょうど (2.0 kg) では警告しない", () => {
    const exactEntries: MonthlyGoalEntry[] = [
      {
        month: "2026-03",
        targetWeight: 76.0,
        source: "auto_redistributed",
        requiredDeltaKg: -MAX_SAFE_MONTHLY_DELTA_KG,
        actualWeight: null,
      },
      {
        month: "2026-04",
        targetWeight: 72.0,
        source: "auto_redistributed",
        requiredDeltaKg: -4.0,
        actualWeight: null,
      },
    ];
    const warnings = getMonthlyGoalWarnings({
      entries: exactEntries,
      currentWeight: 78.0,
      finalGoalWeight: 72.0,
      today: "2026-03-15",
    });
    // Mar は閾値ちょうど → HIGH_MONTHLY_DELTA なし
    // Apr は -4.0 → HIGH_MONTHLY_DELTA あり
    const highDelta = warnings.filter((w) => w.code === "HIGH_MONTHLY_DELTA");
    expect(highDelta.some((w) => w.month === "2026-03")).toBe(false);
    expect(highDelta.some((w) => w.month === "2026-04")).toBe(true);
  });

  test("WRONG_DIRECTION: Cut なのに delta が正 → 該当月に警告", () => {
    const wrongEntries: MonthlyGoalEntry[] = [
      {
        month: "2026-03",
        targetWeight: 79.0,
        source: "manual",
        requiredDeltaKg: 1.0, // Cut なのに増量方向
        actualWeight: null,
      },
      {
        month: "2026-04",
        targetWeight: 72.0,
        source: "auto_redistributed",
        requiredDeltaKg: -7.0,
        actualWeight: null,
      },
    ];
    const warnings = getMonthlyGoalWarnings({
      entries: wrongEntries,
      currentWeight: 78.0,
      finalGoalWeight: 72.0,
      today: "2026-03-15",
    });
    const wrong = warnings.filter((w) => w.code === "WRONG_DIRECTION");
    expect(wrong.some((w) => w.month === "2026-03")).toBe(true);
    expect(wrong.some((w) => w.month === "2026-04")).toBe(false);
  });

  test("MANUAL_GOAL_MISMATCH: manual override があり最終月が finalGoalWeight と乖離", () => {
    const mismatchEntries: MonthlyGoalEntry[] = [
      {
        month: "2026-03",
        targetWeight: 75.0,
        source: "manual",
        requiredDeltaKg: -3.0,
        actualWeight: null,
      },
      {
        month: "2026-04",
        targetWeight: 74.0, // finalGoalWeight=72.0 と 2kg 乖離
        source: "auto_redistributed",
        requiredDeltaKg: -1.0,
        actualWeight: null,
      },
    ];
    const warnings = getMonthlyGoalWarnings({
      entries: mismatchEntries,
      currentWeight: 78.0,
      finalGoalWeight: 72.0,
      today: "2026-03-15",
    });
    expect(warnings.some((w) => w.code === "MANUAL_GOAL_MISMATCH")).toBe(true);
  });

  test("manual override があっても最終月が finalGoalWeight ならば MANUAL_GOAL_MISMATCH なし", () => {
    const okEntries: MonthlyGoalEntry[] = [
      {
        month: "2026-03",
        targetWeight: 75.0,
        source: "manual",
        requiredDeltaKg: -3.0,
        actualWeight: null,
      },
      {
        month: "2026-04",
        targetWeight: 72.0, // finalGoalWeight と一致
        source: "auto_redistributed",
        requiredDeltaKg: -3.0,
        actualWeight: null,
      },
    ];
    const warnings = getMonthlyGoalWarnings({
      entries: okEntries,
      currentWeight: 78.0,
      finalGoalWeight: 72.0,
      today: "2026-03-15",
    });
    expect(warnings.some((w) => w.code === "MANUAL_GOAL_MISMATCH")).toBe(
      false
    );
  });

  test("entries が空の場合は warnings も空", () => {
    const warnings = getMonthlyGoalWarnings({
      entries: [],
      currentWeight: 78.0,
      finalGoalWeight: 72.0,
      today: "2026-03-15",
    });
    expect(warnings).toHaveLength(0);
  });
});

// ─── 統合ケース ──────────────────────────────────────────────────────────────

describe("buildMonthlyGoalPlan + redistributeMonthlyGoals 統合", () => {
  test("初期計画構築後に中間月を編集すると計画全体が更新される", () => {
    const input = makeInput(); // 78→72 / Mar〜Jun
    const plan = buildMonthlyGoalPlan(input);

    // Apr を 76.0 に編集
    const updated = redistributeMonthlyGoals(
      plan.entries,
      "2026-04",
      76.0,
      72.0
    );

    expect(updated[0]!.targetWeight).toBe(76.5); // Mar: 変わらず
    expect(updated[1]!.source).toBe("manual");    // Apr: manual
    expect(updated[1]!.targetWeight).toBe(76.0);
    expect(updated[3]!.targetWeight).toBe(72.0);  // Jun: finalGoal
  });

  test("過去月の actualWeight が設定されていても計画構築は正常", () => {
    const plan = buildMonthlyGoalPlan(
      makeInput({
        monthlyActuals: [
          { month: "2026-03", endWeight: 77.1 },
          { month: "2026-04", endWeight: null },
        ],
      })
    );
    expect(plan.isValid).toBe(true);
    expect(plan.entries.find((e) => e.month === "2026-03")!.actualWeight).toBe(
      77.1
    );
    expect(plan.entries.find((e) => e.month === "2026-04")!.actualWeight).toBeNull();
  });
});
