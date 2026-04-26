jest.mock("@/lib/cache/revalidate", () => ({ revalidateAfterSettingsMutation: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
  requireCurrentUser: jest.fn(async () => ({ id: "test-user-id", email: "owner@example.com" })),
}));

import { saveSettings } from "@/app/settings/actions";
import { EMPTY_SETTINGS_INPUT } from "@/lib/schemas/settingsSchema";
import { createClient, requireCurrentUser } from "@/lib/supabase/server";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRequireCurrentUser = requireCurrentUser as jest.MockedFunction<typeof requireCurrentUser>;

describe("saveSettings — auth_required", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("認証切れは field error に混ぜずログインし直しメッセージとして返す", async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new Error("auth_required"));

    const result = await saveSettings(EMPTY_SETTINGS_INPUT);

    expect(result).toEqual({
      ok: false,
      error: "ログインし直してください",
      reason: "auth_required",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
