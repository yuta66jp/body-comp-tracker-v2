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

// next/cache の revalidatePath をモック（テスト環境では静的生成ストアが存在しないため）
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
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
    private _secret: string | null;
    constructor(body: unknown, secret: string | null = null) {
      this._body = body;
      this._secret = secret;
    }
    async json() {
      return this._body;
    }
    headers = {
      get: (name: string): string | null => {
        if (name === "x-admin-secret") return this._secret;
        return null;
      },
    };
  }

  return {
    NextResponse: MockNextResponse,
    NextRequest: MockNextRequest,
  };
});

// ---

import { NextRequest } from "next/server";
import { POST, DELETE } from "../route";

const TEST_ADMIN_SECRET = "test-admin-secret";

function makeRequest(body: unknown, secret: string | null = TEST_ADMIN_SECRET): NextRequest {
  return new (NextRequest as unknown as new (b: unknown, s: string | null) => NextRequest)(body, secret);
}

/** headers.get を持つ最小限のリクエストオブジェクトを作成する */
function makeRawRequest(
  jsonFn: () => Promise<unknown>,
  secret: string | null = TEST_ADMIN_SECRET
): NextRequest {
  return {
    json: jsonFn,
    headers: { get: (name: string) => (name === "x-admin-secret" ? secret : null) },
  } as unknown as NextRequest;
}

// 環境変数を設定
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.ADMIN_SECRET = TEST_ADMIN_SECRET;
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

// --- 認証テスト ---
describe("認証チェック (POST)", () => {
  const validBody = {
    season: "2025_Test",
    target_date: "2025-11-01",
    log_date: "2025-10-01",
    weight: 65.0,
  };

  it("ADMIN_SECRET ヘッダーなし（null）のリクエスト → 401 を返す", async () => {
    const req = makeRequest(validBody, null);
    const res = await POST(req);
    expect((res as unknown as { status: number }).status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("間違った ADMIN_SECRET のリクエスト → 401 を返す", async () => {
    const req = makeRequest(validBody, "wrong-secret");
    const res = await POST(req);
    expect((res as unknown as { status: number }).status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("ADMIN_SECRET 未設定時はサーバーエラー → 500 を返す", async () => {
    const original = process.env.ADMIN_SECRET;
    delete process.env.ADMIN_SECRET;
    const req = makeRequest(validBody, TEST_ADMIN_SECRET);
    const res = await POST(req);
    expect((res as unknown as { status: number }).status).toBe(500);
    expect(mockUpsert).not.toHaveBeenCalled();
    process.env.ADMIN_SECRET = original;
  });

  it("正しい ADMIN_SECRET のリクエスト → 正常処理 (200) を返す", async () => {
    const req = makeRequest(validBody, TEST_ADMIN_SECRET);
    const res = await POST(req);
    expect((res as unknown as { status: number }).status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });
});

describe("認証チェック (DELETE)", () => {
  const validBody = { id: 1 };

  it("ADMIN_SECRET ヘッダーなし（null）のリクエスト → 401 を返す", async () => {
    const req = makeRequest(validBody, null);
    const res = await DELETE(req);
    expect((res as unknown as { status: number }).status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("間違った ADMIN_SECRET のリクエスト → 401 を返す", async () => {
    const req = makeRequest(validBody, "wrong-secret");
    const res = await DELETE(req);
    expect((res as unknown as { status: number }).status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("正しい ADMIN_SECRET のリクエスト → 正常処理 (200) を返す", async () => {
    const req = makeRequest(validBody, TEST_ADMIN_SECRET);
    const res = await DELETE(req);
    expect((res as unknown as { status: number }).status).toBe(200);
    expect(mockDelete).toHaveBeenCalledTimes(1);
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
    const badReq = makeRawRequest(async () => { throw new SyntaxError("Invalid JSON"); });
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
