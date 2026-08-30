/** @jest-environment jest-environment-jsdom */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { KpiCards } from "./KpiCards";
import { GoalNavigator } from "./GoalNavigator";
import { WeeklyReviewCard } from "./WeeklyReviewCard";
import { formatBulkChange } from "./bulkPacePresentation";
import { calcBulkWeeklyPlanPace, type BulkWeeklyPlanPace } from "@/lib/utils/bulkWeeklyPlanPace";
import { calcReadiness } from "@/lib/utils/calcReadiness";
import { calcWeeklyReview } from "@/lib/utils/calcWeeklyReview";
import { calcDataQuality } from "@/lib/utils/calcDataQuality";
import { mapToAppSettings } from "@/lib/domain/settings";
import type { DashboardDailyLog } from "@/lib/supabase/types";
import type { MonthlyGoalProgress } from "@/lib/utils/calcMonthlyGoalProgress";

const today = "2026-04-14";
const input = {
  startDate: "2026-04-01",
  startWeight: 75,
  targetDate: "2026-04-30",
  entries: [{ month: "2026-04", targetWeight: 76, requiredDeltaKg: 1, source: "auto_redistributed" as const, actualWeight: null }],
};
const unavailable: MonthlyGoalProgress = {
  hasData: false, monthlyTargetWeight: null, comparisonWeight: null, deltaKg: null,
  daysToMonthEnd: null, weeksToMonthEnd: null, requiredPaceKgPerWeek: null,
  state: "unavailable", hasWarnings: false, dashboardWarningLabel: null,
};

function makeLogs(weeklyGain: number): DashboardDailyLog[] {
  return Array.from({ length: 14 }, (_, i) => ({
    id: `log-${i}`, log_date: `2026-04-${String(i + 1).padStart(2, "0")}`,
    weight: 75 + i * weeklyGain / 7, calories: 2300, protein: 140, fat: 60, carbs: 280,
    had_bowel_movement: true, work_mode: "office", training_type: "chest",
    is_cheat_day: false, is_refeed_day: false, is_eating_out: false, is_travel_day: false,
    is_tanning_day: false, is_posing_day: false, created_at: null, updated_at: `${today}T00:00:00Z`,
  }));
}

function renderPanels({
  logs = makeLogs(0.5),
  pace = calcBulkWeeklyPlanPace({ ...input, logs, today }),
  monthly = unavailable,
  phase = "Bulk",
  deadline = input.targetDate as string | null,
  goal = 76 as number | null,
}: {
  logs?: DashboardDailyLog[];
  pace?: BulkWeeklyPlanPace | null;
  monthly?: MonthlyGoalProgress;
  phase?: string;
  deadline?: string | null;
  goal?: number | null;
} = {}) {
  const settings = { ...mapToAppSettings([]), currentPhase: phase, contestDate: deadline, targetWeight: goal };
  const metrics = calcReadiness(logs, { contest_date: deadline, goal_weight: goal }, today);
  const weekly = calcWeeklyReview(logs, metrics, calcDataQuality(logs, today), { phase, bulkPlanPace: pace });
  render(<>
    <section data-testid="kpi"><KpiCards logs={logs} settings={settings} currentWeight={metrics.current_weight} avgTdee={null}
      goalReachResult={{ status: "projected", date: "2026-04-20", label: "2026-04-20" }} bufferDays={146} bulkPlanPace={pace} /></section>
    <section data-testid="navigator"><GoalNavigator metrics={metrics} phase={phase} goalWeight={goal} contestDate={deadline}
      avgCalories={2300} monthlyGoalProgress={monthly} bulkPlanPace={pace} /></section>
    <section data-testid="weekly"><WeeklyReviewCard data={weekly} phase={phase} /></section>
  </>);
  return { pace, nav: within(screen.getByTestId("navigator")), kpi: within(screen.getByTestId("kpi")) };
}

function metricValue(label: string): Element {
  return within(screen.getByTestId("navigator")).getByText(label).parentElement!.lastElementChild!;
}

describe("BulkのKPI・目標達成ナビ・週次サマリーの共通判定", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(`${today}T03:00:00Z`)); });
  afterEach(() => { jest.useRealTimers(); });

  it.each([
    [0.24, "on_plan", "計画内", "emerald"],
    [0.08, "slow", "増量ペースが緩め", "amber"],
    [0.3, "slightly_fast", "やや速い", "amber"],
    [0.5, "over_pace", "増量ペース超過", "rose"],
    [-0.1, "wrong_direction", "増量方向外", "rose"],
  ] as const)("実績前週比%sで3箇所の判定・色を一致させる", (gain, state, label, color) => {
    const { pace, nav, kpi } = renderPanels({ logs: makeLogs(gain) });
    expect(pace?.state).toBe(state);
    for (const panel of ["kpi", "navigator", "weekly"]) {
      expect(within(screen.getByTestId(panel)).getByText(label).className).toContain(`text-${color}-`);
    }
    expect(metricValue("実績ペース")).toHaveTextContent(formatBulkChange(gain));
    expect(metricValue("実績ペース").className).toContain("text-slate-");
    expect(metricValue("計画との差").className).toContain(`text-${color}-`);
    expect(metricValue("計画との差")).toHaveTextContent(formatBulkChange(gain - pace!.plannedChangeKg!));
    expect(kpi.queryByText("目標到達予定")).not.toBeInTheDocument();
    expect(kpi.queryByText(/バッファ/)).not.toBeInTheDocument();
    expect(kpi.queryByText("2026-04-20")).not.toBeInTheDocument();
    expect(kpi.getByText("増量ペース")).toBeInTheDocument();
    expect(nav.queryByText(/先行|遅れ|順調|調整は最小限|現状維持/)).not.toBeInTheDocument();
    expect(nav.queryByText("必要ペース")).not.toBeInTheDocument();
    expect(nav.queryByText("推奨調整")).not.toBeInTheDocument();
    expect(nav.queryByText("目標摂取")).not.toBeInTheDocument();
  });

  it("Bulk現在体重の増加を緑にしない", () => {
    const { kpi } = renderPanels();
    expect(kpi.getByText("+0.5 kg/週").parentElement).toHaveClass("text-slate-400");
  });

  it("開始直後は旧シーズンの記録があっても判定待ち・実際の記録日数を表示する", () => {
    const logs = makeLogs(0.5);
    const pace = calcBulkWeeklyPlanPace({ ...input, startDate: "2026-04-13", startWeight: 75.9,
      entries: [{ ...input.entries[0]!, requiredDeltaKg: 0.1 }], logs, today });
    const { nav, kpi } = renderPanels({ logs: logs.slice(-2), pace });
    for (const panel of [nav, kpi]) {
      expect(panel.getByText("判定待ち")).toBeInTheDocument();
      expect(panel.getByText(/今週 2日 \/ 前週 0日/)).toBeInTheDocument();
      expect(panel.getByText(/最短で2026-04-26/)).toBeInTheDocument();
    }
    expect(metricValue("実績ペース")).toHaveTextContent(/^—$/);
    expect(metricValue("計画との差")).toHaveTextContent(/^—$/);
    expect(nav.queryByText(/停滞中|順調|現状維持|kcal\/日/)).not.toBeInTheDocument();
  });

  it("各7日窓が5日未満なら記録不足を表示する", () => {
    const { nav } = renderPanels({ logs: makeLogs(0.5).slice(0, 11) });
    expect(screen.getAllByText("体重記録不足")).toHaveLength(3);
    expect(nav.getByText(/今週 4日 \/ 前週 7日/)).toBeInTheDocument();
    expect(nav.queryByText(/最短で/)).not.toBeInTheDocument();
    expect(metricValue("実績ペース")).toHaveTextContent(/^—$/);
  });

  it("欠損日のある5日対5日の比較でも同じ記録日の計画値を使う", () => {
    const logs = makeLogs(0.24).filter((_, i) => ![0, 1, 12, 13].includes(i));
    const { pace } = renderPanels({ logs });
    expect(pace?.currentWeightDays).toBe(5);
    expect(pace?.previousWeightDays).toBe(5);
    expect(pace?.plannedChangeKg).toBeCloseTo(5 / 29);
    expect(metricValue("計画ペース")).toHaveTextContent("+0.17 kg（前週比）");
  });

  it.each([null, "expired", "invalid"] as const)("計画不備%sは従来の順調判定へフォールバックしない", (kind) => {
    const pace = kind === null ? null : calcBulkWeeklyPlanPace({ ...input, logs: makeLogs(0.5),
      today: kind === "expired" ? "2026-05-01" : today,
      entries: kind === "invalid" ? [{ ...input.entries[0]!, targetWeight: 78, requiredDeltaKg: 3 }] : input.entries,
    });
    const { nav } = renderPanels({ pace, deadline: kind === "expired" ? "2026-04-01" : null, goal: null });
    expect(screen.getAllByText("月次計画を確認")).toHaveLength(3);
    expect(within(screen.getByTestId("weekly")).queryByText(/順調に増量中|摂取カロリーを増やすことを検討/)).not.toBeInTheDocument();
    expect(nav.queryByText(/順調|現状維持|先行/)).not.toBeInTheDocument();
    expect(nav.getByText("目標体重が未設定です")).toBeInTheDocument();
  });

  it.each(["ahead", "over_pace"] as const)("月末目標との差%sと開始直後の判定待ちを混同しない", (state) => {
    const logs = makeLogs(0.5).slice(-2);
    const pace = calcBulkWeeklyPlanPace({ ...input, startDate: "2026-04-13", startWeight: 75.9,
      entries: [{ ...input.entries[0]!, requiredDeltaKg: 0.1 }], logs, today });
    const { nav } = renderPanels({ logs, pace, monthly: {
      ...unavailable, hasData: true, state, comparisonWeight: 76.8, monthlyTargetWeight: 76,
      deltaKg: 0.8, requiredPaceKgPerWeek: -0.4,
    } });
    expect(nav.getByText("判定待ち")).toBeInTheDocument();
    expect(nav.getByText(state === "ahead" ? "月末目標を上回る" : "月末目標を超過")).toBeInTheDocument();
    expect(nav.getByText("月末目標との差（最新体重）")).toBeInTheDocument();
    expect(nav.queryByText("増量ペース超過")).not.toBeInTheDocument();
    expect(nav.queryByText(/先行|残必要ペース/)).not.toBeInTheDocument();
  });

  it("月末目標超過でも週次ペースが計画内なら別の注意を残す", () => {
    const { nav } = renderPanels({ logs: makeLogs(0.24), monthly: {
      ...unavailable, hasData: true, state: "over_pace", deltaKg: 0.8,
      comparisonWeight: 76.8, monthlyTargetWeight: 76,
    } });
    expect(nav.getByText("計画内")).toBeInTheDocument();
    expect(nav.getByText("月末目標を超過")).toBeInTheDocument();
    expect(nav.getByText(/最新体重は月末目標を上回っています/)).toBeInTheDocument();
    expect(nav.queryByText("現状維持")).not.toBeInTheDocument();
  });

  it("Cutの予測・バッファ・14日回帰と数値調整は維持する", () => {
    const { kpi, nav } = renderPanels({ logs: makeLogs(-0.5), phase: "Cut", goal: 73.5 });
    expect(kpi.getByText("目標到達予定")).toBeInTheDocument();
    expect(kpi.getByText("バッファ +146 日")).toHaveClass("text-emerald-600");
    expect(kpi.queryByText("増量ペース")).not.toBeInTheDocument();
    expect(nav.getByText("必要ペース")).toBeInTheDocument();
    expect(metricValue("実績ペース")).toHaveTextContent("-1.0 kg/2週");
    expect(metricValue("実績ペース")).toHaveClass("text-emerald-600");
    expect(nav.getByText("推奨調整")).toBeInTheDocument();
    expect(nav.getByText("目標摂取")).toBeInTheDocument();
  });

  it("最終目標付近でもBulkのペース超過を目標達成に置き換えない", () => {
    const { nav } = renderPanels({ goal: 75.75, deadline: today });
    expect(nav.getByText("増量ペース超過")).toBeInTheDocument();
    expect(nav.getByText("本日が目標日です")).toBeInTheDocument();
    expect(nav.queryByText("目標達成")).not.toBeInTheDocument();
  });

  it.each([
    [null, "目標日を設定してください"],
    ["2026-04-13", "目標日を過ぎています。設定から目標日・月次計画を確認してください"],
  ])("Bulk目標日%sの案内をペース判定とは別に表示する", (deadline, message) => {
    const { nav } = renderPanels({ deadline, pace: null });
    expect(nav.getByText(message)).toBeInTheDocument();
    expect(nav.getByText("月次計画を確認")).toBeInTheDocument();
  });

  it.each([[null, "—"], [-0.001, "0.00 kg（前週比）"], [-0.2, "-0.20 kg（前週比）"]])(
    "差%sを符号を落とさず丸めて表示する", (value, expected) => {
      expect(formatBulkChange(value as number | null)).toBe(expected);
    }
  );
});
