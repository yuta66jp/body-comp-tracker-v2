jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(),
}));

import { NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { GET } from "./route";

const mockCreateClient = createClient as jest.Mock;
const mockGetCurrentUser = getCurrentUser as jest.Mock;

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/client-data");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString());
}

function queryResult<T>(data: T) {
  return Promise.resolve({ data, error: null });
}

describe("GET /api/client-data", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    mockGetCurrentUser.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(makeRequest({ resource: "daily_logs" }));

    expect(response.status).toBe(401);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("rejects unknown resources", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });

    const response = await GET(makeRequest({ resource: "settings" }));

    expect(response.status).toBe(400);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("fetches recent daily logs through the server Supabase client", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });
    const limit = jest.fn().mockReturnValue(queryResult([{ log_date: "2026-04-26" }]));
    const order = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ order });
    const from = jest.fn().mockReturnValue({ select });
    mockCreateClient.mockResolvedValue({ from });

    const response = await GET(makeRequest({ resource: "daily_logs" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("daily_logs");
    expect(select).toHaveBeenCalledWith("*");
    expect(order).toHaveBeenCalledWith("log_date", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
    expect(body.data).toEqual([{ log_date: "2026-04-26" }]);
  });

  it("validates date range for daily_log_dates", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });

    const response = await GET(makeRequest({
      resource: "daily_log_dates",
      start: "2026/04/01",
      end: "2026-04-26",
    }));

    expect(response.status).toBe(400);
    expect(mockCreateClient).toHaveBeenCalled();
  });
});
