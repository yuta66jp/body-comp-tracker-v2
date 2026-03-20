import { buildForecastMap } from "./forecastUtils";

describe("buildForecastMap", () => {
  const predictions = [
    { ds: "2026-03-15", yhat: 68.0 }, // 最終実測日当日
    { ds: "2026-03-16", yhat: 67.8 }, // 翌日 (gap 開始)
    { ds: "2026-03-17", yhat: 67.6 }, // gap
    { ds: "2026-03-18", yhat: 67.4 }, // gap
    { ds: "2026-03-21", yhat: 67.0 }, // 今日 (gap 末尾)
    { ds: "2026-03-22", yhat: 66.8 }, // 未来
    { ds: "2026-03-23", yhat: 66.6 }, // 未来
  ];

  it("最終実測日当日の予測は含めない（actual ドットと重複させない）", () => {
    const map = buildForecastMap(predictions, "2026-03-15");
    expect(map.has("2026-03-15")).toBe(false);
  });

  it("最終実測日が数日前のとき、ギャップ期間の予測を全て含む", () => {
    // regression: 旧実装 (p.ds >= today) では gap 期間の予測が非表示になっていた
    const map = buildForecastMap(predictions, "2026-03-15");
    expect(map.has("2026-03-16")).toBe(true); // gap 初日
    expect(map.has("2026-03-17")).toBe(true);
    expect(map.has("2026-03-18")).toBe(true);
    expect(map.has("2026-03-21")).toBe(true); // 今日
    expect(map.has("2026-03-22")).toBe(true); // 未来
  });

  it("latestLogDate が今日のとき、今日の予測は含めず翌日以降のみ返す", () => {
    const map = buildForecastMap(predictions, "2026-03-21");
    expect(map.has("2026-03-21")).toBe(false);
    expect(map.has("2026-03-22")).toBe(true);
    expect(map.has("2026-03-23")).toBe(true);
  });

  it("yhat 値を正確にマップする", () => {
    const map = buildForecastMap(predictions, "2026-03-15");
    expect(map.get("2026-03-16")).toBeCloseTo(67.8);
    expect(map.get("2026-03-21")).toBeCloseTo(67.0);
  });

  it("predictions が空のとき空の Map を返す", () => {
    const map = buildForecastMap([], "2026-03-15");
    expect(map.size).toBe(0);
  });
});
