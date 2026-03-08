/**
 * career-logs Route Handler テスト
 *
 * @supabase/supabase-js と next/server を手動モックして
 * 実際の Supabase 接続なしでユニットテストを実行する。
 */

// --- モック定義 ---
const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

// Next.js の NextRequest / NextResponse を最小限モック
jest.mock("next/server", () => {
  class MockNextResponse {
    readonly body: unknown;
    readonly status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init);
    }
  }

  class MockNextRequest {
    private _body: unknown;
    constructor(body: unknown) {
      this._body = body;
    }
    async json() {
      return this._body;
    }
  }

  return {
    NextResponse: MockNextResponse,
    NextRequest: MockNextRequest,
  };
});

// ---

import { NextRequest } from "next/server";
import { POST, DELETE } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new (NextRequest as unknown as new (b: unknown) => NextRequest)(body);
}

// 環境変数を設定
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
});

beforeEach(() => {
  jest.clearAllMocks();

  // from().upsert() チェーンのデフォルト設定
  mockUpsert.mockResolvedValue({ error: null });
  mockDelete.mockReturnValue({ eq: mockEq });
  mockEq.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({
    upsert: mockUpsert,
    delete: mockDelete,
  });
});

// --- POST テスト ---
describe("POST /api/career-logs", () => {
  const validBody = {
    season: "2025_Test",
    target_date: "2025-11-01",
    log_date: "2025-10-01",
    weight: 65.0,
    note: "test note",
  };

  it("正常系: upsert が呼ばれ 200 を返す", async () => {
    const req = makeRequest(validBody);
    const res = await POST(req);
    expect((res as unknown as { status: number }).status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("career_logs");
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("正常系: note が null でも通る", async () => {
    const req = makeRequest({ ...validBody, note: null });
    const res = await POST(req);
    expect((res as unknown as { status: number }).status).toBe(200);
  });

  it("異常系: season が欠損している場合 400 を返す", async () => {
    const req = makeRequest({ ...validBody, season: "" });
    const res = await POST(req);
    expect((res as unknown as { status: number }).status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("異常系: weight が文字列の場合 400 を返す", async () => {
    const req = makeRequest({ ...validBody, weight: "65.0" });
    const res = await POST(req);
    expect((res as unknown as { status: number }).status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("異常系: weight が NaN (Infinity) の場合 400 を返す", async () => {
    const req = makeRequest({ ...validBody, weight: Infinity });
    const res = await POST(req);
    expect((res as unknown as { status: number }).status).toBe(400);
  });

  it("異常系: Supabase エラー時に 500 を返す", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "DB error" } });
    const req = makeRequest(validBody);
    const res = await POST(req);
    expect((res as unknown as { status: number }).status).toBe(500);
  });

  it("異常系: JSON パース失敗時に 400 を返す", async () => {
    const badReq = {
      json: async () => { throw new SyntaxError("Invalid JSON"); },
    } as unknown as NextRequest;
    const res = await POST(badReq);
    expect((res as unknown as { status: number }).status).toBe(400);
  });
});

// --- DELETE テスト ---
describe("DELETE /api/career-logs", () => {
  it("正常系: delete が呼ばれ 200 を返す", async () => {
    const req = makeRequest({ id: 42 });
    const res = await DELETE(req);
    expect((res as unknown as { status: number }).status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("career_logs");
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledWith("id", 42);
  });

  it("異常系: id が整数でない場合 400 を返す", async () => {
    const req = makeRequest({ id: "42" });
    const res = await DELETE(req);
    expect((res as unknown as { status: number }).status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("異常系: id が浮動小数点数の場合 400 を返す", async () => {
    const req = makeRequest({ id: 42.5 });
    const res = await DELETE(req);
    expect((res as unknown as { status: number }).status).toBe(400);
  });

  it("異常系: Supabase エラー時に 500 を返す", async () => {
    mockEq.mockResolvedValueOnce({ error: { message: "DB error" } });
    const req = makeRequest({ id: 1 });
    const res = await DELETE(req);
    expect((res as unknown as { status: number }).status).toBe(500);
  });
});
