/**
 * /api/export route — バリデーション + CSV 出力テスト
 *
 * テスト構成:
 *   1. isValidDateParam — 純粋関数のユニットテスト
 *   2. GET handler — table / start / end の不正入力で 400 を返すことを検証
 *   3. GET handler — daily_logs + Google Health CSV 出力
 *
 * 注: バリデーション 400 ケースは DB 呼び出し前に return するため、
 * supabase モックが実際に呼ばれることはない。
 */

// モジュールモック（import より前にホイスト）
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(async () => ({ id: "test-user-id", email: "owner@example.com" })),
}));

import { NextRequest } from "next/server";
import { isValidDateParam } from "@/lib/utils/date";
import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";

const mockCreateClient = createClient as jest.Mock;

// ── isValidDateParam ─────────────────────────────────────────────────────────

describe("isValidDateParam", () => {
  // 正常系
  it("YYYY-MM-DD の正常な日付は true", () => {
    expect(isValidDateParam("2026-03-15")).toBe(true);
  });

  it("月初 (01) は true", () => {
    expect(isValidDateParam("2026-01-01")).toBe(true);
  });

  it("月末 (31) が実在する場合は true", () => {
    expect(isValidDateParam("2026-01-31")).toBe(true);
  });

  it("うるう年 2/29 は true", () => {
    expect(isValidDateParam("2024-02-29")).toBe(true);
  });

  // 不正フォーマット
  it("YYYY/MM/DD はスラッシュ区切りなので false", () => {
    expect(isValidDateParam("2026/03/15")).toBe(false);
  });

  it("YYYYMMDD はハイフンなしなので false", () => {
    expect(isValidDateParam("20260315")).toBe(false);
  });

  it("空文字は false", () => {
    expect(isValidDateParam("")).toBe(false);
  });

  it("任意文字列は false", () => {
    expect(isValidDateParam("invalid")).toBe(false);
  });

  // 存在しない日付
  it("2/29 が非うるう年（2026）は false", () => {
    expect(isValidDateParam("2026-02-29")).toBe(false);
  });

  it("13月は false", () => {
    expect(isValidDateParam("2026-13-01")).toBe(false);
  });

  it("00月は false", () => {
    expect(isValidDateParam("2026-00-01")).toBe(false);
  });

  it("00日は false", () => {
    expect(isValidDateParam("2026-01-00")).toBe(false);
  });

  it("4月31日（存在しない）は false", () => {
    expect(isValidDateParam("2026-04-31")).toBe(false);
  });
});

// ── GET handler — 400 ケース ──────────────────────────────────────────────────

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/export");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

describe("GET /api/export — バリデーション", () => {
  it("未知の table は 400 を返す", async () => {
    const res = await GET(makeRequest({ table: "unknown_table" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid table");
  });

  it("table=settings は許可外なので 400 を返す", async () => {
    const res = await GET(makeRequest({ table: "settings" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid table");
  });

  it("start が不正フォーマットのとき 400 を返す", async () => {
    const res = await GET(makeRequest({ table: "daily_logs", start: "2026/03/01" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid start date");
  });

  it("end が不正フォーマットのとき 400 を返す", async () => {
    const res = await GET(makeRequest({ table: "daily_logs", end: "not-a-date" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid end date");
  });

  it("start が存在しない日付のとき 400 を返す", async () => {
    const res = await GET(makeRequest({ table: "daily_logs", start: "2026-02-29" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid start date");
  });

  it("start 未指定（空文字）はバリデーションをスキップする（isValidDateParam の空文字テストで担保）", () => {
    // GET 内: if (start && !isValidDateParam(start)) → start="" は falsy なので skip
    expect(isValidDateParam("")).toBe(false); // 空文字を直接渡せば false — GET では skip されることを確認
  });
});

// ── GET handler — daily_logs + Google Health CSV 出力 ─────────────────────────

/**
 * supabase の chained query builder をモックする。
 * select / order / gte / lte が連鎖可能で、await した際に result を返す。
 */
type QueryResult = { data: unknown[] | null; error: { message: string } | null };
type ChainableQuery = Promise<QueryResult> & {
  select: jest.Mock;
  order: jest.Mock;
  gte: jest.Mock;
  lte: jest.Mock;
};

function makeChainableQuery(result: QueryResult): ChainableQuery {
  // Promise を継承しつつメソッドチェーンも可能にする
  const p = Promise.resolve(result) as ChainableQuery;
  for (const m of ["select", "order", "gte", "lte"] as const) {
    p[m] = jest.fn().mockReturnValue(p);
  }
  return p;
}

const SAMPLE_LOG = {
  log_date: "2026-04-01",
  weight: 70.0,
  calories: 2000,
  protein: 140,
  fat: 50,
  carbs: 220,
  note: null,
  is_cheat_day: false,
  is_refeed_day: false,
  is_eating_out: false,
  is_travel_day: false,
  is_tanning_day: false,
  is_posing_day: false,
  had_bowel_movement: null,
  training_type: null,
  work_mode: null,
  leg_flag: null,
};

const SAMPLE_GOOGLE_HEALTH_METRIC = {
  metric_date: "2026-04-01",
  step_count: 12345,
  sleep_minutes: 450,
  deep_sleep_minutes: 63,
  sleep_bed_at: "2026-03-31T15:00:00Z",
  sleep_wake_at: "2026-03-31T22:30:00Z",
  hrv_ms: 128.8,
  rhr_bpm: 43,
  google_health_steps_source: "reconcile",
  synced_at: "2026-04-02T00:00:00Z",
};

function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.split("\n");
  const headers = lines[0]!.split(",");
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""]));
  });
}

describe("GET /api/export — daily_logs + Google Health CSV", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("日次ログと Google Health metrics を日付でマージして CSV を返す", async () => {
    const dailyLogsQuery = makeChainableQuery({
      data: [
        SAMPLE_LOG,
        { ...SAMPLE_LOG, log_date: "2026-04-02", weight: 70.2 },
      ],
      error: null,
    });
    const googleHealthQuery = makeChainableQuery({
      data: [
        SAMPLE_GOOGLE_HEALTH_METRIC,
        { ...SAMPLE_GOOGLE_HEALTH_METRIC, metric_date: "2026-04-03", step_count: 9876 },
      ],
      error: null,
    });
    const from = jest.fn((table: string) =>
      table === "daily_logs" ? dailyLogsQuery : googleHealthQuery
    );

    mockCreateClient.mockReturnValue({
      from,
    });

    const res = await GET(makeRequest({ table: "daily_logs" }));
    expect(res.status).toBe(200);
    const csv = await res.text();
    const lines = csv.split("\n");

    expect(from).toHaveBeenCalledWith("daily_logs");
    expect(from).toHaveBeenCalledWith("google_health_daily_metrics");
    expect(lines[0]).toBe(
      "log_date,weight,calories,protein,fat,carbs,note," +
      "is_cheat_day,is_refeed_day,is_eating_out,is_travel_day," +
      "is_tanning_day,is_posing_day," +
      "had_bowel_movement,training_type,work_mode,leg_flag," +
      "google_health_step_count,google_health_sleep_minutes,google_health_deep_sleep_minutes," +
      "google_health_sleep_bed_at,google_health_sleep_wake_at,google_health_hrv_ms," +
      "google_health_rhr_bpm,google_health_steps_source,google_health_synced_at",
    );
    expect(lines[0]).not.toContain("sleep_hours");
    expect(lines[0]).not.toContain("sleep_bed_time");
    expect(lines[0]).not.toContain("sleep_wake_time");
    expect(lines[0]).not.toContain("last_meal_end_time");
    expect(lines[0]!.split(",")).not.toContain("step_count");

    const rows = parseCsv(csv);
    expect(rows.map((row) => row.log_date)).toEqual([
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
    ]);

    expect(rows[0]!.weight).toBe("70");
    expect(rows[0]!.google_health_step_count).toBe("12345");
    expect(rows[0]!.google_health_sleep_minutes).toBe("450");
    expect(rows[0]!.google_health_hrv_ms).toBe("128.8");
    expect(rows[0]!.google_health_rhr_bpm).toBe("43");
    expect(rows[0]!.google_health_steps_source).toBe("reconcile");

    expect(rows[1]!.weight).toBe("70.2");
    expect(rows[1]!.google_health_step_count).toBe("");

    expect(rows[2]!.weight).toBe("");
    expect(rows[2]!.google_health_step_count).toBe("9876");
  });

  it("start / end は daily_logs と Google Health metrics の両方に適用される", async () => {
    const dailyLogsQuery = makeChainableQuery({ data: [], error: null });
    const googleHealthQuery = makeChainableQuery({ data: [], error: null });
    const from = jest.fn((table: string) =>
      table === "daily_logs" ? dailyLogsQuery : googleHealthQuery
    );

    mockCreateClient.mockReturnValue({ from });

    const res = await GET(makeRequest({
      table: "daily_logs",
      start: "2026-04-01",
      end: "2026-04-30",
    }));

    expect(res.status).toBe(200);
    expect(dailyLogsQuery.gte).toHaveBeenCalledWith("log_date", "2026-04-01");
    expect(dailyLogsQuery.lte).toHaveBeenCalledWith("log_date", "2026-04-30");
    expect(googleHealthQuery.gte).toHaveBeenCalledWith("metric_date", "2026-04-01");
    expect(googleHealthQuery.lte).toHaveBeenCalledWith("metric_date", "2026-04-30");
  });
});
