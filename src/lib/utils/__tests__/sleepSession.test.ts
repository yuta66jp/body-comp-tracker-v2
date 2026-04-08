/**
 * sleepSession.ts — ユニットテスト (#515)
 *
 * buildSleepSessionDatetimes / calcSleepDurationHours の検証。
 *
 * canonical ケース (wake_date = 2026-04-08):
 *   前日夜就寝  : bed=23:30, wake=07:00 → 前日日付 → 7.5h
 *   当日深夜就寝: bed=01:00, wake=08:00 → 当日日付 → 7.0h
 *   早朝就寝    : bed=04:00, wake=10:00 → 当日日付 → 6.0h
 *
 * 特殊ケース (wake_date = 2026-04-09):
 *   当日夜→翌日: bed=23:00, wake=08:00 → 前日日付 → 9.0h
 */

import { buildSleepSessionDatetimes, calcSleepDurationHours } from "../sleepSession";

// ════════════════════════════════════════════════════════════════════════════
// buildSleepSessionDatetimes
// ════════════════════════════════════════════════════════════════════════════

describe("buildSleepSessionDatetimes — canonical ケース", () => {
  const WAKE_DATE = "2026-04-08";

  test("前日夜就寝: bed=23:30, wake=07:00 → bed_date は前日 (2026-04-07)", () => {
    const result = buildSleepSessionDatetimes(WAKE_DATE, "23:30", "07:00");
    expect(result).not.toBeNull();
    expect(result!.bedAt).toBe("2026-04-07T23:30:00+09:00");
    expect(result!.wakeAt).toBe("2026-04-08T07:00:00+09:00");
  });

  test("当日深夜就寝: bed=01:00, wake=08:00 → bed_date は当日 (2026-04-08)", () => {
    const result = buildSleepSessionDatetimes(WAKE_DATE, "01:00", "08:00");
    expect(result).not.toBeNull();
    expect(result!.bedAt).toBe("2026-04-08T01:00:00+09:00");
    expect(result!.wakeAt).toBe("2026-04-08T08:00:00+09:00");
  });

  test("早朝就寝: bed=04:00, wake=10:00 → bed_date は当日 (2026-04-08)", () => {
    const result = buildSleepSessionDatetimes(WAKE_DATE, "04:00", "10:00");
    expect(result).not.toBeNull();
    expect(result!.bedAt).toBe("2026-04-08T04:00:00+09:00");
    expect(result!.wakeAt).toBe("2026-04-08T10:00:00+09:00");
  });
});

describe("buildSleepSessionDatetimes — 翌日起床のケース", () => {
  test("当日夜 23:00 就寝 → 翌日 (2026-04-09) の wake_date として記録した場合", () => {
    // ユーザーは 2026-04-09 の朝に入力する: 昨夜 23:00 就寝、今朝 08:00 起床
    const result = buildSleepSessionDatetimes("2026-04-09", "23:00", "08:00");
    expect(result).not.toBeNull();
    // "23:00" > "08:00" → bed_date = 2026-04-08
    expect(result!.bedAt).toBe("2026-04-08T23:00:00+09:00");
    expect(result!.wakeAt).toBe("2026-04-09T08:00:00+09:00");
  });
});

describe("buildSleepSessionDatetimes — 境界値", () => {
  test("bed_time = wake_time → 日またぎ判定なし → 同日 (00:00 → 00:00 は边境)", () => {
    // "00:00" <= "00:00" → 当日就寝
    const result = buildSleepSessionDatetimes("2026-04-08", "00:00", "00:00");
    expect(result).not.toBeNull();
    expect(result!.bedAt).toBe("2026-04-08T00:00:00+09:00");
    expect(result!.wakeAt).toBe("2026-04-08T00:00:00+09:00");
    // duration = 0 なので calcSleepDurationHours で null になる
  });

  test("just after midnight bed: bed=00:01, wake=07:00 → 当日 (00:01 < 07:00)", () => {
    const result = buildSleepSessionDatetimes("2026-04-08", "00:01", "07:00");
    expect(result).not.toBeNull();
    expect(result!.bedAt).toBe("2026-04-08T00:01:00+09:00");
    expect(result!.wakeAt).toBe("2026-04-08T07:00:00+09:00");
  });

  test("bed=23:59, wake=00:01 → bed_date は前日", () => {
    const result = buildSleepSessionDatetimes("2026-04-08", "23:59", "00:01");
    expect(result).not.toBeNull();
    expect(result!.bedAt).toBe("2026-04-07T23:59:00+09:00");
    expect(result!.wakeAt).toBe("2026-04-08T00:01:00+09:00");
  });
});

describe("buildSleepSessionDatetimes — バリデーション", () => {
  test("wake_date が不正な形式 → null", () => {
    expect(buildSleepSessionDatetimes("2026/04/08", "23:00", "07:00")).toBeNull();
  });

  test("wake_date が存在しない日付 → null", () => {
    expect(buildSleepSessionDatetimes("2026-02-30", "23:00", "07:00")).toBeNull();
  });

  test("bed_time が HH:MM 形式でない → null", () => {
    expect(buildSleepSessionDatetimes("2026-04-08", "23:0", "07:00")).toBeNull();
    expect(buildSleepSessionDatetimes("2026-04-08", "invalid", "07:00")).toBeNull();
  });

  test("wake_time が HH:MM 形式でない → null", () => {
    expect(buildSleepSessionDatetimes("2026-04-08", "23:00", "7:00")).toBeNull();
  });

  test("bed_time の時が範囲外 (24:00) → null", () => {
    expect(buildSleepSessionDatetimes("2026-04-08", "24:00", "07:00")).toBeNull();
  });

  test("bed_time の分が範囲外 (23:60) → null", () => {
    expect(buildSleepSessionDatetimes("2026-04-08", "23:60", "07:00")).toBeNull();
  });

  test("空文字 → null", () => {
    expect(buildSleepSessionDatetimes("", "23:00", "07:00")).toBeNull();
    expect(buildSleepSessionDatetimes("2026-04-08", "", "07:00")).toBeNull();
    expect(buildSleepSessionDatetimes("2026-04-08", "23:00", "")).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// calcSleepDurationHours
// ════════════════════════════════════════════════════════════════════════════

describe("calcSleepDurationHours — canonical ケース (TIMESTAMPTZ 文字列)", () => {
  test("前日夜就寝: 2026-04-07T23:30+09 → 2026-04-08T07:00+09 → 7.5h", () => {
    expect(
      calcSleepDurationHours("2026-04-07T23:30:00+09:00", "2026-04-08T07:00:00+09:00")
    ).toBe(7.5);
  });

  test("当日深夜就寝: 2026-04-08T01:00+09 → 2026-04-08T08:00+09 → 7.0h", () => {
    expect(
      calcSleepDurationHours("2026-04-08T01:00:00+09:00", "2026-04-08T08:00:00+09:00")
    ).toBe(7.0);
  });

  test("早朝就寝: 2026-04-08T04:00+09 → 2026-04-08T10:00+09 → 6.0h", () => {
    expect(
      calcSleepDurationHours("2026-04-08T04:00:00+09:00", "2026-04-08T10:00:00+09:00")
    ).toBe(6.0);
  });

  test("当日夜→翌日: 2026-04-08T23:00+09 → 2026-04-09T08:00+09 → 9.0h", () => {
    expect(
      calcSleepDurationHours("2026-04-08T23:00:00+09:00", "2026-04-09T08:00:00+09:00")
    ).toBe(9.0);
  });
});

describe("calcSleepDurationHours — 小数点丸め", () => {
  test("7h 20min → 7.3h", () => {
    expect(
      calcSleepDurationHours("2026-04-07T23:00:00+09:00", "2026-04-08T06:20:00+09:00")
    ).toBe(7.3);
  });

  test("7h 40min → 7.7h", () => {
    expect(
      calcSleepDurationHours("2026-04-07T23:00:00+09:00", "2026-04-08T06:40:00+09:00")
    ).toBe(7.7);
  });
});

describe("calcSleepDurationHours — 異常値 (null を返す)", () => {
  test("同一時刻 → diffMs = 0 → null", () => {
    expect(
      calcSleepDurationHours("2026-04-08T07:00:00+09:00", "2026-04-08T07:00:00+09:00")
    ).toBeNull();
  });

  test("wake < bed (逆順) → diffMs < 0 → null", () => {
    expect(
      calcSleepDurationHours("2026-04-08T08:00:00+09:00", "2026-04-08T07:00:00+09:00")
    ).toBeNull();
  });

  test("24h 以上 → null", () => {
    // 25h
    expect(
      calcSleepDurationHours("2026-04-07T07:00:00+09:00", "2026-04-08T08:00:00+09:00")
    ).toBeNull();
  });

  test("不正な文字列 → null", () => {
    expect(calcSleepDurationHours("invalid", "2026-04-08T07:00:00+09:00")).toBeNull();
    expect(calcSleepDurationHours("2026-04-07T23:00:00+09:00", "invalid")).toBeNull();
  });

  test("空文字 → null", () => {
    expect(calcSleepDurationHours("", "2026-04-08T07:00:00+09:00")).toBeNull();
  });
});

describe("calcSleepDurationHours — buildSleepSessionDatetimes との結合", () => {
  test("前日夜就寝 (canonical) で組み立てた TIMESTAMPTZ → 7.5h", () => {
    const dt = buildSleepSessionDatetimes("2026-04-08", "23:30", "07:00");
    expect(dt).not.toBeNull();
    expect(calcSleepDurationHours(dt!.bedAt, dt!.wakeAt)).toBe(7.5);
  });

  test("当日深夜就寝 (canonical) で組み立てた TIMESTAMPTZ → 7.0h", () => {
    const dt = buildSleepSessionDatetimes("2026-04-08", "01:00", "08:00");
    expect(dt).not.toBeNull();
    expect(calcSleepDurationHours(dt!.bedAt, dt!.wakeAt)).toBe(7.0);
  });

  test("早朝就寝 (canonical) で組み立てた TIMESTAMPTZ → 6.0h", () => {
    const dt = buildSleepSessionDatetimes("2026-04-08", "04:00", "10:00");
    expect(dt).not.toBeNull();
    expect(calcSleepDurationHours(dt!.bedAt, dt!.wakeAt)).toBe(6.0);
  });
});
