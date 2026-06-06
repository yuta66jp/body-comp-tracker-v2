import {
  formatGoogleHealthDailyMetricLine,
  formatMinutesAsHoursMinutes,
  metricMinutesToHours,
  type GoogleHealthDailyMetricForDisplay,
} from "./displayMetrics";

function makeMetric(
  overrides: Partial<GoogleHealthDailyMetricForDisplay> = {},
): GoogleHealthDailyMetricForDisplay {
  return {
    metric_date: "2026-06-04",
    step_count: null,
    sleep_minutes: null,
    deep_sleep_minutes: null,
    sleep_bed_at: null,
    sleep_wake_at: null,
    hrv_ms: null,
    rhr_bpm: null,
    ...overrides,
  };
}

describe("googleHealth displayMetrics", () => {
  test("minutes を 直近ログ用の h/m 表示に変換する", () => {
    expect(formatMinutesAsHoursMinutes(450)).toBe("7h30m");
    expect(formatMinutesAsHoursMinutes(60)).toBe("1h");
    expect(formatMinutesAsHoursMinutes(45)).toBe("45m");
    expect(formatMinutesAsHoursMinutes(null)).toBeNull();
  });

  test("minutes をカレンダー・月次用の時間数に変換する", () => {
    expect(metricMinutesToHours(336)).toBe(5.6);
    expect(metricMinutesToHours(null)).toBeNull();
  });

  test("Google Health の日次表示行を組み立てる", () => {
    const line = formatGoogleHealthDailyMetricLine(makeMetric({
      step_count: 12345,
      sleep_minutes: 450,
      deep_sleep_minutes: 63,
      hrv_ms: 128.8,
      rhr_bpm: 43,
    }));

    expect(line).toBe("歩数 12,345歩 / 睡眠 7h30m / 深睡眠 1h03m / HRV 128.8ms / 安静時 43bpm");
  });

  test("値がない場合は 0 ではなくデータなし表示にする", () => {
    expect(formatGoogleHealthDailyMetricLine(makeMetric())).toBe("データなし");
    expect(formatGoogleHealthDailyMetricLine(null)).toBe("データなし");
  });
});
