import type { SeasonRow } from "@/lib/supabase/types";
import { mapSeasonRow, resolveSeasonForDate, type Season } from "./season";

function makeRow(overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    id: 1,
    user_id: "11111111-1111-1111-1111-111111111111",
    name: "2026_Bulk",
    phase: "Bulk",
    start_date: "2026-01-01",
    start_weight: 70,
    target_date: "2026-03-31",
    target_weight: 75,
    status: "completed",
    end_date: "2026-03-31",
    end_weight: 74.5,
    monthly_plan_start_month: "2026-01",
    monthly_plan_start_weight: 70,
    monthly_plan_overrides: [{ month: "2026-02", targetWeight: 72.5 }],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-03-31T00:00:00Z",
    ...overrides,
  };
}

function makeSeason(overrides: Partial<Season> = {}): Season {
  return { ...mapSeasonRow(makeRow()), ...overrides };
}

describe("mapSeasonRow", () => {
  it("DB row を domain field と override に変換する", () => {
    const season = mapSeasonRow(makeRow());

    expect(season.phase).toBe("Bulk");
    expect(season.startDate).toBe("2026-01-01");
    expect(season.monthlyPlanOverrides).toEqual([
      { month: "2026-02", targetWeight: 72.5 },
    ]);
  });

  it("不正な override 要素を計画へ混入させない", () => {
    const season = mapSeasonRow(
      makeRow({
        monthly_plan_overrides: [
          { month: "bad", targetWeight: 72 },
          { month: "2026-02", targetWeight: 301 },
          { month: "2026-03", targetWeight: 73 },
        ],
      })
    );

    expect(season.monthlyPlanOverrides).toEqual([
      { month: "2026-03", targetWeight: 73 },
    ]);
  });

  it("未知の phase は明示的に拒否する", () => {
    expect(() => mapSeasonRow(makeRow({ phase: "Maintain" }))).toThrow(
      "invalid_season_phase:Maintain"
    );
  });
});

describe("resolveSeasonForDate", () => {
  const bulk = makeSeason();
  const cut = makeSeason({
    id: 2,
    name: "2026_Cut",
    phase: "Cut",
    startDate: "2026-04-01",
    startWeight: 74.5,
    targetDate: "2026-08-30",
    targetWeight: 68,
    status: "active",
    endDate: null,
    endWeight: null,
  });

  it("切り替え日前日は旧 season、当日は新 season に解決する", () => {
    expect(resolveSeasonForDate([bulk, cut], "2026-03-31")).toMatchObject({
      kind: "matched",
      season: { id: 1 },
    });
    expect(resolveSeasonForDate([bulk, cut], "2026-04-01")).toMatchObject({
      kind: "matched",
      season: { id: 2 },
    });
  });

  it("どの期間にも属さない日付は unassigned にする", () => {
    expect(resolveSeasonForDate([bulk], "2025-12-31")).toEqual({
      kind: "unassigned",
    });
  });

  it("重複期間は推測せず ambiguous にする", () => {
    const overlapping = makeSeason({ id: 3 });
    expect(resolveSeasonForDate([bulk, overlapping], "2026-02-01")).toEqual({
      kind: "ambiguous",
      seasonIds: [1, 3],
    });
  });
});
