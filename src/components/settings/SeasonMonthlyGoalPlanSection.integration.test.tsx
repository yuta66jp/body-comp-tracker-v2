// @jest-environment jest-environment-jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock("@/app/settings/seasonActions", () => ({
  saveSeasonPlanOverrides: jest.fn(),
}));

import { saveSeasonPlanOverrides } from "@/app/settings/seasonActions";
import { SeasonMonthlyGoalPlanSection } from "./SeasonMonthlyGoalPlanSection";
import type { Season } from "@/lib/domain/season";

const mockSave = saveSeasonPlanOverrides as jest.MockedFunction<typeof saveSeasonPlanOverrides>;

const activeSeason: Season = {
  id: 20,
  userId: "11111111-1111-1111-1111-111111111111",
  name: "2026_Cut",
  phase: "Cut",
  startDate: "2026-03-15",
  startWeight: 75,
  targetDate: "2026-06-30",
  targetWeight: 69,
  status: "active",
  endDate: null,
  endWeight: null,
  monthlyPlanStartMonth: "2026-03",
  monthlyPlanStartWeight: 75,
  monthlyPlanOverrides: [{ month: "2026-05", targetWeight: 71 }],
  monthlyPlanSnapshot: null,
  createdAt: "2026-03-15T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

describe("SeasonMonthlyGoalPlanSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue({ ok: true });
  });

  it("進行中シーズンの計画開始情報を読み取り専用で表示する", () => {
    render(<SeasonMonthlyGoalPlanSection initialSeason={activeSeason} today="2026-04-01" />);

    expect(screen.getByRole("heading", { name: "月次目標計画" })).toBeInTheDocument();
    expect(screen.getByText("2026_Cut")).toBeInTheDocument();
    expect(screen.getByText("2026-03-15")).toBeInTheDocument();
    expect(screen.getByText("2026-03")).toBeInTheDocument();
    expect(screen.getByText("75.0 kg")).toBeInTheDocument();
  });

  it("当月の手動設定をseason専用actionで保存する", async () => {
    render(<SeasonMonthlyGoalPlanSection initialSeason={activeSeason} today="2026-04-01" />);

    const input = screen.getByLabelText("2026年4月 目標体重");
    fireEvent.change(input, { target: { value: "72.5" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "手動設定を保存" }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({
      expectedActiveSeasonId: 20,
      expectedActiveSeasonUpdatedAt: activeSeason.updatedAt,
      overrides: [
        { month: "2026-05", targetWeight: 71 },
        { month: "2026-04", targetWeight: 72.5 },
      ],
      resetAll: false,
    }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("確認後に進行中シーズンのoverrideを全件解除する", async () => {
    render(<SeasonMonthlyGoalPlanSection initialSeason={activeSeason} today="2026-04-01" />);

    fireEvent.click(screen.getByRole("button", { name: "すべて自動に戻す" }));
    expect(screen.getByText(/手動設定 1 件をすべて解除/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "リセットを確定" }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({
      expectedActiveSeasonId: 20,
      expectedActiveSeasonUpdatedAt: activeSeason.updatedAt,
      overrides: [],
      resetAll: true,
    }));
  });

  it("進行中シーズンがなければ開始を案内する", () => {
    render(<SeasonMonthlyGoalPlanSection initialSeason={null} today="2026-04-01" />);
    expect(screen.getByText(/先にシーズンを開始してください/)).toBeInTheDocument();
  });
});
