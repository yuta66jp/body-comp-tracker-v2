jest.mock("@/lib/cache/revalidate", () => ({
  revalidateAfterFoodMutation: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
  requireCurrentUser: jest.fn(async () => ({ id: "test-user-id", email: "owner@example.com" })),
}));

import { deleteFood, deleteMenu, insertFood, insertMenu, updateMenu } from "@/app/actions/foods";
import { revalidateAfterFoodMutation } from "@/lib/cache/revalidate";
import { createClient, requireCurrentUser } from "@/lib/supabase/server";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRequireCurrentUser = requireCurrentUser as jest.MockedFunction<typeof requireCurrentUser>;
const mockRevalidateAfterFoodMutation =
  revalidateAfterFoodMutation as jest.MockedFunction<typeof revalidateAfterFoodMutation>;

function mockSupabaseAction(error: { message: string } | null = null) {
  const terminal = Promise.resolve({ error });
  let eqCount = 0;
  type MockSupabaseBuilder = {
    eq: jest.Mock<MockSupabaseBuilder | typeof terminal, []>;
    insert: jest.Mock<typeof terminal, []>;
    update: jest.Mock<MockSupabaseBuilder, []>;
    delete: jest.Mock<MockSupabaseBuilder, []>;
  };
  const builder: MockSupabaseBuilder = {
    eq: jest.fn(() => {
      eqCount += 1;
      return eqCount >= 2 ? terminal : builder;
    }),
    insert: jest.fn(() => terminal),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
  };
  mockCreateClient.mockResolvedValue({
    from: jest.fn(() => builder),
  } as never);
  return builder;
}

const actions = [
  ["insertFood", () => insertFood({ name: "鶏むね", calories: 100, protein: 20, fat: 1, carbs: 0 })],
  ["deleteFood", () => deleteFood("鶏むね")],
  ["insertMenu", () => insertMenu({ name: "朝食", recipe: [] })],
  ["updateMenu", () => updateMenu("朝食", { name: "朝食2", recipe: [] })],
  ["deleteMenu", () => deleteMenu("朝食")],
] as const;

describe("foods/menu actions — auth_required", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockRejectedValue(new Error("auth_required"));
  });

  it.each(actions)("%s はログインし直しメッセージとして返す", async (_name, action) => {
    await expect(action()).resolves.toEqual({
      error: "ログインし直してください",
      reason: "auth_required",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockRevalidateAfterFoodMutation).not.toHaveBeenCalled();
  });
});

describe("foods/menu actions — revalidate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({ id: "test-user-id", email: "owner@example.com" } as never);
  });

  it.each(actions)("%s は成功時に /foods を revalidate する", async (_name, action) => {
    mockSupabaseAction(null);

    await expect(action()).resolves.toEqual({ error: null });

    expect(mockRevalidateAfterFoodMutation).toHaveBeenCalledTimes(1);
  });

  it.each(actions)("%s は DB エラー時に revalidate しない", async (_name, action) => {
    mockSupabaseAction({ message: "db error" });

    await expect(action()).resolves.toEqual({ error: "db error" });

    expect(mockRevalidateAfterFoodMutation).not.toHaveBeenCalled();
  });
});
