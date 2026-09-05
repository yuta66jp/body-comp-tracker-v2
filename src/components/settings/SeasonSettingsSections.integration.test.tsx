// @jest-environment jest-environment-jsdom

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Season } from "@/lib/domain/season";
import type { SeasonLifecycleResult } from "@/app/settings/seasonActions";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock("@/app/settings/seasonActions", () => ({
  startOrSwitchSeason: jest.fn(),
  endSeason: jest.fn(),
  updateSeasonGoal: jest.fn(),
  updateSeasonPlanStart: jest.fn(),
  saveSeasonPlanOverrides: jest.fn(),
}));

import { updateSeasonPlanStart, saveSeasonPlanOverrides } from "@/app/settings/seasonActions";
import { SeasonSettingsSections } from "./SeasonSettingsSections";

const mockPlanStart = jest.mocked(updateSeasonPlanStart);
const mockSave = jest.mocked(saveSeasonPlanOverrides);
const season: Season = {
  id: 20,
  userId: "11111111-1111-1111-1111-111111111111",
  name: "2026_Bulk",
  phase: "Bulk",
  startDate: "2026-03-01",
  startWeight: 75,
  targetDate: "2026-06-30",
  targetWeight: 78.5,
  status: "active",
  endDate: null,
  endWeight: null,
  monthlyPlanStartDate: "2026-03-01",
  monthlyPlanStartMonth: "2026-03",
  monthlyPlanStartWeight: 75,
  monthlyPlanOverrides: [
    { month: "2026-03", targetWeight: 75.5 },
    { month: "2026-05", targetWeight: 77.5 },
  ],
  monthlyPlanSnapshot: null,
  createdAt: "2026-03-01T00:00:00Z",
  updatedAt: "2026-03-01T00:00:00Z",
};
const logs = [
  { log_date: "2026-03-01", weight: 75 },
  { log_date: "2026-04-01", weight: 76 },
  { log_date: "2026-04-02", weight: 70 },
];

function openPlanStart() {
  fireEvent.click(screen.getByRole("button", { name: "シーズン設定を編集" }));
  fireEvent.click(screen.getByRole("button", { name: "増量計画開始日" }));
}

describe("SeasonSettingsSections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanStart.mockResolvedValue({ ok: true });
    mockSave.mockResolvedValue({ ok: true });
  });

  it("シーズン編集内で記録日を選び、再計算と手動設定への影響を確認して保存する", async () => {
    render(<SeasonSettingsSections initialSeason={season} weightLogs={logs} today="2026-04-10" />);
    const monthly = within(screen.getByRole("region", { name: "月別目標" }));
    expect(monthly.queryByText(season.name)).not.toBeInTheDocument();
    expect(monthly.queryByText("計画開始日")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("増量計画開始日")).not.toBeInTheDocument();
    openPlanStart();
    expect(screen.getByText(/シーズン開始日 2026-03-01.*変更不可/)).toBeInTheDocument();
    expect(monthly.getByLabelText("2026年4月 目標体重")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("増量計画開始日"), { target: { value: "2026-04-01" } });
    expect(screen.getByText("76.0 kg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));
    expect(screen.getByText("再計算後の月別目標")).toBeInTheDocument();
    expect(screen.getByText(/保存時に解除される手動設定: 2026-03/)).toBeInTheDocument();
    expect(screen.getByText("2026-05: 77.5 kg（手動）")).toBeInTheDocument();
    expect(mockPlanStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "開始日変更を確定" }));
    await waitFor(() => expect(mockPlanStart).toHaveBeenCalledWith({
      expectedActiveSeasonId: 20,
      expectedActiveSeasonUpdatedAt: season.updatedAt,
      planStartDate: "2026-04-01",
    }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it.each(["", "2026-02-28", "2026-04-11", "2026-07-01"])("期間外・不正な開始日 %s は確認に進めない", (date) => {
    render(<SeasonSettingsSections initialSeason={season} weightLogs={[...logs, { log_date: date, weight: 76 }]} today="2026-04-10" />);
    openPlanStart();
    fireEvent.change(screen.getByLabelText("増量計画開始日"), { target: { value: date } });
    expect(screen.getByRole("button", { name: "変更内容を確認" })).toBeDisabled();
    expect(screen.getByText(/範囲で選択してください/)).toBeInTheDocument();
  });

  it("未記録日、NULL体重、Bulk上限超過を拒否する", () => {
    render(<SeasonSettingsSections initialSeason={season} weightLogs={[...logs, { log_date: "2026-04-04", weight: null }]} today="2026-04-10" />);
    openPlanStart();
    for (const date of ["2026-04-03", "2026-04-04"]) {
      fireEvent.change(screen.getByLabelText("増量計画開始日"), { target: { value: date } });
      expect(screen.getByText("体重を記録した日を選択してください。")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "変更内容を確認" })).toBeDisabled();
    }
    fireEvent.change(screen.getByLabelText("増量計画開始日"), { target: { value: "2026-04-02" } });
    expect(screen.getByRole("button", { name: "変更内容を確認" })).toBeDisabled();
    expect(screen.getByText(/上限を超えています:/)).toBeInTheDocument();
  });

  it("Cutでは最終目標を編集でき、増量計画開始日の編集は表示しない", () => {
    render(<SeasonSettingsSections initialSeason={{ ...season, phase: "Cut", targetWeight: 70, monthlyPlanOverrides: [] }} weightLogs={logs} today="2026-04-10" />);
    fireEvent.click(screen.getByRole("button", { name: "シーズン設定を編集" }));
    expect(screen.getByLabelText("変更後の目標日")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "増量計画開始日" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("増量計画開始日")).not.toBeInTheDocument();
  });

  it("月別の未保存入力を保持し、元に戻してからシーズン編集できる", async () => {
    const user = userEvent.setup();
    render(<SeasonSettingsSections initialSeason={season} weightLogs={logs} today="2026-04-10" />);
    const input = screen.getByLabelText("2026年4月 目標体重");
    const initialValue = (input as HTMLInputElement).value;
    await user.clear(input);
    await user.type(input, "76.2");
    await user.click(screen.getByRole("button", { name: "シーズン設定を編集" }));
    expect(input).toHaveValue(76.2);
    expect(screen.getByRole("button", { name: "シーズン設定を編集" })).toBeDisabled();
    expect(screen.queryByLabelText("変更後の目標日")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "未保存の変更を元に戻す" }));
    expect(input).toHaveValue(Number(initialValue));
    await user.click(screen.getByRole("button", { name: "シーズン設定を編集" }));
    expect(input).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(input).toBeEnabled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("開始日の保存中は他操作を止め、競合エラー後も日付を保持して再試行できる", async () => {
    let resolveSave!: (result: SeasonLifecycleResult) => void;
    mockPlanStart.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    render(<SeasonSettingsSections initialSeason={season} weightLogs={logs} today="2026-04-10" />);
    openPlanStart();
    fireEvent.change(screen.getByLabelText("増量計画開始日"), { target: { value: "2026-04-01" } });
    fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));
    fireEvent.click(screen.getByRole("button", { name: "開始日変更を確定" }));
    expect(screen.getByRole("button", { name: "次のシーズンを開始" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "戻る" })).toBeDisabled();
    resolveSave({ ok: false, reason: "conflict", error: "別の画面で更新されています。再読み込みしてください。" });
    await waitFor(() => expect(screen.getByText(/別の画面で更新されています/)).toBeInTheDocument());
    expect(mockRefresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(screen.getByLabelText("増量計画開始日")).toHaveValue("2026-04-01");
    expect(screen.getByLabelText("2026年4月 目標体重")).toBeDisabled();
  });

  it("月別保存の失敗後も未保存変更を保持してシーズン変更を止める", async () => {
    mockSave.mockResolvedValueOnce({ ok: false, error: "保存に失敗しました" });
    render(<SeasonSettingsSections initialSeason={{ ...season, targetWeight: 78, monthlyPlanOverrides: [] }} weightLogs={logs} today="2026-04-10" />);
    const input = screen.getByLabelText("2026年4月 目標体重");
    fireEvent.change(input, { target: { value: "76.6" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await waitFor(() => expect(screen.getByText("保存に失敗しました")).toBeInTheDocument());
    expect(input).toHaveValue(76.6);
    expect(screen.getByRole("button", { name: "シーズン設定を編集" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "未保存の変更を元に戻す" })).toBeEnabled();
  });

  it("開始日の通信例外後も操作ロックを解除し、保存を再試行できる", async () => {
    mockPlanStart.mockRejectedValueOnce(new Error("network unavailable"));
    render(<SeasonSettingsSections initialSeason={season} weightLogs={logs} today="2026-04-10" />);
    openPlanStart();
    fireEvent.change(screen.getByLabelText("増量計画開始日"), { target: { value: "2026-04-01" } });
    fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));
    fireEvent.click(screen.getByRole("button", { name: "開始日変更を確定" }));
    await waitFor(() => expect(screen.getByText(/保存に失敗しました。入力内容を確認/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "開始日変更を確定" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "開始日変更を確定" }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("保存後の新しいシーズン情報で両カードを更新する", () => {
    const { rerender } = render(<SeasonSettingsSections key={season.updatedAt} initialSeason={season} weightLogs={logs} today="2026-04-10" />);
    openPlanStart();
    const updated = { ...season, monthlyPlanStartDate: "2026-04-01", monthlyPlanStartMonth: "2026-04", monthlyPlanStartWeight: 76, monthlyPlanOverrides: [season.monthlyPlanOverrides[1]!], updatedAt: "2026-04-10T00:00:00Z" };
    rerender(<SeasonSettingsSections key={updated.updatedAt} initialSeason={updated} weightLogs={logs} today="2026-04-10" />);
    expect(screen.queryByLabelText("増量計画開始日")).not.toBeInTheDocument();
    expect(screen.getByText("2026-04-01 ／ 76.0 kg")).toBeInTheDocument();
    expect(screen.queryByText("2026年3月")).not.toBeInTheDocument();
    expect(screen.getByLabelText("2026年4月 目標体重")).toBeEnabled();
  });
});
