// @jest-environment jest-environment-jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock("@/app/settings/seasonActions", () => ({
  startOrSwitchSeason: jest.fn(),
  endSeason: jest.fn(),
  updateSeasonGoal: jest.fn(),
}));

import {
  endSeason,
  startOrSwitchSeason,
  updateSeasonGoal,
} from "@/app/settings/seasonActions";
import { SeasonLifecycleSection } from "./SeasonLifecycleSection";
import type { Season } from "@/lib/domain/season";

const mockStart = startOrSwitchSeason as jest.MockedFunction<typeof startOrSwitchSeason>;
const mockEnd = endSeason as jest.MockedFunction<typeof endSeason>;
const mockGoal = updateSeasonGoal as jest.MockedFunction<typeof updateSeasonGoal>;

const activeSeason: Season = {
  id: 10,
  userId: "11111111-1111-1111-1111-111111111111",
  name: "2026_Bulk",
  phase: "Bulk",
  startDate: "2026-03-01",
  startWeight: 75,
  targetDate: "2026-06-30",
  targetWeight: 80,
  status: "active",
  endDate: null,
  endWeight: null,
  monthlyPlanStartMonth: "2026-03",
  monthlyPlanStartWeight: 75,
  monthlyPlanOverrides: [],
  monthlyPlanSnapshot: null,
  createdAt: "2026-03-01T00:00:00Z",
  updatedAt: "2026-03-01T00:00:00Z",
};

describe("SeasonLifecycleSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue({ ok: true });
    mockEnd.mockResolvedValue({ ok: true });
    mockGoal.mockResolvedValue({ ok: true });
  });

  it("進行中シーズンを読み取り専用で表示し、通常のフェーズ編集を出さない", () => {
    render(
      <SeasonLifecycleSection
        initialSeason={activeSeason}
        weightLogs={[]}
        today="2026-04-01"
      />
    );

    expect(screen.getByRole("heading", { name: "シーズン・目標" })).toBeInTheDocument();
    expect(screen.getByText("2026_Bulk")).toBeInTheDocument();
    expect(screen.getByText("Bulk")).toBeInTheDocument();
    expect(screen.queryByLabelText("新しいフェーズ")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "次のシーズンを開始" })).toBeInTheDocument();
  });

  it("シーズンなしから開始内容を確認し、開始RPCを呼ぶ", async () => {
    render(
      <SeasonLifecycleSection
        initialSeason={null}
        weightLogs={[{ log_date: "2026-04-01", weight: 74.5 }]}
        today="2026-04-01"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "シーズンを開始" }));
    fireEvent.change(screen.getByLabelText("新しいシーズン名"), { target: { value: "2026_Cut" } });
    fireEvent.change(screen.getByLabelText("新しい目標日"), { target: { value: "2026-08-30" } });
    fireEvent.change(screen.getByLabelText("新しい目標体重"), { target: { value: "68" } });
    expect(screen.getByText(/開始体重:/)).toHaveTextContent("74.5 kg");

    fireEvent.click(screen.getByRole("button", { name: "内容を確認" }));
    expect(screen.getByText("保存前の確認")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "開始を確定" }));

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledWith({
        expectedActiveSeasonId: null,
        expectedActiveSeasonUpdatedAt: null,
        name: "2026_Cut",
        phase: "Cut",
        startDate: "2026-04-01",
        targetDate: "2026-08-30",
        targetWeight: "68",
      });
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("開始日時点の体重がない場合は確定へ進めない", () => {
    render(
      <SeasonLifecycleSection initialSeason={null} weightLogs={[]} today="2026-04-01" />
    );
    fireEvent.click(screen.getByRole("button", { name: "シーズンを開始" }));
    fireEvent.change(screen.getByLabelText("新しいシーズン名"), { target: { value: "2026_Cut" } });
    fireEvent.change(screen.getByLabelText("新しい目標日"), { target: { value: "2026-08-30" } });
    fireEvent.change(screen.getByLabelText("新しい目標体重"), { target: { value: "68" } });
    fireEvent.click(screen.getByRole("button", { name: "内容を確認" }));

    expect(screen.getByRole("status")).toHaveTextContent("先に体重を記録してください");
    expect(screen.queryByRole("button", { name: "開始を確定" })).not.toBeInTheDocument();
  });

  it("切り替え時に旧終了日が新開始日の前日であることを確認表示する", () => {
    render(
      <SeasonLifecycleSection
        initialSeason={activeSeason}
        weightLogs={[{ log_date: "2026-04-01", weight: 78 }]}
        today="2026-04-01"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "次のシーズンを開始" }));
    fireEvent.change(screen.getByLabelText("新しいシーズン名"), { target: { value: "2026_Cut" } });
    fireEvent.change(screen.getByLabelText("新しい目標日"), { target: { value: "2026-08-30" } });
    fireEvent.change(screen.getByLabelText("新しい目標体重"), { target: { value: "68" } });
    fireEvent.click(screen.getByRole("button", { name: "内容を確認" }));

    expect(screen.getByText(/現在のシーズンは 2026-03-31 で終了します/)).toBeInTheDocument();
  });

  it("期限超過しても自動終了せず3つの選択肢を表示する", () => {
    render(
      <SeasonLifecycleSection
        initialSeason={{ ...activeSeason, targetDate: "2026-03-31" }}
        weightLogs={[]}
        today="2026-04-01"
      />
    );
    expect(screen.getByText(/自動終了はしません/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "次のシーズンを開始" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "目標を変更" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "シーズンを終了" })).toBeInTheDocument();
  });

  it("進行中シーズンの目標日と目標体重を更新する", async () => {
    render(
      <SeasonLifecycleSection
        initialSeason={activeSeason}
        weightLogs={[]}
        today="2026-04-01"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "目標を変更" }));
    fireEvent.change(screen.getByLabelText("変更後の目標日"), {
      target: { value: "2026-07-31" },
    });
    fireEvent.change(screen.getByLabelText("変更後の目標体重"), {
      target: { value: "81" },
    });
    fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));
    expect(screen.getByText("再計算後の月次計画")).toBeInTheDocument();
    expect(screen.getByText(/2026-07: 81.0 kg/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "目標変更を確定" }));

    await waitFor(() => expect(mockGoal).toHaveBeenCalledWith({
      expectedActiveSeasonId: 10,
      expectedActiveSeasonUpdatedAt: activeSeason.updatedAt,
      targetDate: "2026-07-31",
      targetWeight: "81",
    }));
  });

  it("目標変更で範囲外になる手動設定を確定前に表示する", () => {
    render(
      <SeasonLifecycleSection
        initialSeason={{
          ...activeSeason,
          targetDate: "2026-08-31",
          monthlyPlanOverrides: [
            { month: "2026-05", targetWeight: 78 },
            { month: "2026-07", targetWeight: 79 },
          ],
        }}
        weightLogs={[]}
        today="2026-04-01"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "目標を変更" }));
    fireEvent.change(screen.getByLabelText("変更後の目標日"), {
      target: { value: "2026-06-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));

    expect(screen.getByText(/保存時に解除される手動設定: 2026-07/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05: 78.0 kg（手動）/)).toBeInTheDocument();
  });

  it("終了時体重なしを警告しつつ終了を許可する", async () => {
    render(
      <SeasonLifecycleSection
        initialSeason={activeSeason}
        weightLogs={[]}
        today="2026-04-01"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "シーズンを終了" }));
    expect(screen.getByText(/終了時体重は未記録になります/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "終了内容を確認" }));
    fireEvent.click(screen.getByRole("button", { name: "終了を確定" }));
    await waitFor(() => expect(mockEnd).toHaveBeenCalledWith({
      expectedActiveSeasonId: 10,
      expectedActiveSeasonUpdatedAt: activeSeason.updatedAt,
      endDate: "2026-04-01",
    }));
  });
});
