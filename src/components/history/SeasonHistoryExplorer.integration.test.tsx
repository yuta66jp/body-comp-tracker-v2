// @jest-environment jest-environment-jsdom

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Season } from "@/lib/domain/season";
import type { SeasonHistoryRecord } from "@/lib/utils/seasonHistory";

jest.mock("./DaysOutChart", () => ({
  DaysOutChart: ({ seasons, deadlineLabel }: { seasons: string[]; deadlineLabel: string }) => (
    <div data-testid="days-chart">{deadlineLabel}:{seasons.join(",")}</div>
  ),
}));
jest.mock("./SeasonComparisonTable", () => ({
  SeasonComparisonTable: ({ seasons }: { seasons: string[] }) => (
    <div data-testid="comparison-table">{seasons.join(",")}</div>
  ),
}));
jest.mock("./SeasonComparisonAccordion", () => ({
  SeasonComparisonAccordion: ({ seasons }: { seasons: string[] }) => (
    <div data-testid="comparison-accordion">{seasons.join(",")}</div>
  ),
}));
jest.mock("./SeasonLowChart", () => ({
  SeasonLowChart: ({ phase }: { phase: string }) => <div data-testid="low-chart">{phase}</div>,
}));
jest.mock("./TodayWindowComparison", () => ({
  TodayWindowComparison: () => <div data-testid="today-comparison" />,
}));

import { SeasonHistoryExplorer } from "./SeasonHistoryExplorer";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("@/app/history/actions", () => ({
  updateCompletedSeason: jest.fn(async () => ({ ok: true })),
}));

function season(id: number, name: string, phase: "Cut" | "Bulk", status: "active" | "completed"): Season {
  return {
    id,
    userId: "11111111-1111-1111-1111-111111111111",
    name,
    phase,
    startDate: `202${id}-01-01`,
    startWeight: phase === "Cut" ? 75 : 70,
    targetDate: `202${id}-06-30`,
    targetWeight: phase === "Cut" ? 68 : 75,
    status,
    endDate: status === "completed" ? `202${id}-06-30` : null,
    endWeight: status === "completed" ? (phase === "Cut" ? 68 : 75) : null,
    monthlyPlanStartDate: `202${id}-01-01`,
    monthlyPlanStartMonth: `202${id}-01`,
    monthlyPlanStartWeight: phase === "Cut" ? 75 : 70,
    monthlyPlanOverrides: [],
    monthlyPlanSnapshot: status === "completed" ? [{
      month: `202${id}-06`,
      targetWeight: phase === "Cut" ? 68 : 75,
      source: "auto_redistributed",
      requiredDeltaKg: phase === "Cut" ? -1 : 1,
      actualWeight: phase === "Cut" ? 68 : 75,
    }] : null,
    createdAt: `202${id}-01-01T00:00:00Z`,
    updatedAt: `202${id}-01-01T00:00:00Z`,
  };
}

function record(value: Season): SeasonHistoryRecord {
  return {
    season: value,
    seriesLabel: value.name,
    logs: [
      {
        id: 1,
        log_date: value.startDate,
        weight: value.startWeight,
        season: value.name,
        target_date: value.targetDate,
        note: null,
      },
    ],
    source: "daily_logs",
    latestWeight: value.startWeight,
    goalStatus: value.status === "completed" ? "achieved" : "not_achieved",
    planEntries: value.monthlyPlanSnapshot ?? [],
  };
}

const records = [
  record(season(1, "2021_Cut", "Cut", "completed")),
  record(season(2, "2022_Cut", "Cut", "completed")),
  record(season(3, "2023_Bulk", "Bulk", "completed")),
  record(season(4, "2024_Bulk", "Bulk", "active")),
];

const manyRecords = [1, 2, 3, 4, 5, 6, 7].map((id) =>
  record(season(id, `202${id}_Cut`, "Cut", id === 7 ? "active" : "completed"))
);

describe("SeasonHistoryExplorer", () => {
  it("進行中seasonを既定選択し同じBulkだけを比較する", () => {
    render(<SeasonHistoryExplorer records={records} legacyRecords={[]} unassignedLogCount={0} today="2024-03-01" dailyLogs={[]} />);

    expect(screen.getByRole("heading", { name: "Bulk シーズン比較" })).toBeInTheDocument();
    expect(screen.getByText("2024_Bulk の詳細")).toBeInTheDocument();
    const table = screen.getByTestId("comparison-table");
    expect(table).toHaveTextContent("2023_Bulk,2024_Bulk");
    expect(table).not.toHaveTextContent("Cut");
    expect(screen.getByTestId("days-chart")).toHaveTextContent("目標日");
    expect(screen.queryByRole("button", { name: /過去のシーズンを表示/ })).not.toBeInTheDocument();
  });

  it("Cutを選ぶとCut同士の比較と保存済みsnapshotへ切り替わる", () => {
    render(<SeasonHistoryExplorer records={records} legacyRecords={[]} unassignedLogCount={0} today="2024-03-01" dailyLogs={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /2022_Cut/ }));

    expect(screen.getByRole("heading", { name: "Cut シーズン比較" })).toBeInTheDocument();
    expect(screen.getByText("2022_Cut の詳細")).toBeInTheDocument();
    expect(screen.getByText("2022-06")).toBeInTheDocument();
    const table = screen.getByTestId("comparison-table");
    expect(table).toHaveTextContent("2021_Cut,2022_Cut");
    expect(table).not.toHaveTextContent("Bulk");
    expect(screen.getByRole("button", { name: "シーズン情報を編集" })).toBeInTheDocument();
  });

  it("未所属ログ件数とphase不明legacyの扱いを案内する", () => {
    render(
      <SeasonHistoryExplorer
        records={records}
        legacyRecords={[{ key: "legacy", name: "Legacy", targetDate: "2020-08-01", startDate: "2020-01-01", endDate: "2020-08-01", startWeight: 75, endWeight: 68, count: 20 }]}
        unassignedLogCount={3}
        today="2024-03-01"
        dailyLogs={[]}
      />
    );

    expect(screen.getByText(/シーズン未所属の日次ログが 3 件/)).toBeInTheDocument();
    const legacySection = screen.getByRole("heading", { name: "移行前のキャリア履歴" }).closest("section")!;
    expect(within(legacySection).getByText(/フェーズを推測せず/)).toBeInTheDocument();
    expect(within(legacySection).getByText(/Legacy:/)).toBeInTheDocument();
  });

  it("終了済みseasonの変更内容と日次ログへの影響を保存前に確認できる", () => {
    render(
      <SeasonHistoryExplorer
        records={records}
        legacyRecords={[]}
        unassignedLogCount={1}
        today="2024-12-31"
        dailyLogs={[
          { log_date: "2022-06-29", weight: 68.2, season_id: 2 },
          { log_date: "2022-06-30", weight: 68, season_id: 2 },
          { log_date: "2022-07-01", weight: 68.1, season_id: null },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /2022_Cut/ }));
    fireEvent.click(screen.getByRole("button", { name: "シーズン情報を編集" }));
    fireEvent.change(screen.getByLabelText("シーズン名"), { target: { value: "2022_Bulk" } });
    fireEvent.change(screen.getByLabelText("フェーズ"), { target: { value: "Bulk" } });
    fireEvent.change(screen.getByLabelText("終了日"), { target: { value: "2022-07-01" } });
    fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));

    expect(screen.getByText("2022_Cut → 2022_Bulk")).toBeInTheDocument();
    expect(screen.getByText("Cut → Bulk")).toBeInTheDocument();
    expect(screen.getByText("2022-06-30 → 2022-07-01")).toBeInTheDocument();
    expect(screen.getByText("1 件")).toBeInTheDocument();
    expect(screen.getByText(/比較グループと目標達成判定も変わります/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "変更を確定" })).toBeInTheDocument();
  });

  it("直近4件だけを初期表示し、残りの過去seasonを展開できる", () => {
    render(
      <SeasonHistoryExplorer
        records={manyRecords}
        legacyRecords={[]}
        unassignedLogCount={0}
        today="2027-03-01"
        dailyLogs={[]}
      />
    );

    const seasonSection = screen.getByRole("heading", { name: "シーズン一覧" }).closest("section")!;
    expect(within(seasonSection).getAllByRole("button", { name: /202\d_Cut/ })).toHaveLength(4);
    expect(within(seasonSection).queryByRole("button", { name: /2023_Cut/ })).not.toBeInTheDocument();

    fireEvent.click(within(seasonSection).getByRole("button", { name: "過去のシーズンを表示（残り3件）" }));

    expect(within(seasonSection).getAllByRole("button", { name: /202\d_Cut/ })).toHaveLength(7);
    expect(within(seasonSection).getByRole("button", { name: "過去のシーズンを閉じる" })).toHaveAttribute("aria-expanded", "true");
  });

  it("過去seasonを選択したまま閉じると選択中カードだけを維持する", () => {
    render(
      <SeasonHistoryExplorer
        records={manyRecords}
        legacyRecords={[]}
        unassignedLogCount={0}
        today="2027-03-01"
        dailyLogs={[]}
      />
    );

    const seasonSection = screen.getByRole("heading", { name: "シーズン一覧" }).closest("section")!;
    fireEvent.click(within(seasonSection).getByRole("button", { name: "過去のシーズンを表示（残り3件）" }));
    fireEvent.click(within(seasonSection).getByRole("button", { name: /2021_Cut/ }));
    fireEvent.click(within(seasonSection).getByRole("button", { name: "過去のシーズンを閉じる" }));

    expect(within(seasonSection).getByText("選択中の過去シーズン")).toBeInTheDocument();
    expect(within(seasonSection).getAllByRole("button", { name: /202\d_Cut/ })).toHaveLength(5);
    expect(screen.getByText("2021_Cut の詳細")).toBeInTheDocument();

    fireEvent.click(within(seasonSection).getByRole("button", { name: /2027_Cut/ }));
    expect(within(seasonSection).queryByText("選択中の過去シーズン")).not.toBeInTheDocument();
    expect(within(seasonSection).queryByRole("button", { name: /2021_Cut/ })).not.toBeInTheDocument();
  });
});
