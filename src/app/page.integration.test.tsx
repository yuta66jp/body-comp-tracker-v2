// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import DashboardPage from "./page";
import { fetchDashboardDailyLogs } from "@/lib/queries/dailyLogs";
import { fetchActiveSeason } from "@/lib/queries/seasons";
import { fetchSettings } from "@/lib/queries/settings";
import { mapToAppSettings } from "@/lib/domain/settings";
import type { Season } from "@/lib/domain/season";
import type { DashboardDailyLog } from "@/lib/supabase/types";
import { dateRangeStr } from "@/lib/utils/date";

// 品質集計・週次サマリー・データ品質バッジは実装を通し、DBと無関係な画面部品だけを分離する。
jest.mock("@/lib/queries/dailyLogs", () => ({
  fetchDashboardDailyLogs: jest.fn(),
  fetchPredictions: jest.fn(async () => []),
  fetchCareerLogsForDashboard: jest.fn(async () => []),
}));
jest.mock("@/lib/queries/seasons", () => ({ fetchActiveSeason: jest.fn() }));
jest.mock("@/lib/queries/settings", () => ({ fetchSettings: jest.fn() }));
jest.mock("@/lib/queries/analytics", () => ({
  fetchEnrichedLogs: jest.fn(async () => ({ rows: [], availability: { status: "unavailable" } })),
}));
jest.mock("@/lib/queries/googleHealthDailyMetrics", () => ({
  fetchGoogleHealthDailyMetricsForRange: jest.fn(async () => ({ kind: "ok", data: [] })),
}));
jest.mock("@/lib/supabase/server", () => ({ getCurrentUser: jest.fn(async () => null) }));
jest.mock("@/lib/googleHealth/status", () => ({
  buildGoogleHealthNotConnectedStatus: jest.fn(() => ({ connected: false })),
}));
jest.mock("@/components/dashboard/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/dashboard/KpiCards", () => ({ KpiCards: () => null }));
jest.mock("@/components/dashboard/GoalNavigator", () => ({ GoalNavigator: () => null }));
jest.mock("@/components/dashboard/LogsAndSummaryTabs", () => ({ LogsAndSummaryTabs: () => null }));
jest.mock("@/components/charts/ForecastChart", () => ({ ForecastChart: () => null }));

const season: Season = {
  id: 1,
  userId: "test-user",
  name: "Bulk test",
  phase: "Bulk",
  startDate: "2026-08-29",
  startWeight: 70,
  targetDate: "2026-09-30",
  targetWeight: 71,
  status: "active",
  endDate: null,
  endWeight: null,
  monthlyPlanStartMonth: "2026-08",
  monthlyPlanStartWeight: 70,
  monthlyPlanOverrides: [],
  monthlyPlanSnapshot: null,
  createdAt: "2026-08-29T00:00:00Z",
  updatedAt: "2026-08-29T00:00:00Z",
};

function makeLogs(startDate = "2026-08-24"): DashboardDailyLog[] {
  return dateRangeStr(startDate, "2026-08-30").map((log_date) => ({
    id: `log-${log_date}`,
    log_date,
    created_at: null,
    weight: 70,
    calories: 2000,
    protein: 140,
    fat: 60,
    carbs: 220,
    had_bowel_movement: true,
    work_mode: "office",
    training_type: "chest",
    is_cheat_day: false,
    is_refeed_day: false,
    is_eating_out: false,
    is_travel_day: false,
    is_tanning_day: false,
    is_posing_day: false,
    updated_at: "2026-08-30T00:00:00Z",
  }));
}

describe("DashboardPageの週次品質集計", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-30T03:00:00Z"));
    jest.mocked(fetchSettings).mockResolvedValue({ kind: "ok", data: mapToAppSettings([]) });
    jest.mocked(fetchActiveSeason).mockResolvedValue({ kind: "ok", data: season });
    jest.mocked(fetchDashboardDailyLogs).mockResolvedValue({ kind: "ok", data: makeLogs() });
  });

  afterEach(() => { jest.useRealTimers(); });

  it("Bulk開始2日目はシーズン前を未入力・減点にせず、増量ペースは判定待ちのまま", async () => {
    render(await DashboardPage());

    expect(screen.queryByText(/が未入力/)).not.toBeInTheDocument();
    expect(screen.getByText("品質 100/100（今シーズン2日分）")).toBeInTheDocument();
    expect(screen.getByText("判定待ち")).toBeInTheDocument();
    expect(screen.getByText(/最短で2026-09-11から判定できます/)).toBeInTheDocument();
    expect(screen.getByText("100 / 100")).toBeInTheDocument();
  });

  it("Bulk週次品質だけを限定し、上部のデータ品質は直近7日のまま", async () => {
    jest.mocked(fetchDashboardDailyLogs).mockResolvedValue({ kind: "ok", data: makeLogs("2026-08-29") });
    render(await DashboardPage());

    expect(screen.queryByText(/が未入力/)).not.toBeInTheDocument();
    expect(screen.getByText("品質 100/100（今シーズン2日分）")).toBeInTheDocument();
    expect(screen.getByText("0 / 100")).toBeInTheDocument();
  });

  it("開始日以降に2日未記録なら実際の欠損・減点を表示する", async () => {
    jest.mocked(fetchActiveSeason).mockResolvedValue({ kind: "ok", data: { ...season, startDate: "2026-08-28" } });
    jest.mocked(fetchDashboardDailyLogs).mockResolvedValue({ kind: "ok", data: makeLogs("2026-08-30") });
    render(await DashboardPage());

    expect(screen.getByText("体重 2 日 / カロリー 2 日 が未入力")).toBeInTheDocument();
    expect(screen.getByText("品質 58/100（今シーズン3日分）")).toBeInTheDocument();
  });

  it.each([
    ["weight", 1, "体重 1 日 が未入力", 90],
    ["calories", 1, null, 95],
    ["calories", 2, "カロリー 2 日 が未入力", 90],
  ] as const)("Bulkでも%sの%d日欠損に対する既存の警告閾値を維持する", async (field, missingDays, warning, score) => {
    const logs = makeLogs("2026-08-29").map((log, index) => index < missingDays ? { ...log, [field]: null } : log);
    jest.mocked(fetchDashboardDailyLogs).mockResolvedValue({ kind: "ok", data: logs });
    render(await DashboardPage());

    if (warning) {
      expect(screen.getByText(warning)).toBeInTheDocument();
    } else {
      expect(screen.queryByText(/が未入力/)).not.toBeInTheDocument();
    }
    expect(screen.getByText(`品質 ${score}/100（今シーズン2日分）`)).toBeInTheDocument();
  });

  it("Bulkの評価対象日が0日なら未評価を表示する", async () => {
    jest.mocked(fetchActiveSeason).mockResolvedValue({ kind: "ok", data: { ...season, startDate: "2026-08-31" } });
    render(await DashboardPage());

    expect(screen.getByText("品質 未評価（今シーズン0日分）")).toBeInTheDocument();
    expect(screen.queryByText(/品質 100/)).not.toBeInTheDocument();
    expect(screen.queryByText(/が未入力/)).not.toBeInTheDocument();
  });

  it("Cutは開始前も含めた直近7日の欠損・スコアと従来の表示を維持する", async () => {
    jest.mocked(fetchActiveSeason).mockResolvedValue({ kind: "ok", data: { ...season, phase: "Cut", targetWeight: 69 } });
    jest.mocked(fetchDashboardDailyLogs).mockResolvedValue({ kind: "ok", data: makeLogs("2026-08-29") });
    render(await DashboardPage());

    expect(screen.getByText("体重 5 日 / カロリー 5 日 が未入力")).toBeInTheDocument();
    expect(screen.getByText("品質 0/100")).toBeInTheDocument();
    expect(screen.queryByText(/今シーズン.*日分/)).not.toBeInTheDocument();
    expect(screen.getByText("0 / 100")).toBeInTheDocument();
  });
});
