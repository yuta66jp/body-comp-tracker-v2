import { calcSeasonMeta, buildDaysOutSeries } from "./calcSeason";
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
