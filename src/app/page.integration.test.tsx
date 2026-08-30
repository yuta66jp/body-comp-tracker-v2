// @jest-environment jest-environment-jsdom

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import DashboardPage from "./page";
import { fetchCareerLogsForDashboard, fetchDashboardDailyLogs } from "@/lib/queries/dailyLogs";
import { fetchSeasons } from "@/lib/queries/seasons";
import { fetchSettings } from "@/lib/queries/settings";
import { mapToAppSettings } from "@/lib/domain/settings";
import type { Season } from "@/lib/domain/season";
import type { DashboardDailyLog } from "@/lib/supabase/types";
import { dateRangeStr } from "@/lib/utils/date";

// 品質・週次・月別表示は実装を通し、DBと無関係な画面部品だけを分離する。
jest.mock("@/lib/queries/dailyLogs", () => ({
  fetchDashboardDailyLogs: jest.fn(),
  fetchPredictions: jest.fn(async () => []),
  fetchCareerLogsForDashboard: jest.fn(async () => []),
}));
jest.mock("@/lib/queries/seasons", () => ({
  ...jest.requireActual("@/lib/queries/seasons"),
  fetchSeasons: jest.fn(),
}));
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
  DashboardLayout: ({ children, header }: { children: React.ReactNode; header: React.ReactNode }) => <>{header}{children}</>,
}));
jest.mock("@/components/dashboard/KpiCards", () => ({ KpiCards: () => null }));
jest.mock("@/components/dashboard/GoalNavigator", () => ({ GoalNavigator: () => null }));
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
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-30T03:00:00Z"));
    jest.mocked(fetchSettings).mockResolvedValue({ kind: "ok", data: mapToAppSettings([]) });
    jest.mocked(fetchSeasons).mockResolvedValue({ kind: "ok", data: [season] });
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
    jest.mocked(fetchSeasons).mockResolvedValue({ kind: "ok", data: [{ ...season, startDate: "2026-08-28" }] });
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
    jest.mocked(fetchSeasons).mockResolvedValue({ kind: "ok", data: [{ ...season, startDate: "2026-08-31" }] });
    render(await DashboardPage());

    expect(screen.getByText("品質 未評価（今シーズン0日分）")).toBeInTheDocument();
    expect(screen.queryByText(/品質 100/)).not.toBeInTheDocument();
    expect(screen.queryByText(/が未入力/)).not.toBeInTheDocument();
  });

  it("Cutは開始前も含めた直近7日の欠損・スコアと従来の表示を維持する", async () => {
    jest.mocked(fetchSeasons).mockResolvedValue({ kind: "ok", data: [{ ...season, phase: "Cut", targetWeight: 69 }] });
    jest.mocked(fetchDashboardDailyLogs).mockResolvedValue({ kind: "ok", data: makeLogs("2026-08-29") });
    render(await DashboardPage());

    expect(screen.getByText("体重 5 日 / カロリー 5 日 が未入力")).toBeInTheDocument();
    expect(screen.getByText("品質 0/100")).toBeInTheDocument();
    expect(screen.queryByText(/今シーズン.*日分/)).not.toBeInTheDocument();
    expect(screen.getByText("0 / 100")).toBeInTheDocument();
  });
});

describe("DashboardPageの月別シーズン表示", () => {
  const completed: Season = {
    ...season, id: 6, name: "2026_KantoClassBy", phase: "Cut",
    startDate: "2026-03-01", endDate: "2026-08-23", status: "completed",
  };
  const active = { ...season, name: "2027_offSeason" };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-30T03:00:00Z"));
    jest.mocked(fetchSettings).mockResolvedValue({ kind: "ok", data: mapToAppSettings([]) });
    jest.mocked(fetchSeasons).mockResolvedValue({ kind: "ok", data: [completed, active] });
    jest.mocked(fetchCareerLogsForDashboard).mockResolvedValue([]);
    jest.mocked(fetchDashboardDailyLogs).mockResolvedValue({
      kind: "ok",
      data: makeLogs("2026-06-01").map((log) => ({
        ...log,
        season_id: log.log_date <= "2026-08-23" ? completed.id : log.log_date >= "2026-08-29" ? active.id : null,
      })),
    });
  });

  afterEach(() => { jest.useRealTimers(); });

  async function renderMonthly() {
    render(await DashboardPage());
    fireEvent.click(screen.getByRole("tab", { name: "月別" }));
    return within(screen.getByRole("tabpanel")).getAllByRole("table")[0]!;
  }

  it("6月と7月は終了済みシーズンを表示し、月全体の数値と1か月1行を維持する", async () => {
    const table = await renderMonthly();
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(fetchSeasons).toHaveBeenCalledTimes(1);
    for (const [month, days] of [["2026-06", "30"], ["2026-07", "31"]] as const) {
      const row = within(table).getByText(month).closest("tr")!;
      expect(within(row).getByText(completed.name)).toBeInTheDocument();
      expect(within(row).queryByText(active.name)).not.toBeInTheDocument();
      expect(within(row).getAllByRole("cell").slice(2).map((cell) => cell.textContent)).toEqual([days, "70.0", "70.0", "0.0", "2,000"]);
    }
  });

  it("8月は複数シーズンと未所属5日を表示する", async () => {
    const table = await renderMonthly();
    const row = within(table).getByText("2026-08").closest("tr")!;
    expect(within(row).getByText(completed.name)).toBeInTheDocument();
    expect(within(row).getByText(active.name)).toBeInTheDocument();
    expect(within(row).getByText("未所属（5日）")).toBeInTheDocument();
    expect(within(row).getAllByRole("cell")[1]).toHaveTextContent(`${completed.name}${active.name}未所属（5日）`);
  });

  it("現在シーズンが変わり旧career_logsの名称が残っていても過去月は保存済み所属を使う", async () => {
    jest.mocked(fetchSeasons).mockResolvedValue({ kind: "ok", data: [completed, { ...active, id: 20, name: "new season" }] });
    jest.mocked(fetchCareerLogsForDashboard).mockResolvedValue([
      { log_date: "2026-06-01", season: "legacy name", target_date: "2026-08-23" },
    ]);
    const table = await renderMonthly();
    const row = within(table).getByText("2026-06").closest("tr")!;
    expect(within(row).getByText(completed.name)).toBeInTheDocument();
    expect(within(row).queryByText(/new season|legacy name/)).not.toBeInTheDocument();
  });

  it("全記録が未所属の月もシーズン欄を表示し、未入力日を数えない", async () => {
    jest.mocked(fetchDashboardDailyLogs).mockResolvedValue({
      kind: "ok", data: [{ ...makeLogs()[0]!, log_date: "2026-06-15", season_id: null }],
    });
    const table = await renderMonthly();
    expect(within(table).getByRole("columnheader", { name: "シーズン" })).toBeInTheDocument();
    expect(within(table).getByText("未所属")).toBeInTheDocument();
    expect(within(table).queryByText(active.name)).not.toBeInTheDocument();
    expect(within(within(table).getAllByRole("row")[1]!).getAllByRole("cell")[2]).toHaveTextContent(/^1$/);
  });

  it("参照先不明と未所属を区別する", async () => {
    jest.mocked(fetchDashboardDailyLogs).mockResolvedValue({
      kind: "ok", data: makeLogs("2026-08-29").map((log, index) => ({ ...log, season_id: index === 0 ? 999 : null })),
    });
    const table = await renderMonthly();
    expect(within(table).getByText("所属不明（1日）")).toBeInTheDocument();
    expect(within(table).getByText("未所属（1日）")).toBeInTheDocument();
    expect(within(table).queryByText(active.name)).not.toBeInTheDocument();
  });

  it("シーズン取得失敗を未所属にせずエラー表示し、月別数値を維持する", async () => {
    jest.mocked(fetchSeasons).mockResolvedValue({ kind: "error", message: "DB error" });
    const table = await renderMonthly();
    expect(screen.getByText(/月別のシーズン名と月次計画は表示できません/)).toBeInTheDocument();
    expect(within(table).getAllByText("取得失敗")).toHaveLength(3);
    expect(within(table).queryByText(/未所属|所属不明/)).not.toBeInTheDocument();
    const row = within(table).getByText("2026-06").closest("tr")!;
    expect(within(row).getAllByRole("cell").slice(2).map((cell) => cell.textContent)).toEqual(["30", "70.0", "70.0", "0.0", "2,000"]);
  });

  it("進行中シーズンがなくても終了済み所属を表示する", async () => {
    jest.mocked(fetchSeasons).mockResolvedValue({ kind: "ok", data: [completed] });
    const table = await renderMonthly();
    const row = within(table).getByText("2026-07").closest("tr")!;
    expect(within(row).getByText(completed.name)).toBeInTheDocument();
    expect(screen.queryByText(/シーズン情報の取得中にエラー/)).not.toBeInTheDocument();
  });

  it("進行中シーズンの複数件エラーを維持し、月別の確定した所属は表示する", async () => {
    jest.mocked(fetchSeasons).mockResolvedValue({ kind: "ok", data: [completed, active, { ...active, id: 20 }] });
    const table = await renderMonthly();
    expect(screen.getByText("シーズン情報の取得中にエラーが発生しました。月次計画は表示されません。")).toBeInTheDocument();
    expect(within(table).getByText("2026-07").closest("tr")).toHaveTextContent(completed.name);
  });

  it("同名の別シーズンをIDで区別し、開始日を補足する", async () => {
    jest.mocked(fetchSeasons).mockResolvedValue({ kind: "ok", data: [completed, { ...active, name: completed.name }] });
    const table = await renderMonthly();
    const row = within(table).getByText("2026-08").closest("tr")!;
    expect(within(row).getByText(`${completed.name} (${completed.startDate})`)).toBeInTheDocument();
    expect(within(row).getByText(`${completed.name} (${active.startDate})`)).toBeInTheDocument();
  });

  it("所属情報を変えても直近3か月・古い月からの表示順を維持する", async () => {
    jest.mocked(fetchDashboardDailyLogs).mockResolvedValue({
      kind: "ok", data: makeLogs("2026-05-01").map((log) => ({ ...log, season_id: completed.id })),
    });
    const table = await renderMonthly();
    expect(within(table).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });
});
