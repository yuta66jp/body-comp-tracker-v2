jest.mock("@/lib/cache/revalidate", () => ({ revalidateAfterCompletedSeasonMutation: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
  requireCurrentUser: jest.fn(async () => ({ id: "test-user-id" })),
}));
jest.mock("@/lib/utils/date", () => ({
  ...jest.requireActual("@/lib/utils/date"),
  toJstDateStr: () => "2026-04-01",
}));

import { updateCompletedSeason } from "./actions";
import { revalidateAfterCompletedSeasonMutation } from "@/lib/cache/revalidate";
import { createClient, requireCurrentUser } from "@/lib/supabase/server";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRequireCurrentUser = requireCurrentUser as jest.MockedFunction<typeof requireCurrentUser>;
const mockRpc = jest.fn();
const validInput = {
  expectedCompletedSeasonId: 10,
  expectedCompletedSeasonUpdatedAt: "2026-03-31T00:00:00Z",
  name: "2025_Cut",
  phase: "Cut",
  endDate: "2026-03-31",
};

describe("updateCompletedSeason", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 10, error: null });
    mockCreateClient.mockResolvedValue({ rpc: mockRpc } as never);
  });

  it("入力検証後に専用RPCを呼び、関連画面を再検証する", async () => {
    await expect(updateCompletedSeason(validInput)).resolves.toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("update_completed_season", {
      p_expected_completed_season_id: 10,
      p_expected_completed_season_updated_at: "2026-03-31T00:00:00Z",
      p_name: "2025_Cut",
      p_phase: "Cut",
      p_end_date: "2026-03-31",
    });
    expect(revalidateAfterCompletedSeasonMutation).toHaveBeenCalledTimes(1);
  });

  it("不正入力では認証とRPCを呼ばない", async () => {
    await expect(updateCompletedSeason({ ...validInput, endDate: "2026-04-02" })).resolves.toMatchObject({
      ok: false,
      reason: "validation",
    });
    expect(mockRequireCurrentUser).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("競合とcareer_logs期間外を利用者向けエラーへ変換する", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "completed_season_changed" } });
    await expect(updateCompletedSeason(validInput)).resolves.toMatchObject({ ok: false, reason: "conflict" });

    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "completed_season_career_log_out_of_range" } });
    await expect(updateCompletedSeason(validInput)).resolves.toEqual({
      ok: false,
      error: "移行済みキャリア履歴が期間外になるため、この終了日には変更できません。",
      reason: "validation",
    });
  });
});
