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
const mockUpsert = jest.fn();
const mockFrom = jest.fn(() => ({ upsert: mockUpsert }));

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

  test("通常設定保存はseason lifecycle管理キーを書き戻さない", async () => {
    mockRequireCurrentUser.mockResolvedValueOnce({
      id: "test-user-id",
      email: "owner@example.com",
    } as never);
    mockUpsert.mockResolvedValueOnce({ error: null });
    mockCreateClient.mockResolvedValueOnce({ from: mockFrom } as never);

    const result = await saveSettings({
      ...EMPTY_SETTINGS_INPUT,
      current_season: "stale-season",
      current_phase: "Bulk",
      contest_date: "2026-09-01",
      goal_weight: "80",
      monthly_plan_start_month: "2026-03",
      monthly_plan_start_weight: "75",
      monthly_plan_overrides: '[{"month":"2026-04","targetWeight":74}]',
      age: "30",
    });

    expect(result).toEqual({ ok: true });
    const records = mockUpsert.mock.calls[0]![0] as Array<{ key: string }>;
    expect(records.map((record) => record.key)).not.toEqual(
      expect.arrayContaining([
        "current_season",
        "current_phase",
        "contest_date",
        "goal_weight",
        "monthly_plan_start_month",
        "monthly_plan_start_weight",
      ])
    );
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ key: "age" })]));
    expect(records).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "monthly_plan_overrides" })])
    );
  });
});
