/** @jest-environment jest-environment-jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { GoalNavigator } from "@/components/dashboard/GoalNavigator";
import { MonthlyGoalTable } from "@/components/dashboard/MonthlyGoalTable";
import type { ReadinessMetrics } from "@/lib/utils/calcReadiness";
import type { MonthlyGoalProgress } from "@/lib/utils/calcMonthlyGoalProgress";
import type { MonthlyGoalComparisonRow } from "@/lib/utils/monthlyGoalVisualization";

jest.mock("lucide-react", () => ({
  TrendingDown: () => <span />,
  TrendingUp: () => <span />,
  Target: () => <span />,
  Gauge: () => <span />,
  Utensils: () => <span />,
  AlertTriangle: () => <span />,
  CheckCircle2: () => <span />,
  CircleDot: () => <span />,
  HelpCircle: () => <span />,
  CalendarDays: () => <span />,
}));

const metrics: ReadinessMetrics = {
  current_weight: 76.3,
  weight_7d_avg: 76.3,
  weight_14d_avg: 76.2,
  weight_change_7d: null,
  weekly_rate_kg: null,
  weekly_rate_kg_per_2weeks: null,
  days_to_contest: 90,
  remaining_to_goal_kg: null,
  required_rate_kg_per_week: null,
  required_rate_kg_per_2weeks: null,
};

describe("Bulk月次目標の超過表示", () => {
  it("GoalNavigatorに増量ペース超過と具体的な警告を表示する", () => {
    const monthlyGoalProgress: MonthlyGoalProgress = {
      hasData: true,
      monthlyTargetWeight: 75.5,
      comparisonWeight: 76.3,
      deltaKg: 0.8,
      daysToMonthEnd: 16,
      weeksToMonthEnd: 16 / 7,
      requiredPaceKgPerWeek: -0.35,
      state: "over_pace",
      hasWarnings: true,
      dashboardWarningLabel: "⚠ 今月末目標を0.8kg上回っています",
    };

    render(
      <GoalNavigator
        metrics={metrics}
        phase="Bulk"
        goalWeight={76.4}
        contestDate="2026-12-31"
        avgCalories={null}
        monthlyGoalProgress={monthlyGoalProgress}
      />
    );

    expect(screen.getAllByText("増量ペース超過")).toHaveLength(2);
    expect(
      screen.getByText("⚠ 今月末目標を0.8kg上回っています")
    ).toBeInTheDocument();
  });

  it("過去月のBulk目標超過を緑の先行ではなく超過として表示する", () => {
    const row: MonthlyGoalComparisonRow = {
      month: "2026-07",
      monthEndTarget: 75.5,
      monthStartWeight: 74.5,
      actualMonthEndWeight: 76.3,
      isCurrentMonth: false,
      isFutureMonth: false,
      isPartialActual: false,
      diffKg: 0.8,
      nextRequiredDeltaKg: null,
      progressState: "over",
    };

    render(<MonthlyGoalTable rows={[row]} />);

    expect(screen.getByText("超過")).toBeInTheDocument();
    expect(screen.queryByText("先行")).not.toBeInTheDocument();
    expect(screen.getByText("+0.8")).toHaveClass("text-rose-500");
  });
});
