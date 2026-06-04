import {
  GOOGLE_HEALTH_POC_TARGETS,
  addDays,
  buildGoogleHealthDataPointsUrl,
  buildGoogleHealthFilter,
  fetchGoogleHealthPocTarget,
  getGoogleHealthAccessToken,
  getTodayDateInJst,
  resolveGoogleHealthPocRange,
} from "./poc";

const range = {
  startDate: "2026-05-01",
  endDate: "2026-05-31",
  endExclusiveDate: "2026-06-01",
};

describe("Google Health API PoC helpers", () => {
  it("対象 dataType のURLと日付フィルタを組み立てる", () => {
    const target = GOOGLE_HEALTH_POC_TARGETS.find((item) => item.key === "heartRateVariability")!;

    const url = new URL(buildGoogleHealthDataPointsUrl(target, range));

    expect(url.origin).toBe("https://health.googleapis.com");
    expect(url.pathname).toBe("/v4/users/me/dataTypes/daily-heart-rate-variability/dataPoints");
    expect(url.searchParams.get("pageSize")).toBe("100");
    expect(url.searchParams.get("filter")).toBe(
      'daily_heart_rate_variability.date >= "2026-05-01" AND daily_heart_rate_variability.date < "2026-06-01"',
    );
  });

  it("sleep は civil end time フィルタを使う", () => {
    const target = GOOGLE_HEALTH_POC_TARGETS.find((item) => item.key === "sleep")!;

    expect(buildGoogleHealthFilter(target, range)).toBe(
      'sleep.interval.civil_end_time >= "2026-05-01" AND sleep.interval.civil_end_time < "2026-06-01"',
    );
  });

  it("start/end 未指定時は直近30日をJST基準で返す", () => {
    const result = resolveGoogleHealthPocRange(new URLSearchParams(), "2026-06-04");

    expect(result).toEqual({
      ok: true,
      range: {
        startDate: "2026-05-06",
        endDate: "2026-06-04",
        endExclusiveDate: "2026-06-05",
      },
    });
  });

  it("不正な日付範囲を拒否する", () => {
    expect(resolveGoogleHealthPocRange(new URLSearchParams("start=2026/05/01&end=2026-05-31")).ok).toBe(false);
    expect(resolveGoogleHealthPocRange(new URLSearchParams("start=2026-06-01&end=2026-05-31")).ok).toBe(false);
    expect(resolveGoogleHealthPocRange(new URLSearchParams("start=2026-01-01&end=2026-05-31")).ok).toBe(false);
  });

  it("JST の今日を YYYY-MM-DD で返す", () => {
    expect(getTodayDateInJst(new Date("2026-06-03T15:30:00Z"))).toBe("2026-06-04");
  });

  it("日付加算で月境界を扱う", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("Authorization ヘッダーから Bearer token を取り出す", () => {
    const headers = new Headers({ Authorization: "Bearer google-access-token" });

    expect(getGoogleHealthAccessToken(headers, {} as NodeJS.ProcessEnv)).toBe("google-access-token");
  });

  it("Authorization ヘッダーがなければ環境変数の token を使う", () => {
    expect(
      getGoogleHealthAccessToken(new Headers(), { GOOGLE_HEALTH_ACCESS_TOKEN: "env-token" } as NodeJS.ProcessEnv),
    ).toBe("env-token");
  });

  it("ページングして dataPoints を結合する", async () => {
    const target = GOOGLE_HEALTH_POC_TARGETS[0]!;
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dataPoints: [{ first: true }], nextPageToken: "next" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dataPoints: [{ second: true }], nextPageToken: "" }), { status: 200 }),
      );

    const result = await fetchGoogleHealthPocTarget({
      target,
      range,
      accessToken: "access-token",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pageCount).toBe(2);
      expect(result.dataPoints).toEqual([{ first: true }, { second: true }]);
      expect(result.nextPageToken).toBeNull();
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("pageToken=next");
  });

  it("Google Health API のエラーを dataType 単位で返す", async () => {
    const target = GOOGLE_HEALTH_POC_TARGETS[0]!;
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "insufficient scopes" } }), { status: 403 }),
    );

    const result = await fetchGoogleHealthPocTarget({
      target,
      range,
      accessToken: "access-token",
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      key: target.key,
      dataType: target.dataType,
      status: 403,
      message: "insufficient scopes",
    });
  });
});
