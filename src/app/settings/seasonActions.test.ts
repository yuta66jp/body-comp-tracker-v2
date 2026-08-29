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
  startOrSwitchSeason,
  updateSeasonGoal,
} from "./seasonActions";
import { revalidateAfterSettingsMutation } from "@/lib/cache/revalidate";
import { createClient, requireCurrentUser } from "@/lib/supabase/server";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRequireCurrentUser = requireCurrentUser as jest.MockedFunction<typeof requireCurrentUser>;
const mockRpc = jest.fn();

describe("season lifecycle actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 1, error: null });
    mockCreateClient.mockResolvedValue({ rpc: mockRpc } as never);
  });

  it("開始入力を検証してRPCを呼び、関連ページを再検証する", async () => {
    const result = await startOrSwitchSeason({
      expectedActiveSeasonId: null,
      name: "2026_Cut",
      phase: "Cut",
      startDate: "2026-04-01",
      targetDate: "2026-08-30",
      targetWeight: "68",
    });

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("start_or_switch_season", {
      p_expected_active_season_id: null,
      p_name: "2026_Cut",
      p_phase: "Cut",
      p_start_date: "2026-04-01",
      p_target_date: "2026-08-30",
      p_target_weight: 68,
    });
    expect(revalidateAfterSettingsMutation).toHaveBeenCalledTimes(1);
  });

  it("不正入力では認証・RPCを呼ばない", async () => {
    const result = await startOrSwitchSeason({
      expectedActiveSeasonId: null,
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
    await expect(endSeason({ expectedActiveSeasonId: 1, endDate: "2026-04-01" })).resolves.toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("end_active_season", {
      p_expected_active_season_id: 1,
      p_end_date: "2026-04-01",
    });

    await expect(
      updateSeasonGoal({ expectedActiveSeasonId: 1, targetDate: "2026-09-01", targetWeight: "67.5" })
    ).resolves.toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("update_active_season_goal", {
      p_expected_active_season_id: 1,
      p_target_date: "2026-09-01",
      p_target_weight: 67.5,
    });
  });

  it("認証切れはログイン案内を返す", async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new Error("auth_required"));
    await expect(endSeason({ expectedActiveSeasonId: 1, endDate: "2026-04-01" })).resolves.toEqual({
      ok: false,
      error: "ログインし直してください",
      reason: "auth_required",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
