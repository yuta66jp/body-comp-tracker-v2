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

describe("SeasonHistoryExplorer", () => {
  it("進行中seasonを既定選択し同じBulkだけを比較する", () => {
    render(<SeasonHistoryExplorer records={records} legacyRecords={[]} unassignedLogCount={0} today="2024-03-01" />);

    expect(screen.getByRole("heading", { name: "Bulk シーズン比較" })).toBeInTheDocument();
    expect(screen.getByText("2024_Bulk の詳細")).toBeInTheDocument();
    const table = screen.getByTestId("comparison-table");
    expect(table).toHaveTextContent("2023_Bulk,2024_Bulk");
    expect(table).not.toHaveTextContent("Cut");
    expect(screen.getByTestId("days-chart")).toHaveTextContent("目標日");
  });

  it("Cutを選ぶとCut同士の比較と保存済みsnapshotへ切り替わる", () => {
    render(<SeasonHistoryExplorer records={records} legacyRecords={[]} unassignedLogCount={0} today="2024-03-01" />);

    fireEvent.click(screen.getByRole("button", { name: /2022_Cut/ }));

    expect(screen.getByRole("heading", { name: "Cut シーズン比較" })).toBeInTheDocument();
    expect(screen.getByText("2022_Cut の詳細")).toBeInTheDocument();
    expect(screen.getByText("2022-06")).toBeInTheDocument();
    const table = screen.getByTestId("comparison-table");
    expect(table).toHaveTextContent("2021_Cut,2022_Cut");
    expect(table).not.toHaveTextContent("Bulk");
  });

  it("未所属ログ件数とphase不明legacyの扱いを案内する", () => {
    render(
      <SeasonHistoryExplorer
        records={records}
        legacyRecords={[{ key: "legacy", name: "Legacy", targetDate: "2020-08-01", startDate: "2020-01-01", endDate: "2020-08-01", startWeight: 75, endWeight: 68, count: 20 }]}
        unassignedLogCount={3}
        today="2024-03-01"
      />
    );

    expect(screen.getByText(/シーズン未所属の日次ログが 3 件/)).toBeInTheDocument();
    const legacySection = screen.getByRole("heading", { name: "移行前のキャリア履歴" }).closest("section")!;
    expect(within(legacySection).getByText(/フェーズを推測せず/)).toBeInTheDocument();
    expect(within(legacySection).getByText(/Legacy:/)).toBeInTheDocument();
  });
});
