import { buildMonthlySeasonSummary } from "./monthlySeasonSummary";

const cut = { id: 6, name: "2026_KantoClassBy", startDate: "2026-03-01" };
const bulk = { id: 7, name: "2027_offSeason", startDate: "2026-08-29" };

describe("buildMonthlySeasonSummary", () => {
  it("記録のIDから所属を集約し、重複させず開始日順にする", () => {
    const logs = [
      { log_date: "2026-08-30", season_id: bulk.id },
      { log_date: "2026-08-29", season_id: bulk.id },
      { log_date: "2026-08-01", season_id: cut.id },
    ];
    const seasons = [bulk, cut];
    const original = JSON.stringify({ logs, seasons });
    expect(buildMonthlySeasonSummary(logs, seasons)).toEqual({
      status: "ok", seasons: [cut, bulk], unassignedDays: 0, unknownDays: 0,
    });
    expect(JSON.stringify({ logs, seasons })).toBe(original);
  });

  it("記録されていない日は未所属に加算せず、同日重複も日単位で数える", () => {
    expect(buildMonthlySeasonSummary([
      { log_date: "2026-08-24", season_id: null },
      { log_date: "2026-08-24", season_id: null },
      { log_date: "2026-08-28", season_id: null },
    ], [cut, bulk])).toEqual({ status: "ok", seasons: [], unassignedDays: 2, unknownDays: 0 });
  });

  it("未所属、未取得のID、参照先不明を区別する", () => {
    expect(buildMonthlySeasonSummary([
      { log_date: "2026-08-24", season_id: null },
      { log_date: "2026-08-25" },
      { log_date: "2026-08-26", season_id: 999 },
      { log_date: "2026-08-26", season_id: 999 },
    ], [cut, bulk])).toEqual({ status: "ok", seasons: [], unassignedDays: 1, unknownDays: 2 });
  });

  it("同名シーズンを統合せずIDで区別し、開始日が同じならID順にする", () => {
    const other = { ...cut, id: 8 };
    expect(buildMonthlySeasonSummary([
      { log_date: "2026-06-01", season_id: other.id },
      { log_date: "2026-06-02", season_id: cut.id },
    ], [other, cut])).toMatchObject({ seasons: [cut, other] });
  });

  it("開始日から推測せず保存済みの所属を優先し、nullの所属を補完しない", () => {
    expect(buildMonthlySeasonSummary([
      { log_date: "2026-08-30", season_id: cut.id },
      { log_date: "2026-08-31", season_id: null },
    ], [cut, bulk])).toEqual({ status: "ok", seasons: [cut], unassignedDays: 1, unknownDays: 0 });
  });

  it("シーズン一覧の取得失敗を未所属に置き換えない", () => {
    expect(buildMonthlySeasonSummary([{ log_date: "2026-06-01", season_id: cut.id }], null)).toEqual({ status: "unavailable" });
  });

  it("空の一覧の正常取得と取得失敗を区別する", () => {
    expect(buildMonthlySeasonSummary([{ log_date: "2026-06-01", season_id: cut.id }], [])).toEqual({
      status: "ok", seasons: [], unassignedDays: 0, unknownDays: 1,
    });
  });

  it("記録のない月にシーズンを付けない", () => {
    expect(buildMonthlySeasonSummary([], [cut, bulk])).toEqual({
      status: "ok", seasons: [], unassignedDays: 0, unknownDays: 0,
    });
  });
});
