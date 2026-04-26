jest.mock("@/lib/cache/revalidate", () => ({ revalidateAfterDailyLogMutation: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
  requireCurrentUser: jest.fn(async () => ({ id: "test-user-id", email: "owner@example.com" })),
}));

import { deleteSleepSession, saveSleepSession } from "@/app/actions/saveSleepSession";
import { createClient, requireCurrentUser } from "@/lib/supabase/server";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRequireCurrentUser = requireCurrentUser as jest.MockedFunction<typeof requireCurrentUser>;

describe("saveSleepSession/deleteSleepSession — auth_required", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("saveSleepSession はログインし直しメッセージとして返す", async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new Error("auth_required"));

    const result = await saveSleepSession({
      wake_date: "2026-04-01",
      bed_time: "23:30",
      wake_time: "07:00",
    });

    expect(result).toEqual({
      ok: false,
      message: "ログインし直してください",
      reason: "auth_required",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test("deleteSleepSession はログインし直しメッセージとして返す", async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new Error("auth_required"));

    const result = await deleteSleepSession("2026-04-01");

    expect(result).toEqual({
      ok: false,
      message: "ログインし直してください",
      reason: "auth_required",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
