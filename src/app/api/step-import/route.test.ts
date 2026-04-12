/**
 * /api/step-import route テスト
 *
 * ## テスト構成
 *
 * 1. classifyRecords — 分類ロジックの単体テスト
 *    - 新規 / 上書き / スキップの正しい分類
 *    - preflight で使う件数と import で使う件数が同じ分類源から得られることを保証
 *
 * 2. POST handler (preflight) — 件数集計の正確性
 *    - newDays / overwriteDays / skippedDays が classifyRecords の結果と一致すること
 *
 * 3. POST handler (import) — 保存件数と実処理の整合
 *    - savedCount が toUpdate.length と一致すること（全更新成功時）
 *    - skippedCount が skippedRecords.length と一致すること（全更新成功時）
 *    - update エラー時に skippedCount に計上されること
 *    - upsert ではなく update を呼んでいること（INSERT 側制約を回避）
 *
 * ## モック方針
 * - supabase/server の createClient をモック
 * - makeMockSupabase() で select / update の両チェーンを統一管理する
 *   - select: from().select().gte().lte() → { data, error: null }
 *   - update: from().update().eq()        → { error: null | {...} }
 */

jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/cache/revalidate", () => ({ revalidateAfterDailyLogMutation: jest.fn() }));

import { NextRequest } from "next/server";
import { POST, classifyRecords } from "./route";
import { createClient } from "@/lib/supabase/server";
import type { StepRecord } from "./parsers";

const mockCreateClient = createClient as jest.Mock;

// ── モックヘルパー ────────────────────────────────────────────────────────────

/**
 * supabase クライアントのモックを生成する。
 *
 * from() → builder を返す。builder には select / update / upsert が生えており、
 *   - select().gte().lte() の await → { data: selectData, error: null }
 *   - update().eq()        の await → { error: updateError }
 * のように動作する。
 */
function makeMockSupabase(opts: {
  selectData: { log_date: string; step_count: number | null }[];
  updateError?: { message: string } | null;
}) {
  // select チェーン
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectChain: any = Object.assign(
    Promise.resolve({ data: opts.selectData, error: null }),
    {
      select: jest.fn().mockReturnThis(),
      gte:    jest.fn().mockReturnThis(),
      lte:    jest.fn().mockReturnThis(),
    },
  );

  // update チェーン（eq を持つ Promise）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateChain: any = Object.assign(
    Promise.resolve({ error: opts.updateError ?? null }),
    { eq: jest.fn().mockReturnThis() },
  );

  // builder: from() が返すオブジェクト
  const builder = {
    select: jest.fn().mockReturnValue(selectChain),
    update: jest.fn().mockReturnValue(updateChain),
    upsert: jest.fn(), // 呼ばれないことを確認するために用意
  };

  return {
    client: { from: jest.fn().mockReturnValue(builder) },
    builder,
    updateChain,
  };
}

function makeRequest(action: "preflight" | "import", csvText: string): NextRequest {
  const url = new URL(`http://localhost/api/step-import?action=${action}`);
  const formData = new FormData();
  formData.append("file", new Blob([csvText], { type: "text/csv" }), "daily_steps.csv");
  return new NextRequest(url.toString(), { method: "POST", body: formData });
}

const CSV_3ROWS = "date,step_count\n2024-01-01,8000\n2024-01-02,9000\n2024-01-03,7000";

// ── classifyRecords ───────────────────────────────────────────────────────────

describe("classifyRecords", () => {
  const records: StepRecord[] = [
    { date: "2024-01-01", stepCount: 8000 },
    { date: "2024-01-02", stepCount: 9000 },
    { date: "2024-01-03", stepCount: 7000 },
  ];

  it("新規 / 上書き / スキップを正しく分類する", () => {
    const existingMap = new Map<string, number | null>([
      ["2024-01-01", null],  // 既存行, step_count 未記録 → 新規書き込み
      ["2024-01-02", 5000],  // 既存行, step_count あり → 上書き
      // "2024-01-03" はなし → スキップ
    ]);
    const result = classifyRecords(records, existingMap);

    expect(result.toUpdate).toEqual([records[0], records[1]]);
    expect(result.newRecords).toEqual([records[0]]);
    expect(result.overwriteRecords).toEqual([records[1]]);
    expect(result.skippedRecords).toEqual([records[2]]);
  });

  it("全件 existingMap に存在する場合、skippedRecords は空", () => {
    const existingMap = new Map<string, number | null>([
      ["2024-01-01", null],
      ["2024-01-02", 100],
      ["2024-01-03", 200],
    ]);
    const result = classifyRecords(records, existingMap);

    expect(result.toUpdate).toHaveLength(3);
    expect(result.skippedRecords).toHaveLength(0);
  });

  it("existingMap が空の場合、全件スキップされる", () => {
    const result = classifyRecords(records, new Map());

    expect(result.toUpdate).toHaveLength(0);
    expect(result.skippedRecords).toEqual(records);
    expect(result.newRecords).toHaveLength(0);
    expect(result.overwriteRecords).toHaveLength(0);
  });

  it("records が空の場合、全フィールドが空配列", () => {
    const result = classifyRecords([], new Map([["2024-01-01", null]]));

    expect(result.toUpdate).toHaveLength(0);
    expect(result.skippedRecords).toHaveLength(0);
    expect(result.newRecords).toHaveLength(0);
    expect(result.overwriteRecords).toHaveLength(0);
  });

  it("preflight の newDays + overwriteDays = toUpdate.length（件数整合の保証）", () => {
    const existingMap = new Map<string, number | null>([
      ["2024-01-01", null],
      ["2024-01-02", 5000],
    ]);
    const result = classifyRecords(records, existingMap);

    expect(result.newRecords.length + result.overwriteRecords.length).toBe(result.toUpdate.length);
  });
});

// ── POST handler: preflight ──────────────────────────────────────────────────

describe("POST /api/step-import?action=preflight", () => {
  beforeEach(() => jest.clearAllMocks());

  it("newDays / overwriteDays / skippedDays / matchedDays を正しく返す", async () => {
    const { client } = makeMockSupabase({
      selectData: [
        { log_date: "2024-01-01", step_count: null },  // 新規書き込み対象
        { log_date: "2024-01-02", step_count: 5000 },  // 上書き対象
        // 2024-01-03 は daily_logs になし → スキップ
      ],
    });
    mockCreateClient.mockReturnValue(client);

    const res = await POST(makeRequest("preflight", CSV_3ROWS));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.totalDays).toBe(3);
    expect(body.newDays).toBe(1);
    expect(body.overwriteDays).toBe(1);
    expect(body.skippedDays).toBe(1);
    expect(body.matchedDays).toBe(2); // newDays + overwriteDays
  });
});

// ── POST handler: import ─────────────────────────────────────────────────────

describe("POST /api/step-import?action=import", () => {
  beforeEach(() => jest.clearAllMocks());

  it("全件更新成功: savedCount = toUpdate.length, skippedCount = skippedRecords.length", async () => {
    const { client } = makeMockSupabase({
      selectData: [
        { log_date: "2024-01-01", step_count: null },  // toUpdate に入る
        { log_date: "2024-01-02", step_count: 5000 },  // toUpdate に入る
        // 2024-01-03 はなし → skipped
      ],
      updateError: null,
    });
    mockCreateClient.mockReturnValue(client);

    const res = await POST(makeRequest("import", CSV_3ROWS));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.savedCount).toBe(2);   // 2024-01-01, 02 が更新成功
    expect(body.skippedCount).toBe(1); // 2024-01-03 は daily_logs になし
  });

  it("update エラー時は savedCount が減り skippedCount が増える", async () => {
    const { client } = makeMockSupabase({
      selectData: [
        { log_date: "2024-01-01", step_count: null },  // toUpdate に入るが update 失敗
        // 2024-01-02, 03 はなし → skipped
      ],
      updateError: { message: "DB constraint violation" },
    });
    mockCreateClient.mockReturnValue(client);

    const res = await POST(makeRequest("import", CSV_3ROWS));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.savedCount).toBe(0);
    // skippedCount = 2（2024-01-02, 03 は daily_logs になし）+ 1（2024-01-01 の update エラー）
    expect(body.skippedCount).toBe(3);
  });

  it("update が呼ばれ upsert が呼ばれていない", async () => {
    const { client, builder } = makeMockSupabase({
      selectData: [{ log_date: "2024-01-01", step_count: null }],
    });
    mockCreateClient.mockReturnValue(client);

    const csv = "date,step_count\n2024-01-01,8000";
    await POST(makeRequest("import", csv));

    expect(builder.update).toHaveBeenCalledWith({ step_count: 8000 });
    expect(builder.upsert).not.toHaveBeenCalled();
  });

  it("update は対象日付ごとに eq('log_date', date) を呼ぶ", async () => {
    const { client, updateChain } = makeMockSupabase({
      selectData: [
        { log_date: "2024-01-01", step_count: null },
        { log_date: "2024-01-02", step_count: 5000 },
      ],
    });
    mockCreateClient.mockReturnValue(client);

    await POST(makeRequest("import", CSV_3ROWS));

    // 2件の update に対して eq が呼ばれていること
    expect(updateChain.eq).toHaveBeenCalledWith("log_date", "2024-01-01");
    expect(updateChain.eq).toHaveBeenCalledWith("log_date", "2024-01-02");
    expect(updateChain.eq).toHaveBeenCalledTimes(2);
  });

  it("ファイル内の有効行が 0 件 → 400 を返す", async () => {
    mockCreateClient.mockReturnValue({ from: jest.fn() });

    const url = new URL("http://localhost/api/step-import?action=import");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["date,step_count\n"], { type: "text/csv" }),
      "daily_steps.csv",
    );
    const req = new NextRequest(url.toString(), { method: "POST", body: formData });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("preflight と import で同じ分類ロジックを使うため件数が一致する（回帰テスト）", async () => {
    // preflight で返す件数と、import で savedCount + skippedCount(fromUpdate) の合計が一致することを確認
    const selectData = [
      { log_date: "2024-01-01", step_count: null },
      { log_date: "2024-01-02", step_count: 5000 },
    ];

    // preflight
    const { client: pClient } = makeMockSupabase({ selectData });
    mockCreateClient.mockReturnValue(pClient);
    const preflightRes = await POST(makeRequest("preflight", CSV_3ROWS));
    const preflightBody = await preflightRes.json();

    // import
    const { client: iClient } = makeMockSupabase({ selectData, updateError: null });
    mockCreateClient.mockReturnValue(iClient);
    const importRes = await POST(makeRequest("import", CSV_3ROWS));
    const importBody = await importRes.json();

    // preflight の matchedDays = import の savedCount（全更新成功時）
    expect(importBody.savedCount).toBe(preflightBody.matchedDays);
    // preflight の skippedDays = import の skippedCount（全更新成功時）
    expect(importBody.skippedCount).toBe(preflightBody.skippedDays);
  });
});
