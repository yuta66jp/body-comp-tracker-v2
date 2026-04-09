/**
 * sleepSession.ts — ユニットテスト (#515, #524)
 *
 * buildSleepSessionDatetimes / calcSleepDurationHours / extractJstHHMM の検証。
 *
 * canonical ケース (wake_date = 2026-04-08):
 *   前日夜就寝  : bed=23:30, wake=07:00 → 前日日付 → 7.5h
 *   当日深夜就寝: bed=01:00, wake=08:00 → 当日日付 → 7.0h
 *   早朝就寝    : bed=04:00, wake=10:00 → 当日日付 → 6.0h
 *
 * 特殊ケース (wake_date = 2026-04-09):
 *   当日夜→翌日: bed=23:00, wake=08:00 → 前日日付 → 9.0h
 *
 * #524 追加: extractJstHHMM — Supabase UTC 文字列からの JST HH:MM 復元
 */

import { buildSleepSessionDatetimes, calcSleepDurationHours, extractJstHHMM } from "../sleepSession";

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

// ════════════════════════════════════════════════════════════════════════════
// extractJstHHMM (#524 — Supabase UTC 返却値からの JST 時刻復元)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Supabase は TIMESTAMPTZ を UTC 形式で返す。
 * 例: bed_at を "2026-04-07T23:30:00+09:00" で保存しても
 *     取得時は "2026-04-07T14:30:00+00:00" (UTC) になる。
 * extractJstHHMM はその UTC 文字列を JST の HH:MM に正しく変換する。
 */
describe("extractJstHHMM — Supabase UTC 返却値からの JST 変換 (canonical ケース, #524)", () => {
  test("前日夜就寝 — UTC bed_at: 14:30+00 → JST 23:30", () => {
    // 保存値: "2026-04-07T23:30:00+09:00" → Supabase が返す UTC 形式
    expect(extractJstHHMM("2026-04-07T14:30:00+00:00")).toBe("23:30");
  });

  test("前日夜就寝 — UTC wake_at: 22:00+00 → JST 07:00", () => {
    // 保存値: "2026-04-08T07:00:00+09:00" → Supabase が返す UTC 形式
    expect(extractJstHHMM("2026-04-07T22:00:00+00:00")).toBe("07:00");
  });

  test("当日深夜就寝 — UTC bed_at: 15:00-1 (前日) → ではなく当日計算", () => {
    // 保存値: "2026-04-08T01:00:00+09:00" → UTC = "2026-04-07T16:00:00+00:00"
    // UTC 16:00 + 9h = 01:00 (翌日 JST だが時刻だけ見ると 01:00)
    expect(extractJstHHMM("2026-04-07T16:00:00+00:00")).toBe("01:00");
  });

  test("当日深夜就寝 — UTC wake_at: 2026-04-07T23:00+00 → JST 08:00", () => {
    // 保存値: "2026-04-08T08:00:00+09:00" → UTC = "2026-04-07T23:00:00+00:00"
    expect(extractJstHHMM("2026-04-07T23:00:00+00:00")).toBe("08:00");
  });

  test("早朝就寝 — UTC bed_at: 2026-04-07T19:00+00 → JST 04:00", () => {
    // 保存値: "2026-04-08T04:00:00+09:00" → UTC = "2026-04-07T19:00:00+00:00"
    expect(extractJstHHMM("2026-04-07T19:00:00+00:00")).toBe("04:00");
  });
});

describe("extractJstHHMM — Z suffix (別の UTC 表記)", () => {
  test("Z 付き UTC 文字列も正しく変換", () => {
    // "2026-04-07T14:30:00Z" = "2026-04-07T14:30:00+00:00"
    expect(extractJstHHMM("2026-04-07T14:30:00Z")).toBe("23:30");
  });

  test("Z 付き wake_at も正しく変換", () => {
    expect(extractJstHHMM("2026-04-07T22:00:00Z")).toBe("07:00");
  });
});

describe("extractJstHHMM — +09:00 付きで保存されていた場合も正しく動く", () => {
  test("+09:00 付き bed_at → 23:30", () => {
    // DB が +09:00 付きで返した場合 (レアケースだが対応必要)
    expect(extractJstHHMM("2026-04-07T23:30:00+09:00")).toBe("23:30");
  });

  test("+09:00 付き wake_at → 07:00", () => {
    expect(extractJstHHMM("2026-04-08T07:00:00+09:00")).toBe("07:00");
  });

  test("+09:00 付き 深夜就寝 → 01:00", () => {
    expect(extractJstHHMM("2026-04-08T01:00:00+09:00")).toBe("01:00");
  });
});

describe("extractJstHHMM — 日付またぎ (UTC 22:00〜UTC 14:59 が JST の翌日扱い)", () => {
  test("UTC 23:59 → JST 08:59 (日付またぎ)", () => {
    expect(extractJstHHMM("2026-04-07T23:59:00+00:00")).toBe("08:59");
  });

  test("UTC 00:00 → JST 09:00", () => {
    expect(extractJstHHMM("2026-04-08T00:00:00+00:00")).toBe("09:00");
  });

  test("UTC 14:59 → JST 23:59", () => {
    expect(extractJstHHMM("2026-04-08T14:59:00+00:00")).toBe("23:59");
  });

  test("UTC 15:00 → JST 翌 00:00 (日跨ぎ) → HH:MM は 00:00", () => {
    expect(extractJstHHMM("2026-04-07T15:00:00+00:00")).toBe("00:00");
  });
});

describe("extractJstHHMM — buildSleepSessionDatetimes との往復整合 (#524 再現ケース)", () => {
  /**
   * 再現ケース 1: 前日夜就寝
   * - 入力: wake_date=2026-04-08, bed=23:30, wake=07:00
   * - buildSleepSessionDatetimes → bed_at="2026-04-07T23:30:00+09:00"
   * - Supabase 保存後 UTC 形式で返却 → "2026-04-07T14:30:00+00:00"
   * - extractJstHHMM → "23:30" ← 入力と一致すること
   */
  test("再現ケース 1: 前日夜就寝 23:30/07:00 → 保存→復元で一致", () => {
    const dt = buildSleepSessionDatetimes("2026-04-08", "23:30", "07:00");
    expect(dt).not.toBeNull();
    // UTC に変換（Supabase が返す形式を模擬）
    const bedUtc = new Date(dt!.bedAt).toISOString().replace("Z", "+00:00");
    const wakeUtc = new Date(dt!.wakeAt).toISOString().replace("Z", "+00:00");
    // extractJstHHMM で復元
    expect(extractJstHHMM(bedUtc)).toBe("23:30");
    expect(extractJstHHMM(wakeUtc)).toBe("07:00");
  });

  /**
   * 再現ケース 2: 当日深夜就寝
   * - 入力: wake_date=2026-04-08, bed=03:30, wake=07:00
   * - buildSleepSessionDatetimes → bed_at="2026-04-08T03:30:00+09:00"
   * - Supabase 返却 UTC → "2026-04-07T18:30:00+00:00"
   * - extractJstHHMM → "03:30" ← 入力と一致すること
   */
  test("再現ケース 2: 当日深夜就寝 03:30/07:00 → 保存→復元で一致", () => {
    const dt = buildSleepSessionDatetimes("2026-04-08", "03:30", "07:00");
    expect(dt).not.toBeNull();
    const bedUtc = new Date(dt!.bedAt).toISOString().replace("Z", "+00:00");
    const wakeUtc = new Date(dt!.wakeAt).toISOString().replace("Z", "+00:00");
    expect(extractJstHHMM(bedUtc)).toBe("03:30");
    expect(extractJstHHMM(wakeUtc)).toBe("07:00");
  });
});

describe("extractJstHHMM — 不正入力", () => {
  test("空文字 → null", () => {
    expect(extractJstHHMM("")).toBeNull();
  });

  test("不正な文字列 → null", () => {
    expect(extractJstHHMM("invalid")).toBeNull();
    expect(extractJstHHMM("23:30")).toBeNull(); // ISO 8601 日付部分が欠落
  });

  test("数値のみ → null", () => {
    expect(extractJstHHMM("1234567890")).toBeNull();
  });
});
