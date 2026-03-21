import { buildForecastMap, calcEwLinearForecast, buildYAxisConfig } from "./forecastUtils";
import type { RangeTab } from "./forecastUtils";

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

  it("horizonDays=30 で 30 件の予測を返す", () => {
    const sma7 = makeSma7(20, latestLogDate, 70.0, 0.0);
    const result = calcEwLinearForecast(sma7, latestLogDate, 30);
    expect(result).toHaveLength(30);
    expect(result[29].date).toBe("2026-04-14");
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

// ─── buildYAxisConfig ─────────────────────────────────────────────────────────

describe("buildYAxisConfig", () => {
  it("7d: 0.5kg 刻みの tick 配列を返す", () => {
    const { ticks } = buildYAxisConfig("7d", 68.0, 71.0);
    // 68.0, 68.5, 69.0, ... 71.0
    expect(ticks[0]).toBeCloseTo(68.0);
    expect(ticks[1]).toBeCloseTo(68.5);
    // 隣接差が 0.5
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBeCloseTo(0.5);
    }
  });

  it("7d: 全 tick でラベルを返す（空文字なし）", () => {
    const { ticks, formatter } = buildYAxisConfig("7d", 68.0, 70.0);
    for (const t of ticks) {
      expect(formatter(t)).not.toBe("");
    }
  });

  it("7d: 0.5kg 刻みのラベル形式 (整数は kg、小数は .1f + kg)", () => {
    const { formatter } = buildYAxisConfig("7d", 68.0, 69.0);
    expect(formatter(68.0)).toBe("68kg");
    expect(formatter(68.5)).toBe("68.5kg");
    expect(formatter(69.0)).toBe("69kg");
  });

  it("31d: 1kg 刻みの tick 配列を返す", () => {
    const { ticks } = buildYAxisConfig("31d", 67.0, 71.0);
    expect(ticks[0]).toBeCloseTo(67.0);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBeCloseTo(1.0);
    }
  });

  it("31d: 全 tick でラベルを返す（空文字なし）", () => {
    const { ticks, formatter } = buildYAxisConfig("31d", 65.0, 72.0);
    for (const t of ticks) {
      expect(formatter(t)).not.toBe("");
    }
  });

  it("60d: 5 の倍数のみラベルを返し、それ以外は空文字", () => {
    const { formatter } = buildYAxisConfig("60d", 63.0, 73.0);
    expect(formatter(65)).toBe("65kg");
    expect(formatter(70)).toBe("70kg");
    expect(formatter(64)).toBe("");
    expect(formatter(66)).toBe("");
    expect(formatter(69)).toBe("");
  });

  it("default: 5 の倍数のみラベルを返し、それ以外は空文字", () => {
    const { formatter } = buildYAxisConfig("default", 55.0, 75.0);
    expect(formatter(60)).toBe("60kg");
    expect(formatter(65)).toBe("65kg");
    expect(formatter(61)).toBe("");
    expect(formatter(63)).toBe("");
  });

  it("yMin が step の倍数でない場合、切り上げた値から tick が始まる", () => {
    // yMin=68.3, step=0.5 → 最初の tick は 68.5
    const { ticks } = buildYAxisConfig("7d", 68.3, 70.0);
    expect(ticks[0]).toBeCloseTo(68.5);
  });
});
