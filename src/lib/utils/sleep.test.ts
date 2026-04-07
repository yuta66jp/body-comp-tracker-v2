/**
 * deriveSleepHours — ユニットテスト
 *
 * 就寝時刻 (bed_time) と体重測定時刻 (weigh_in_time) から
 * 推定睡眠時間 (sleep_hours) を算出する純粋関数の検証。
 */

import { deriveSleepHours } from "./sleep";

/**
 * 起床日基準の canonical ケース (#507)
 *
 * sleep_hours は log_date（起床・測定日）に属する睡眠セッションの長さ。
 * 前日夜就寝・当日深夜就寝・早朝就寝のいずれも同じ log_date に紐づく。
 * 以下の 3 例はすべて log_date = 2026-04-08 に対応する。
 */
describe("deriveSleepHours — 起床日基準 (#507)", () => {
  test("前日夜就寝: bed=23:30(D-1), weigh=07:00(D) → 7.5h [日またぎ補正あり]", () => {
    // 2026-04-07 23:30 就寝 → 2026-04-08 07:00 起床, log_date=2026-04-08
    expect(deriveSleepHours("23:30", "07:00")).toBe(7.5);
  });

  test("当日深夜就寝: bed=01:30(D), weigh=08:00(D) → 6.5h [日またぎ補正なし]", () => {
    // 2026-04-08 01:30 就寝 → 2026-04-08 08:00 起床, log_date=2026-04-08
    expect(deriveSleepHours("01:30", "08:00")).toBe(6.5);
  });

  test("早朝就寝: bed=04:00(D), weigh=10:00(D) → 6.0h [日またぎ補正なし]", () => {
    // 2026-04-08 04:00 就寝 → 2026-04-08 10:00 起床, log_date=2026-04-08
    expect(deriveSleepHours("04:00", "10:00")).toBe(6.0);
  });
});

describe("deriveSleepHours — 日またぎなし（当日内）", () => {
  test("03:00 → 07:00: 4h", () => {
    expect(deriveSleepHours("03:00", "07:00")).toBe(4.0);
  });

  test("00:00 → 08:00: 8h", () => {
    expect(deriveSleepHours("00:00", "08:00")).toBe(8.0);
  });

  test("22:00 → 22:30: 0.5h", () => {
    // weigh_in_time (22:30) > bed_time (22:00) → 日またぎなし
    expect(deriveSleepHours("22:00", "22:30")).toBe(0.5);
  });
});

describe("deriveSleepHours — 日またぎ補正", () => {
  test("23:00 → 07:00: 8h (翌朝)", () => {
    expect(deriveSleepHours("23:00", "07:00")).toBe(8.0);
  });

  test("23:30 → 07:30: 8h (翌朝)", () => {
    expect(deriveSleepHours("23:30", "07:30")).toBe(8.0);
  });

  test("21:00 → 05:00: 8h (翌朝)", () => {
    expect(deriveSleepHours("21:00", "05:00")).toBe(8.0);
  });

  test("22:45 → 06:15: 7.5h (翌朝、端数あり)", () => {
    expect(deriveSleepHours("22:45", "06:15")).toBe(7.5);
  });
});

describe("deriveSleepHours — 小数点丸め", () => {
  test("23:00 → 06:20: 7.3h (20分=0.333... → 0.3に丸め)", () => {
    // 7h20min = 7.333... → 7.3
    expect(deriveSleepHours("23:00", "06:20")).toBe(7.3);
  });

  test("23:00 → 06:40: 7.7h (40分=0.666... → 0.7に丸め)", () => {
    // 7h40min = 7.666... → 7.7
    expect(deriveSleepHours("23:00", "06:40")).toBe(7.7);
  });
});

describe("deriveSleepHours — 異常値 (null を返す)", () => {
  test("同一時刻: 日またぎ補正後 24h → null", () => {
    // bed_time = weigh_in_time → 日またぎで +24h → diffHours = 24 → 無効
    expect(deriveSleepHours("07:00", "07:00")).toBeNull();
  });

  test("1分差: 0.016h → 丸めて 0.0h → 0 以下 → null", () => {
    // 1分 = 0.01666... → Math.round(0.1666) / 10 = 0 → 0 <= 0 → null
    expect(deriveSleepHours("06:59", "07:00")).toBeNull();
  });

  test("形式が不正な文字列 → null", () => {
    expect(deriveSleepHours("invalid", "07:00")).toBeNull();
    expect(deriveSleepHours("23:00", "abc")).toBeNull();
  });

  test("時の値が範囲外 (24:00) → null", () => {
    expect(deriveSleepHours("24:00", "07:00")).toBeNull();
  });

  test("分の値が範囲外 (23:60) → null", () => {
    expect(deriveSleepHours("23:00", "07:60")).toBeNull();
  });

  test("空文字 → null", () => {
    expect(deriveSleepHours("", "07:00")).toBeNull();
    expect(deriveSleepHours("23:00", "")).toBeNull();
  });
});

describe("deriveSleepHours — HH:MM:SS 形式サポート", () => {
  test("23:00:00 → 07:00:00: 8h", () => {
    expect(deriveSleepHours("23:00:00", "07:00:00")).toBe(8.0);
  });

  test("22:30:30 → 06:30:30: 8h", () => {
    expect(deriveSleepHours("22:30:30", "06:30:30")).toBe(8.0);
  });
});

describe("deriveSleepHours — 境界値", () => {
  test("23:59 → 00:00: 0.02h 未満になるが丸めで 0 → null", () => {
    // 1分 = 0.0166... → Math.round(0.0166 * 10) / 10 = 0 → null
    expect(deriveSleepHours("23:59", "00:00")).toBeNull();
  });

  test("00:01 → 00:00: 23h59min = 23.98... → 丸めて 24.0h → 範囲外 → null", () => {
    // bed=1min, weighIn=0min → 0 <= 1 → adjustedWeighIn = 0 + 1440 = 1440
    // diff = (1440 - 1) / 60 = 23.983... → Math.round(239.83) / 10 = 24.0 → null
    expect(deriveSleepHours("00:01", "00:00")).toBeNull();
  });
});
