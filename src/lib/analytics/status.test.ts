import {
  getAnalyticsAvailability,
  getEnrichedLogsAvailability,
  getXgboostAvailability,
  errorAvailability,
  unavailableAvailability,
} from "./status";

describe("getAnalyticsAvailability", () => {
  // ── unavailable ──────────────────────────────────────────────────────────

  it("cacheUpdatedAt が null → unavailable", () => {
    const r = getAnalyticsAvailability(null, "2026-03-14");
    expect(r.status).toBe("unavailable");
    expect(r.lastUpdatedDate).toBeNull();
    expect(r.staleDays).toBeNull();
  });

  it("cacheUpdatedAt も latestRawLogDate も null → unavailable", () => {
    const r = getAnalyticsAvailability(null, null);
    expect(r.status).toBe("unavailable");
  });

  // ── fresh ─────────────────────────────────────────────────────────────────

  it("latestRawLogDate が null (ログなし) → fresh", () => {
    const r = getAnalyticsAvailability("2026-03-14T12:00:00Z", null);
    expect(r.status).toBe("fresh");
    expect(r.lastUpdatedDate).toBe("2026-03-14");
    expect(r.staleDays).toBeNull();
  });

  it("cacheUpdatedAt 日付 == latestRawLogDate → fresh", () => {
    const r = getAnalyticsAvailability("2026-03-14T00:00:00Z", "2026-03-14");
    expect(r.status).toBe("fresh");
    expect(r.staleDays).toBeNull();
  });

  it("cacheUpdatedAt 日付 > latestRawLogDate → fresh", () => {
    const r = getAnalyticsAvailability("2026-03-15T00:00:00Z", "2026-03-14");
    expect(r.status).toBe("fresh");
  });

  // ── stale ─────────────────────────────────────────────────────────────────

  it("cacheUpdatedAt 日付 < latestRawLogDate → stale", () => {
    const r = getAnalyticsAvailability("2026-03-12T00:00:00Z", "2026-03-14");
    expect(r.status).toBe("stale");
    expect(r.lastUpdatedDate).toBe("2026-03-12");
    expect(r.staleDays).toBe(2);
  });

  it("1日だけ古い → stale / staleDays = 1", () => {
    const r = getAnalyticsAvailability("2026-03-13T23:59:59Z", "2026-03-14");
    expect(r.status).toBe("stale");
    expect(r.staleDays).toBe(1);
  });

  it("stale のとき staleDays が 1 以上", () => {
    const r = getAnalyticsAvailability("2026-03-01T00:00:00Z", "2026-03-14");
    expect(r.status).toBe("stale");
    expect(r.staleDays).toBeGreaterThanOrEqual(1);
  });

  // ── ISO 8601 パース ──────────────────────────────────────────────────────

  it("ISO 8601 timestamp から日付部分のみ抽出される", () => {
    const r = getAnalyticsAvailability("2026-03-10T23:59:59.000Z", "2026-03-12");
    expect(r.lastUpdatedDate).toBe("2026-03-10");
    expect(r.status).toBe("stale");
  });

  it("タイムゾーンオフセット付き → 日付部分のみ抽出される", () => {
    const r = getAnalyticsAvailability("2026-03-10T12:00:00+09:00", "2026-03-12");
    expect(r.lastUpdatedDate).toBe("2026-03-10");
  });
});

// ─── ヘルパー関数 ─────────────────────────────────────────────────────────────

describe("unavailableAvailability", () => {
  it("status = unavailable、他フィールドは null", () => {
    const r = unavailableAvailability();
    expect(r.status).toBe("unavailable");
    expect(r.lastUpdatedDate).toBeNull();
    expect(r.staleDays).toBeNull();
  });
});

describe("errorAvailability", () => {
  it("status = error、他フィールドは null", () => {
    const r = errorAvailability();
    expect(r.status).toBe("error");
    expect(r.lastUpdatedDate).toBeNull();
    expect(r.staleDays).toBeNull();
  });
});

// ─── 用途別ラッパー ────────────────────────────────────────────────────────────

describe("getEnrichedLogsAvailability", () => {
  it("getAnalyticsAvailability と同じ判定を返す（fresh）", () => {
    const r = getEnrichedLogsAvailability("2026-03-14T00:00:00Z", "2026-03-14");
    expect(r.status).toBe("fresh");
  });

  it("cacheUpdatedAt が null → unavailable", () => {
    const r = getEnrichedLogsAvailability(null, "2026-03-14");
    expect(r.status).toBe("unavailable");
  });

  it("stale 判定が伝播する", () => {
    const r = getEnrichedLogsAvailability("2026-03-12T00:00:00Z", "2026-03-14");
    expect(r.status).toBe("stale");
    expect(r.staleDays).toBe(2);
  });
});

describe("getXgboostAvailability", () => {
  it("getAnalyticsAvailability と同じ判定を返す（fresh）", () => {
    const r = getXgboostAvailability("2026-03-14T00:00:00Z", "2026-03-14");
    expect(r.status).toBe("fresh");
  });

  it("cacheUpdatedAt が null → unavailable", () => {
    const r = getXgboostAvailability(null, "2026-03-14");
    expect(r.status).toBe("unavailable");
  });

  it("stale 判定が伝播する", () => {
    const r = getXgboostAvailability("2026-03-10T00:00:00Z", "2026-03-14");
    expect(r.status).toBe("stale");
    expect(r.staleDays).toBe(4);
  });
});
