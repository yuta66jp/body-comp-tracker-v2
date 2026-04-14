import {
  bedTimeToMinutes,
  wakeTimeToMinutes,
  minutesToHHMM,
  medianOf,
  calcMonthlySleepStats,
  formatSleepLine1,
  formatSleepLine2,
} from "../calcMonthlySleepStats";

// ── bedTimeToMinutes ──────────────────────────────────────────────────────────

describe("bedTimeToMinutes", () => {
  test("23:00 → 1380 (補正なし)", () => {
    expect(bedTimeToMinutes("23:00")).toBe(23 * 60);
  });

  test("00:30 → 1470 (0時台 → +24h 補正)", () => {
    expect(bedTimeToMinutes("00:30")).toBe(30 + 24 * 60);
  });

  test("01:00 → 1500 (1時台 → +24h 補正)", () => {
    expect(bedTimeToMinutes("01:00")).toBe(60 + 24 * 60);
  });

  test("12:00 が境界: 12:00 → 720 (補正なし)", () => {
    // NOON_MINUTES = 720。>= 720 は補正なし
    expect(bedTimeToMinutes("12:00")).toBe(720);
  });

  test("11:59 は補正対象: 11:59 → 719 + 1440", () => {
    expect(bedTimeToMinutes("11:59")).toBe(11 * 60 + 59 + 24 * 60);
  });

  test("不正な形式は null", () => {
    expect(bedTimeToMinutes("abc")).toBeNull();
    expect(bedTimeToMinutes("25:00")).toBeNull();
    expect(bedTimeToMinutes("12:60")).toBeNull();
    expect(bedTimeToMinutes("")).toBeNull();
  });
});

// ── wakeTimeToMinutes ─────────────────────────────────────────────────────────

describe("wakeTimeToMinutes", () => {
  test("07:00 → 420", () => {
    expect(wakeTimeToMinutes("07:00")).toBe(7 * 60);
  });

  test("00:00 → 0 (補正なし)", () => {
    expect(wakeTimeToMinutes("00:00")).toBe(0);
  });

  test("不正な形式は null", () => {
    expect(wakeTimeToMinutes("abc")).toBeNull();
    expect(wakeTimeToMinutes("25:00")).toBeNull();
  });
});

// ── minutesToHHMM ─────────────────────────────────────────────────────────────

describe("minutesToHHMM", () => {
  test("420 → '07:00'", () => {
    expect(minutesToHHMM(420)).toBe("07:00");
  });

  test("1440 + 30 → '00:30' (24h 超 mod 処理)", () => {
    expect(minutesToHHMM(1440 + 30)).toBe("00:30");
  });

  test("0 → '00:00'", () => {
    expect(minutesToHHMM(0)).toBe("00:00");
  });

  test("1439 → '23:59'", () => {
    expect(minutesToHHMM(1439)).toBe("23:59");
  });
});

// ── medianOf ──────────────────────────────────────────────────────────────────

describe("medianOf", () => {
  test("空配列は null", () => {
    expect(medianOf([])).toBeNull();
  });

  test("奇数個: [1, 3, 5] → 3", () => {
    expect(medianOf([1, 3, 5])).toBe(3);
  });

  test("偶数個: [1, 3] → 2", () => {
    expect(medianOf([1, 3])).toBe(2);
  });

  test("未ソートでも正しい中央値を返す: [5, 1, 3] → 3", () => {
    expect(medianOf([5, 1, 3])).toBe(3);
  });

  test("要素が 1 個: [7] → 7", () => {
    expect(medianOf([7])).toBe(7);
  });
});

// ── calcMonthlySleepStats ─────────────────────────────────────────────────────

/** JST 時刻を TIMESTAMPTZ 文字列に変換するヘルパー (テスト用) */
function jstToTZ(dateTime: string): string {
  // "2026-03-01 23:30" → "2026-03-01T23:30:00+09:00"
  return `${dateTime.replace(" ", "T")}:00+09:00`;
}

type SessionArg = {
  wake_date: string;
  bed_at: string;  // JST HH:MM（テスト内部で TIMESTAMPTZ に変換）
  wake_at: string; // JST HH:MM
  bed_date?: string; // bed_at の日付。省略時は wake_date の前日
};

function makeSession(s: SessionArg) {
  const bedDate = s.bed_date ?? s.wake_date.slice(0, 7) + "-" + String(
    parseInt(s.wake_date.slice(8)) - 1
  ).padStart(2, "0");
  return {
    wake_date: s.wake_date,
    bed_at:    jstToTZ(`${bedDate} ${s.bed_at}`),
    wake_at:   jstToTZ(`${s.wake_date} ${s.wake_at}`),
  };
}

describe("calcMonthlySleepStats", () => {
  const noWorkModeMap = new Map<string, string | null>();

  test("セッションが空の場合は全て null を返す", () => {
    const result = calcMonthlySleepStats([], noWorkModeMap);
    expect(result.avgSleepHours).toBeNull();
    expect(result.avgByWorkMode.office).toBeNull();
    expect(result.avgByWorkMode.remote).toBeNull();
    expect(result.avgByWorkMode.off).toBeNull();
    expect(result.medianBedTime).toBeNull();
    expect(result.medianWakeTime).toBeNull();
  });

  test("平均睡眠時間が正しく計算される (小数点1桁)", () => {
    // 23:00 → 07:00 = 8h, 00:00 → 06:00 = 6h → 平均 7.0h
    const sessions = [
      makeSession({ wake_date: "2026-03-01", bed_at: "23:00", wake_at: "07:00", bed_date: "2026-02-28" }),
      makeSession({ wake_date: "2026-03-02", bed_at: "00:00", wake_at: "06:00", bed_date: "2026-03-01" }),
    ];
    const result = calcMonthlySleepStats(sessions, noWorkModeMap);
    expect(result.avgSleepHours).toBe(7.0);
  });

  test("勤務形態別平均睡眠時間が計算される", () => {
    // office: 23:00→07:00 = 8h, remote: 00:00→07:30 = 7.5h, off: 22:00→07:00 = 9h
    const sessions = [
      makeSession({ wake_date: "2026-03-01", bed_at: "23:00", wake_at: "07:00", bed_date: "2026-02-28" }),
      makeSession({ wake_date: "2026-03-02", bed_at: "00:00", wake_at: "07:30", bed_date: "2026-03-01" }),
      makeSession({ wake_date: "2026-03-03", bed_at: "22:00", wake_at: "07:00", bed_date: "2026-03-02" }),
    ];
    const workModeMap = new Map<string, string | null>([
      ["2026-03-01", "office"],
      ["2026-03-02", "remote"],
      ["2026-03-03", "off"],
    ]);
    const result = calcMonthlySleepStats(sessions, workModeMap);
    expect(result.avgByWorkMode.office).toBe(8.0);
    expect(result.avgByWorkMode.remote).toBe(7.5);
    expect(result.avgByWorkMode.off).toBe(9.0);
  });

  test("work_mode が null の日は勤務形態別集計から除外される", () => {
    const sessions = [
      makeSession({ wake_date: "2026-03-01", bed_at: "23:00", wake_at: "07:00", bed_date: "2026-02-28" }),
    ];
    const workModeMap = new Map<string, string | null>([["2026-03-01", null]]);
    const result = calcMonthlySleepStats(sessions, workModeMap);
    expect(result.avgByWorkMode.office).toBeNull();
    expect(result.avgByWorkMode.remote).toBeNull();
    expect(result.avgByWorkMode.off).toBeNull();
    // 全体平均は計算される
    expect(result.avgSleepHours).toBe(8.0);
  });

  test("就寝時刻の中央値が日跨ぎ補正で正しく計算される", () => {
    // 23:30 と 01:00 (補正後 25:00) の中央値 → (23:30 + 25:00) / 2 = 24:15 → 00:15
    const sessions = [
      makeSession({ wake_date: "2026-03-01", bed_at: "23:30", wake_at: "07:00", bed_date: "2026-02-28" }),
      makeSession({ wake_date: "2026-03-02", bed_at: "01:00", wake_at: "07:00", bed_date: "2026-03-01" }),
    ];
    const result = calcMonthlySleepStats(sessions, noWorkModeMap);
    expect(result.medianBedTime).toBe("00:15");
  });

  test("起床時刻の中央値が計算される", () => {
    // 06:00 と 08:00 の中央値 → 07:00
    const sessions = [
      makeSession({ wake_date: "2026-03-01", bed_at: "23:00", wake_at: "06:00", bed_date: "2026-02-28" }),
      makeSession({ wake_date: "2026-03-02", bed_at: "23:00", wake_at: "08:00", bed_date: "2026-03-01" }),
    ];
    const result = calcMonthlySleepStats(sessions, noWorkModeMap);
    expect(result.medianWakeTime).toBe("07:00");
  });

  test("1セッションのみでも計算できる", () => {
    // 23:00→07:00 = 8h
    const sessions = [
      makeSession({ wake_date: "2026-03-01", bed_at: "23:00", wake_at: "07:00", bed_date: "2026-02-28" }),
    ];
    const result = calcMonthlySleepStats(sessions, noWorkModeMap);
    expect(result.avgSleepHours).toBe(8.0);
    expect(result.medianBedTime).toBe("23:00");
    expect(result.medianWakeTime).toBe("07:00");
  });
});

// ── formatSleepLine1 / formatSleepLine2 ────────────────────────────────────────

describe("formatSleepLine1", () => {
  test("avgSleepHours が null なら null を返す", () => {
    const stats = {
      avgSleepHours: null,
      avgByWorkMode: { office: null, remote: null, off: null },
      medianBedTime: null,
      medianWakeTime: null,
    };
    expect(formatSleepLine1(stats)).toBeNull();
  });

  test("勤務形態別が全て null なら括弧なし", () => {
    const stats = {
      avgSleepHours: 7.0,
      avgByWorkMode: { office: null, remote: null, off: null },
      medianBedTime: null,
      medianWakeTime: null,
    };
    expect(formatSleepLine1(stats)).toBe("睡眠 7.0h");
  });

  test("3形態全て揃う場合の書式", () => {
    const stats = {
      avgSleepHours: 6.8,
      avgByWorkMode: { office: 6.1, remote: 7.0, off: 7.8 },
      medianBedTime: null,
      medianWakeTime: null,
    };
    expect(formatSleepLine1(stats)).toBe("睡眠 6.8h（出6.1 / 在7.0 / 休7.8）");
  });

  test("一部の形態のみある場合は該当する値だけ表示", () => {
    const stats = {
      avgSleepHours: 7.5,
      avgByWorkMode: { office: 6.5, remote: null, off: null },
      medianBedTime: null,
      medianWakeTime: null,
    };
    expect(formatSleepLine1(stats)).toBe("睡眠 7.5h（出6.5）");
  });
});

describe("formatSleepLine2", () => {
  test("両方 null なら null を返す", () => {
    const stats = {
      avgSleepHours: null,
      avgByWorkMode: { office: null, remote: null, off: null },
      medianBedTime: null,
      medianWakeTime: null,
    };
    expect(formatSleepLine2(stats)).toBeNull();
  });

  test("就寝・起床の両方がある場合の書式", () => {
    const stats = {
      avgSleepHours: 7.0,
      avgByWorkMode: { office: null, remote: null, off: null },
      medianBedTime: "00:34",
      medianWakeTime: "07:18",
    };
    expect(formatSleepLine2(stats)).toBe("就 00:34 / 起 07:18");
  });

  test("就寝のみある場合", () => {
    const stats = {
      avgSleepHours: null,
      avgByWorkMode: { office: null, remote: null, off: null },
      medianBedTime: "23:45",
      medianWakeTime: null,
    };
    expect(formatSleepLine2(stats)).toBe("就 23:45");
  });

  test("起床のみある場合", () => {
    const stats = {
      avgSleepHours: null,
      avgByWorkMode: { office: null, remote: null, off: null },
      medianBedTime: null,
      medianWakeTime: "06:30",
    };
    expect(formatSleepLine2(stats)).toBe("起 06:30");
  });
});
