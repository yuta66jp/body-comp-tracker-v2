import {
  calcSeasonMeta,
  buildDaysOutSeries,
  calcTodayDaysOut,
  buildTodayWindowEntries,
} from "./calcSeason";
import type { CareerLog } from "@/lib/supabase/types";

function makeLog(log_date: string, weight: number, season = "2025_TestSeason", target_date = "2025-11-01"): CareerLog {
  return { id: 1, log_date, weight, season, target_date, note: null };
}

describe("calcSeasonMeta", () => {
  it("空配列では空配列を返す", () => {
    expect(calcSeasonMeta([])).toEqual([]);
  });

  it("シーズン最小体重（peakWeight）が正しく特定される", () => {
    const logs = [
      makeLog("2025-09-01", 70.0),
      makeLog("2025-10-01", 65.0),
      makeLog("2025-11-01", 62.0), // 最小
    ];
    const [meta] = calcSeasonMeta(logs);
    expect(meta.peakWeight).toBe(62.0);
    expect(meta.peakDate).toBe("2025-11-01");
  });

  it("日付範囲（startDate / endDate）が正しい", () => {
    const logs = [
      makeLog("2025-09-01", 70.0),
      makeLog("2025-10-01", 65.0),
      makeLog("2025-11-01", 62.0),
    ];
    const [meta] = calcSeasonMeta(logs);
    expect(meta.startDate).toBe("2025-09-01");
    expect(meta.endDate).toBe("2025-11-01");
  });

  it("件数（count）が正しい", () => {
    const logs = [
      makeLog("2025-09-01", 70.0),
      makeLog("2025-10-01", 65.0),
    ];
    const [meta] = calcSeasonMeta(logs);
    expect(meta.count).toBe(2);
  });

  it("複数シーズンが独立して集計される", () => {
    const logs = [
      makeLog("2024-09-01", 72.0, "2024_Season", "2024-11-01"),
      makeLog("2024-11-01", 63.0, "2024_Season", "2024-11-01"),
      makeLog("2025-09-01", 70.0, "2025_Season", "2025-11-01"),
      makeLog("2025-11-01", 61.0, "2025_Season", "2025-11-01"),
    ];
    const metas = calcSeasonMeta(logs);
    expect(metas).toHaveLength(2);
    const s2024 = metas.find((m) => m.season === "2024_Season")!;
    const s2025 = metas.find((m) => m.season === "2025_Season")!;
    expect(s2024.peakWeight).toBe(63.0);
    expect(s2025.peakWeight).toBe(61.0);
  });
});

describe("buildDaysOutSeries", () => {
  it("大会日を 0 として days_out が正しく計算される", () => {
    const logs = [
      makeLog("2025-10-02", 65.0, "S1", "2025-11-01"), // 30日前
      makeLog("2025-11-01", 62.0, "S1", "2025-11-01"), // 0日（大会当日）
    ];
    const seriesMap = buildDaysOutSeries(logs);
    const points = seriesMap.get("S1")!;

    expect(points[0].daysOut).toBe(-30);
    expect(points[1].daysOut).toBe(0);
  });

  it("seasonFilter を指定すると対象シーズンのみが含まれる", () => {
    const logs = [
      makeLog("2024-11-01", 63.0, "2024_Season", "2024-11-01"),
      makeLog("2025-11-01", 61.0, "2025_Season", "2025-11-01"),
    ];
    const seriesMap = buildDaysOutSeries(logs, ["2025_Season"]);
    expect(seriesMap.has("2024_Season")).toBe(false);
    expect(seriesMap.has("2025_Season")).toBe(true);
  });

  it("sma7 が正しく計算される（初期値は実測値と同じ）", () => {
    const logs = [makeLog("2025-11-01", 62.5, "S1", "2025-11-01")];
    const seriesMap = buildDaysOutSeries(logs);
    const [point] = seriesMap.get("S1")!;
    // 1点だけの場合は sma7 = weight
    expect(point.sma7).toBeCloseTo(62.5, 5);
  });

  it("7日移動平均が正しく計算される", () => {
    const weights = [70, 69, 68, 67, 66, 65, 64];
    const logs = weights.map((w, i) =>
      makeLog(
        `2025-10-${String(26 + i).padStart(2, "0")}`,
        w,
        "S1",
        "2025-11-01"
      )
    );
    const seriesMap = buildDaysOutSeries(logs);
    const points = seriesMap.get("S1")!;
    const lastSma7 = points[6].sma7!;
    // 全7点の平均 = (70+69+68+67+66+65+64)/7 = 67
    expect(lastSma7).toBeCloseTo(67, 5);
  });
});

// ─── calcTodayDaysOut ──────────────────────────────────────────────────────────

describe("calcTodayDaysOut", () => {
  it("大会日と同日なら 0 を返す", () => {
    expect(calcTodayDaysOut("2025-11-01", "2025-11-01")).toBe(0);
  });

  it("大会 30 日前なら -30 を返す", () => {
    expect(calcTodayDaysOut("2025-10-02", "2025-11-01")).toBe(-30);
  });

  it("大会後 5 日なら +5 を返す", () => {
    expect(calcTodayDaysOut("2025-11-06", "2025-11-01")).toBe(5);
  });

  it("不正な日付文字列には null を返す", () => {
    expect(calcTodayDaysOut("invalid", "2025-11-01")).toBeNull();
    expect(calcTodayDaysOut("2025-11-01", "invalid")).toBeNull();
  });
});

// ─── buildTodayWindowEntries ──────────────────────────────────────────────────

describe("buildTodayWindowEntries", () => {
  function makeCareerLog(
    log_date: string,
    weight: number,
    season = "S1",
    target_date = "2025-11-01"
  ) {
    return { id: 1, log_date, weight, season, target_date, note: null };
  }

  it("ウィンドウ内の体重が平均される", () => {
    // 同じ体重を使うと sma7 も同値になり avgWeight が検証しやすい
    const logs = [
      makeCareerLog("2025-10-18", 65.0, "S1", "2025-11-01"), // daysOut = -14, sma7 = 65.0
      makeCareerLog("2025-10-22", 65.0, "S1", "2025-11-01"), // daysOut = -10, sma7 = 65.0
      makeCareerLog("2025-10-26", 65.0, "S1", "2025-11-01"), // daysOut = -6,  sma7 = 65.0
    ];
    const seriesMap = buildDaysOutSeries(logs);
    // todayDaysOut = -10, window = ±7 → daysOut in [-17, -3] → 全3点ヒット
    const entries = buildTodayWindowEntries(seriesMap, -10, 7);
    const s1 = entries.find((e) => e.season === "S1")!;
    expect(s1.count).toBe(3);
    expect(s1.avgWeight).toBeCloseTo(65.0, 1);
  });

  it("ウィンドウ外のデータは除外される（件数の確認）", () => {
    const logs = [
      makeCareerLog("2025-09-01", 70.0, "S1", "2025-11-01"), // daysOut = -61, ウィンドウ外
      makeCareerLog("2025-10-22", 65.0, "S1", "2025-11-01"), // daysOut = -10, ウィンドウ内
    ];
    const seriesMap = buildDaysOutSeries(logs);
    // todayDaysOut = -10, window = ±7 → daysOut in [-17, -3]
    const entries = buildTodayWindowEntries(seriesMap, -10, 7);
    const s1 = entries.find((e) => e.season === "S1")!;
    // ウィンドウ外の点は除外されるため count = 1
    expect(s1.count).toBe(1);
    expect(s1.avgWeight).not.toBeNull();
  });

  it("ウィンドウ内にデータがないシーズンは count=0 / avgWeight=null", () => {
    const logs = [
      makeCareerLog("2025-09-01", 70.0, "S1", "2025-11-01"), // daysOut = -61
    ];
    const seriesMap = buildDaysOutSeries(logs);
    const entries = buildTodayWindowEntries(seriesMap, -10, 7);
    const s1 = entries.find((e) => e.season === "S1")!;
    expect(s1.count).toBe(0);
    expect(s1.avgWeight).toBeNull();
    expect(s1.centerDaysOut).toBeNull();
  });

  it("複数シーズンが独立して集計される", () => {
    const logs = [
      makeCareerLog("2024-10-22", 68.0, "2024_Season", "2024-11-01"),
      makeCareerLog("2025-10-22", 65.0, "2025_Season", "2025-11-01"),
    ];
    const seriesMap = buildDaysOutSeries(logs);
    const entries = buildTodayWindowEntries(seriesMap, -10, 7);
    const s2024 = entries.find((e) => e.season === "2024_Season")!;
    const s2025 = entries.find((e) => e.season === "2025_Season")!;
    expect(s2024.avgWeight).toBeCloseTo(68.0, 1);
    expect(s2025.avgWeight).toBeCloseTo(65.0, 1);
  });

  it("空の seriesMap では空配列を返す", () => {
    const entries = buildTodayWindowEntries(new Map(), -10, 7);
    expect(entries).toHaveLength(0);
  });
});
