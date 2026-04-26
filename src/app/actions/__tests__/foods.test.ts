jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
  requireCurrentUser: jest.fn(async () => ({ id: "test-user-id", email: "owner@example.com" })),
}));

import { deleteFood, deleteMenu, insertFood, insertMenu, updateMenu } from "@/app/actions/foods";
import { createClient, requireCurrentUser } from "@/lib/supabase/server";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRequireCurrentUser = requireCurrentUser as jest.MockedFunction<typeof requireCurrentUser>;

describe("foods/menu actions — auth_required", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockRejectedValue(new Error("auth_required"));
  });

  it.each([
    ["insertFood", () => insertFood({ name: "鶏むね", calories: 100, protein: 20, fat: 1, carbs: 0 })],
    ["deleteFood", () => deleteFood("鶏むね")],
    ["insertMenu", () => insertMenu({ name: "朝食", recipe: [] })],
    ["updateMenu", () => updateMenu("朝食", { name: "朝食2", recipe: [] })],
    ["deleteMenu", () => deleteMenu("朝食")],
  ])("%s はログインし直しメッセージとして返す", async (_name, action) => {
    await expect(action()).resolves.toEqual({
      error: "ログインし直してください",
      reason: "auth_required",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
