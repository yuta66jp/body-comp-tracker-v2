import type { Season } from "@/lib/domain/season";
import type { CareerLog } from "@/lib/supabase/types";
import { buildSeasonHistoryData } from "./seasonHistory";

const completedCut: Season = {
  id: 1,
  userId: "11111111-1111-1111-1111-111111111111",
  name: "2026_Cut",
  phase: "Cut",
  startDate: "2026-01-01",
  startWeight: 75,
  targetDate: "2026-03-31",
  targetWeight: 70,
  status: "completed",
  endDate: "2026-03-31",
  endWeight: 69.9,
  monthlyPlanStartDate: "2026-01-01",
  monthlyPlanStartMonth: "2026-01",
  monthlyPlanStartWeight: 75,
  monthlyPlanOverrides: [],
  monthlyPlanSnapshot: [
    {
      month: "2026-03",
      targetWeight: 70,
      source: "auto_redistributed",
      requiredDeltaKg: -1.5,
      actualWeight: 69.9,
    },
  ],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

const activeBulk: Season = {
  ...completedCut,
  id: 2,
  name: "2026_Bulk",
  phase: "Bulk",
  startDate: "2026-04-15",
  startWeight: 70,
  targetDate: "2026-07-31",
  targetWeight: 74,
  status: "active",
  endDate: null,
  endWeight: null,
  monthlyPlanStartMonth: "2026-04",
  monthlyPlanStartWeight: 70,
  monthlyPlanSnapshot: null,
  createdAt: "2026-04-15T00:00:00Z",
  updatedAt: "2026-04-15T00:00:00Z",
};

function career(overrides: Partial<CareerLog> = {}): CareerLog {
  return {
    id: 1,
    log_date: "2026-03-31",
    weight: 69.9,
    season: "2026_Cut",
    target_date: "2026-03-31",
    note: null,
    season_id: 1,
    user_id: completedCut.userId,
    ...overrides,
  };
}

describe("buildSeasonHistoryData", () => {
  it("daily_logsを優先してcareer_logsとの二重計上を防ぐ", () => {
    const result = buildSeasonHistoryData(
      [completedCut],
      [
        { log_date: "2026-03-30", weight: 70.1, season_id: 1 },
        { log_date: "2026-03-31", weight: 69.9, season_id: 1 },
      ],
      [career()],
      "2026-04-01"
    );

    expect(result.records[0]).toMatchObject({
      source: "daily_logs",
      latestWeight: 69.9,
      goalStatus: "achieved",
    });
    expect(result.records[0]!.logs).toHaveLength(2);
    expect(result.legacyRecords).toEqual([]);
  });

  it("daily_logsがない終了済みseasonはcareer_logsをフォールバックにする", () => {
    const result = buildSeasonHistoryData(
      [completedCut],
      [],
      [career()],
      "2026-04-01"
    );

    expect(result.records[0]).toMatchObject({
      source: "career_logs",
      latestWeight: 69.9,
    });
    expect(result.records[0]!.planEntries).toEqual(completedCut.monthlyPlanSnapshot);
  });

  it("進行中seasonは所属IDかつ期間内の日次ログだけを含める", () => {
    const result = buildSeasonHistoryData(
      [activeBulk],
      [
        { log_date: "2026-04-14", weight: 69.8, season_id: 2 },
        { log_date: "2026-04-15", weight: 70, season_id: 2 },
        { log_date: "2026-05-01", weight: 71, season_id: 2 },
        { log_date: "2026-05-02", weight: 71.2, season_id: null },
      ],
      [],
      "2026-05-02"
    );

    expect(result.records[0]!.logs.map((log) => log.log_date)).toEqual([
      "2026-04-15",
      "2026-05-01",
    ]);
    expect(result.records[0]!.planEntries.map((entry) => entry.month)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
    expect(result.unassignedLogCount).toBe(1);
  });

  it("終了済みsnapshotは現在日やログから再計算しない", () => {
    const result = buildSeasonHistoryData(
      [completedCut],
      [{ log_date: "2026-03-31", weight: 68, season_id: 1 }],
      [],
      "2027-12-31"
    );

    expect(result.records[0]!.planEntries).toEqual(completedCut.monthlyPlanSnapshot);
    expect(result.records[0]!.planEntries[0]!.actualWeight).toBe(69.9);
  });

  it("対応付けできないlegacy履歴はphaseを推測せず別表示へ残す", () => {
    const result = buildSeasonHistoryData(
      [],
      [],
      [career({ season_id: undefined, user_id: undefined, season: "Legacy", target_date: "2024-08-01", log_date: "2024-07-01" })],
      "2026-05-02"
    );

    expect(result.records).toEqual([]);
    expect(result.legacyRecords).toEqual([
      expect.objectContaining({ name: "Legacy", targetDate: "2024-08-01", count: 1 }),
    ]);
  });

  it("同名seasonは開始日を表示名に加えて比較系列を衝突させない", () => {
    const second = { ...completedCut, id: 3, startDate: "2027-01-01", endDate: "2027-03-31" };
    const result = buildSeasonHistoryData([completedCut, second], [], [], "2027-04-01");

    expect(result.records.map((record) => record.seriesLabel)).toEqual([
      "2026_Cut (2026-01-01)",
      "2026_Cut (2027-01-01)",
    ]);
  });

  it("Bulkは目標以上を達成、Cutは目標以下を達成として判定する", () => {
    const result = buildSeasonHistoryData(
      [completedCut, activeBulk],
      [
        { log_date: "2026-03-31", weight: 69.9, season_id: 1 },
        { log_date: "2026-05-01", weight: 74.1, season_id: 2 },
      ],
      [],
      "2026-05-01"
    );

    expect(result.records.map((record) => record.goalStatus)).toEqual([
      "achieved",
      "achieved",
    ]);
  });
});
