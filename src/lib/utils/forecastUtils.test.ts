import { buildForecastMap, calcEwLinearForecast } from "./forecastUtils";

// ─── calcEwLinearForecast ─────────────────────────────────────────────────────

/** n 点の SMA7 系列を生成する (slope kg/日, latestDate が最終日) */
function makeSma7(n: number, latestDate: string, valueAtLatest: number, slope: number): Array<{ date: string; value: number }> {
  // 日付を latestDate から逆算してローカル Date を使わず文字列操作で生成
  const result: Array<{ date: string; value: number }> = [];
  for (let i = 0; i < n; i++) {
    // latestDate - (n-1-i) 日
    const daysBack = n - 1 - i;
    const [y, m, d] = latestDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d - daysBack);
    const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    result.push({ date, value: valueAtLatest + slope * (i - (n - 1)) });
  }
  return result;
}

describe("calcEwLinearForecast", () => {
  const latestLogDate = "2026-03-15";

  it("SMA7 が 1 件以下のとき空配列を返す", () => {
    expect(calcEwLinearForecast([], latestLogDate)).toEqual([]);
    const single = [{ date: latestLogDate, value: 70.0 }];
    expect(calcEwLinearForecast(single, latestLogDate)).toEqual([]);
  });

  it("デフォルトで 14 件の予測を返す", () => {
    const sma7 = makeSma7(20, latestLogDate, 70.0, 0.0);
    const result = calcEwLinearForecast(sma7, latestLogDate);
    expect(result).toHaveLength(14);
  });

  it("horizonDays を指定した件数の予測を返す", () => {
    const sma7 = makeSma7(20, latestLogDate, 70.0, 0.0);
    expect(calcEwLinearForecast(sma7, latestLogDate, 7)).toHaveLength(7);
  });

  it("latestLogDate の翌日から始まる", () => {
    const sma7 = makeSma7(20, latestLogDate, 70.0, 0.0);
    const result = calcEwLinearForecast(sma7, latestLogDate);
    expect(result[0].date).toBe("2026-03-16");
  });

  it("14 件目が latestLogDate + 14 日の日付になる", () => {
    const sma7 = makeSma7(20, latestLogDate, 70.0, 0.0);
    const result = calcEwLinearForecast(sma7, latestLogDate);
    expect(result[13].date).toBe("2026-03-29");
  });

  it("一定 SMA7 では一定値を予測する", () => {
    const sma7 = makeSma7(20, latestLogDate, 70.0, 0.0);
    const result = calcEwLinearForecast(sma7, latestLogDate);
    for (const p of result) {
      expect(p.value).toBeCloseTo(70.0, 4);
    }
  });

  it("下降トレンドでは予測値が latestLogDate 時点の SMA7 より低くなる", () => {
    // slope = -0.05 kg/日 の下降トレンド
    const sma7 = makeSma7(20, latestLogDate, 70.0, -0.05);
    const result = calcEwLinearForecast(sma7, latestLogDate, 7);
    expect(result[6].value).toBeLessThan(70.0);
  });

  it("上昇トレンドでは予測値が latestLogDate 時点の SMA7 より高くなる", () => {
    const sma7 = makeSma7(20, latestLogDate, 70.0, 0.05);
    const result = calcEwLinearForecast(sma7, latestLogDate, 7);
    expect(result[6].value).toBeGreaterThan(70.0);
  });

  it("SMA7 が 30 件を超える場合でも直近 30 件を使って予測できる", () => {
    const sma7 = makeSma7(50, latestLogDate, 70.0, -0.02);
    const result = calcEwLinearForecast(sma7, latestLogDate);
    expect(result).toHaveLength(14);
    // 下降トレンドなので予測値が下がっていること
    expect(result[13].value).toBeLessThan(70.0);
  });
});

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
