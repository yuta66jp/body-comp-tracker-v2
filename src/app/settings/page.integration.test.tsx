// @jest-environment jest-environment-jsdom

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Season } from "@/lib/domain/season";

const mockRefresh = jest.fn();
let mockSeason: Season | null;
let mockHeight: string;

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock("@/app/settings/seasonActions", () => ({
  startOrSwitchSeason: jest.fn(),
  endSeason: jest.fn(),
  updateSeasonGoal: jest.fn(),
  updateSeasonPlanStart: jest.fn(),
  saveSeasonPlanOverrides: jest.fn(),
}));
jest.mock("@/app/settings/actions", () => ({ saveSettings: jest.fn() }));
jest.mock("@/lib/queries/seasons", () => ({ fetchActiveSeason: async () => ({ kind: "ok", data: mockSeason }) }));
jest.mock("@/lib/queries/settings", () => ({
  fetchSettingsRows: async () => ({ kind: "ok", data: [{ key: "height_cm", value_num: Number(mockHeight), value_str: null }] }),
}));
jest.mock("@/lib/queries/dailyLogs", () => ({
  fetchDailyLogsForSettings: async () => ({ kind: "ok", data: [{ log_date: "2026-09-05", weight: 67.8 }] }),
}));
jest.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => null }));
jest.mock("@/lib/googleHealth/status", () => ({ buildGoogleHealthNotConnectedStatus: () => ({}) }));
jest.mock("@/lib/utils/calcDataQuality", () => ({ calcDataQuality: () => ({}) }));
jest.mock("@/lib/utils/date", () => ({ ...jest.requireActual("@/lib/utils/date"), toJstDateStr: () => "2026-09-05" }));
jest.mock("@/components/ui/PageShell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
jest.mock("@/components/settings/ThemeSection", () => ({ ThemeSection: () => null }));
jest.mock("@/components/settings/GoogleHealthSection", () => ({ GoogleHealthSection: () => null }));
jest.mock("@/components/settings/DataQualityPanel", () => ({ DataQualityPanel: () => null }));
jest.mock("@/components/settings/ExportSection", () => ({ ExportSection: () => null }));
jest.mock("@/components/settings/ImportSection", () => ({ ImportSection: () => null }));

import SettingsPage from "./page";
import { updateSeasonGoal, updateSeasonPlanStart } from "./seasonActions";

const initialSeason: Season = {
  id: 20,
  userId: "11111111-1111-1111-1111-111111111111",
  name: "2027_Bulk",
  phase: "Bulk",
  startDate: "2026-08-29",
  startWeight: 69.2,
  targetDate: "2027-02-14",
  targetWeight: 73,
  status: "active",
  endDate: null,
  endWeight: null,
  monthlyPlanStartDate: "2026-09-01",
  monthlyPlanStartMonth: "2026-09",
  monthlyPlanStartWeight: 68,
  monthlyPlanOverrides: [],
  monthlyPlanSnapshot: null,
  createdAt: "2026-08-29T00:00:00Z",
  updatedAt: "2026-09-05T00:00:00Z",
};

function expectSingleSections() {
  expect(screen.getAllByRole("region", { name: "シーズン設定" })).toHaveLength(1);
  expect(screen.getAllByRole("region", { name: "月別目標" })).toHaveLength(1);
  expect(screen.getAllByRole("heading", { name: "目標・身体情報" })).toHaveLength(1);
}

describe("SettingsPageのシーズン更新", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSeason = { ...initialSeason };
    mockHeight = "170";
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.mocked(updateSeasonGoal).mockImplementation(async (input) => {
      mockSeason = {
        ...mockSeason!,
        targetDate: input.targetDate,
        targetWeight: Number(input.targetWeight),
        updatedAt: new Date(Date.parse(mockSeason!.updatedAt) + 1000).toISOString(),
      };
      return { ok: true };
    });
    jest.mocked(updateSeasonPlanStart).mockImplementation(async (input) => {
      mockSeason = { ...mockSeason!, monthlyPlanStartDate: input.planStartDate, monthlyPlanStartWeight: 67.8, updatedAt: "2026-09-05T01:00:00Z" };
      return { ok: true };
    });
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("設定フォームと同時に描画し、連続保存・再描画後も各カードが1つで最新値を示す", async () => {
    // Pageの実際の兄弟構成を使う。カード単体のrerenderではkeyの衝突を検出できない。
    const { rerender } = render(await SettingsPage());
    expectSingleSections();
    for (const [index, weight] of [72, 71].entries()) {
      fireEvent.click(screen.getByRole("button", { name: "シーズン設定を編集" }));
      fireEvent.change(screen.getByLabelText("変更後の目標体重"), { target: { value: String(weight) } });
      fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));
      fireEvent.click(screen.getByRole("button", { name: "目標変更を確定" }));
      await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(index + 1));
      // 保存に伴うRSC再取得を模擬し、同じrootへ更新後のページを反映する。
      rerender(await SettingsPage());
      expectSingleSections();
      for (const name of ["シーズン設定", "月別目標"]) {
        const section = within(screen.getByRole("region", { name }));
        expect(section.getByText(`${weight.toFixed(1)} kg`)).toBeInTheDocument();
        expect(section.queryByText(`${(weight + 1).toFixed(1)} kg`)).not.toBeInTheDocument();
      }
      expect(screen.queryByLabelText("変更後の目標体重")).not.toBeInTheDocument();
      rerender(await SettingsPage());
      expectSingleSections();
    }
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("計画開始日の保存後も重複せず、シーズン編集と隣のフォームが最新データで初期化される", async () => {
    const { rerender } = render(await SettingsPage());
    fireEvent.change(screen.getByPlaceholderText("170"), { target: { value: "180" } });
    fireEvent.click(screen.getByRole("button", { name: "シーズン設定を編集" }));
    fireEvent.click(screen.getByRole("button", { name: "増量計画開始日" }));
    fireEvent.change(screen.getByLabelText("増量計画開始日"), { target: { value: "2026-09-05" } });
    fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));
    fireEvent.click(screen.getByRole("button", { name: "開始日変更を確定" }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    mockHeight = "171";
    rerender(await SettingsPage());
    expectSingleSections();
    expect(screen.getByPlaceholderText("170")).toHaveValue(171);
    expect(screen.getByText("2026-09-05 ／ 67.8 kg")).toBeInTheDocument();
    expect(screen.queryByLabelText("増量計画開始日")).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("未開始・開始・別シーズン・終了の切り替えでも各セクションは1つだけ表示する", async () => {
    mockSeason = null;
    const { rerender } = render(await SettingsPage());
    expectSingleSections();
    for (const season of [initialSeason, { ...initialSeason, id: 21, name: "2027_Cut", phase: "Cut" as const, targetWeight: 65 }, null]) {
      mockSeason = season;
      rerender(await SettingsPage());
      expectSingleSections();
      if (season) {
        expect(screen.getByText(season.name)).toBeInTheDocument();
      } else {
        expect(screen.getByText("進行中のシーズンはありません。")).toBeInTheDocument();
        expect(screen.queryByText("2027_Cut")).not.toBeInTheDocument();
      }
    }
    expect(consoleError).not.toHaveBeenCalled();
  });
});
