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

  it("fetches one daily log when date is specified", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });
    const limit = jest.fn().mockReturnValue(queryResult([{ log_date: "2024-01-01" }]));
    const eq = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    mockCreateClient.mockResolvedValue({ from });

    const response = await GET(makeRequest({ resource: "daily_logs", date: "2024-01-01" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("daily_logs");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("log_date", "2024-01-01");
    expect(limit).toHaveBeenCalledWith(1);
    expect(body.data).toEqual({ log_date: "2024-01-01" });
  });

  it("returns null when date-specified daily log is not found", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });
    const limit = jest.fn().mockReturnValue(queryResult([]));
    const eq = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    mockCreateClient.mockResolvedValue({ from });

    const response = await GET(makeRequest({ resource: "daily_logs", date: "2024-01-01" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toBeNull();
  });

  it("rejects invalid date for date-specified daily log", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });
    mockCreateClient.mockResolvedValue({ from: jest.fn() });

    const response = await GET(makeRequest({ resource: "daily_logs", date: "2024/01/01" }));

    expect(response.status).toBe(400);
  });

  it("fetches meal entries with items for a date", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-id", email: "owner@example.com" });

    const entriesOrder = jest.fn().mockReturnValue(queryResult([
      { id: "entry-1", user_id: "user-id", log_date: "2024-01-01", meal_type: "meal_1" },
    ]));
    const entriesEqLogDate = jest.fn().mockReturnValue({ order: entriesOrder });
    const entriesEqUser = jest.fn().mockReturnValue({ eq: entriesEqLogDate });
    const entriesSelect = jest.fn().mockReturnValue({ eq: entriesEqUser });

    const itemsOrder = jest.fn().mockReturnValue(queryResult([
      { id: "item-1", user_id: "user-id", meal_entry_id: "entry-1", food_name: "chicken", item_order: 0 },
    ]));
    const itemsIn = jest.fn().mockReturnValue({ order: itemsOrder });
    const itemsEq = jest.fn().mockReturnValue({ in: itemsIn });
    const itemsSelect = jest.fn().mockReturnValue({ eq: itemsEq });

    const from = jest.fn((table: string) => {
      if (table === "meal_entries") return { select: entriesSelect };
      if (table === "meal_items") return { select: itemsSelect };
      return { select: jest.fn() };
    });
    mockCreateClient.mockResolvedValue({ from });

    const response = await GET(makeRequest({ resource: "meal_entries", date: "2024-01-01" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("meal_entries");
    expect(from).toHaveBeenCalledWith("meal_items");
    expect(entriesEqUser).toHaveBeenCalledWith("user_id", "user-id");
    expect(entriesEqLogDate).toHaveBeenCalledWith("log_date", "2024-01-01");
    expect(itemsEq).toHaveBeenCalledWith("user_id", "user-id");
    expect(itemsIn).toHaveBeenCalledWith("meal_entry_id", ["entry-1"]);
    expect(body.data).toEqual([
      {
        id: "entry-1",
        user_id: "user-id",
        log_date: "2024-01-01",
        meal_type: "meal_1",
        items: [
          { id: "item-1", user_id: "user-id", meal_entry_id: "entry-1", food_name: "chicken", item_order: 0 },
        ],
      },
    ]);
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
