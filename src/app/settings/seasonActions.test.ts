jest.mock("@/lib/cache/revalidate", () => ({ revalidateAfterSettingsMutation: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
  requireCurrentUser: jest.fn(async () => ({ id: "test-user-id" })),
}));
jest.mock("@/lib/utils/date", () => ({
  ...jest.requireActual("@/lib/utils/date"),
  toJstDateStr: () => "2026-04-01",
}));

import {
  endSeason,
  saveSeasonPlanOverrides,
  startOrSwitchSeason,
  updateSeasonGoal,
} from "./seasonActions";
import { revalidateAfterSettingsMutation } from "@/lib/cache/revalidate";
import { createClient, requireCurrentUser } from "@/lib/supabase/server";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRequireCurrentUser = requireCurrentUser as jest.MockedFunction<typeof requireCurrentUser>;
const mockRpc = jest.fn();
const mockSeasonMaybeSingle = jest.fn();
const mockLogOrder = jest.fn();
const mockFrom = jest.fn((table: string) => {
  if (table === "seasons") {
    return {
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: mockSeasonMaybeSingle }) }),
      }),
    };
  }
  return {
    select: () => ({
      gte: () => ({ lte: () => ({ order: mockLogOrder }) }),
    }),
  };
});

const updatedAt = "2026-04-01T00:00:00Z";

describe("season lifecycle actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 1, error: null });
    mockSeasonMaybeSingle.mockResolvedValue({
      data: {
        id: 1,
        start_date: "2026-03-01",
        start_weight: 75,
        target_date: "2026-06-30",
        target_weight: 69,
        monthly_plan_start_month: "2026-03",
        monthly_plan_start_weight: 75,
        monthly_plan_overrides: [],
        updated_at: updatedAt,
      },
      error: null,
    });
    mockLogOrder.mockResolvedValue({
      data: [{ log_date: "2026-04-01", weight: 74 }],
      error: null,
    });
    mockCreateClient.mockResolvedValue({ rpc: mockRpc, from: mockFrom } as never);
  });

  it("開始入力を検証してRPCを呼び、関連ページを再検証する", async () => {
    const result = await startOrSwitchSeason({
      expectedActiveSeasonId: null,
      expectedActiveSeasonUpdatedAt: null,
      name: "2026_Cut",
      phase: "Cut",
      startDate: "2026-04-01",
      targetDate: "2026-08-30",
      targetWeight: "68",
    });

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("start_or_switch_season", {
      p_expected_active_season_id: null,
      p_expected_active_season_updated_at: null,
      p_name: "2026_Cut",
      p_phase: "Cut",
      p_start_date: "2026-04-01",
      p_target_date: "2026-08-30",
      p_target_weight: 68,
      p_previous_plan_snapshot: null,
    });
    expect(revalidateAfterSettingsMutation).toHaveBeenCalledTimes(1);
  });

  it("不正入力では認証・RPCを呼ばない", async () => {
    const result = await startOrSwitchSeason({
      expectedActiveSeasonId: null,
      expectedActiveSeasonUpdatedAt: null,
      name: "",
      phase: "Cut",
      startDate: "2026-04-02",
      targetDate: "2026-04-01",
      targetWeight: "10",
    });

    expect(result).toMatchObject({ ok: false, reason: "validation" });
    expect(mockRequireCurrentUser).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("開始体重なしを体重記録案内へ変換する", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "season_start_weight_missing" },
    });
    const result = await startOrSwitchSeason({
      expectedActiveSeasonId: null,
      expectedActiveSeasonUpdatedAt: null,
      name: "2026_Cut",
      phase: "Cut",
      startDate: "2026-04-01",
      targetDate: "2026-08-30",
      targetWeight: "68",
    });
    expect(result).toEqual({
      ok: false,
      error: "開始日時点の体重記録がありません。先に体重を記録してください。",
    });
  });

  it("終了と目標変更は専用RPCを呼ぶ", async () => {
    await expect(endSeason({ expectedActiveSeasonId: 1, expectedActiveSeasonUpdatedAt: updatedAt, endDate: "2026-04-01" })).resolves.toEqual({ ok: true });
    expect(mockRpc).toHaveBeenNthCalledWith(1, "end_active_season", {
      p_expected_active_season_id: 1,
      p_expected_active_season_updated_at: updatedAt,
      p_end_date: "2026-04-01",
      p_plan_snapshot: expect.arrayContaining([
        expect.objectContaining({ month: "2026-03", actualWeight: null }),
        expect.objectContaining({ month: "2026-04", actualWeight: 74 }),
      ]),
    });

    await expect(
      updateSeasonGoal({ expectedActiveSeasonId: 1, expectedActiveSeasonUpdatedAt: updatedAt, targetDate: "2026-09-01", targetWeight: "67.5" })
    ).resolves.toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("update_active_season_goal", {
      p_expected_active_season_id: 1,
      p_expected_active_season_updated_at: updatedAt,
      p_target_date: "2026-09-01",
      p_target_weight: 67.5,
    });
  });

  it("進行中シーズンのoverrideを専用RPCで保存する", async () => {
    await expect(saveSeasonPlanOverrides({
      expectedActiveSeasonId: 1,
      expectedActiveSeasonUpdatedAt: updatedAt,
      overrides: [{ month: "2026-04", targetWeight: 72 }],
      resetAll: false,
    })).resolves.toEqual({ ok: true });

    expect(mockRpc).toHaveBeenCalledWith("update_active_season_plan_overrides", {
      p_expected_active_season_id: 1,
      p_expected_active_season_updated_at: updatedAt,
      p_overrides: [{ month: "2026-04", targetWeight: 72 }],
      p_reset_all: false,
    });
  });

  it("認証切れはログイン案内を返す", async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new Error("auth_required"));
    await expect(endSeason({ expectedActiveSeasonId: 1, expectedActiveSeasonUpdatedAt: updatedAt, endDate: "2026-04-01" })).resolves.toEqual({
      ok: false,
      error: "ログインし直してください",
      reason: "auth_required",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
