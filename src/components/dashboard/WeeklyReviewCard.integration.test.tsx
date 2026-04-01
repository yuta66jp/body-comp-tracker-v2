/**
 * WeeklyReviewCard UI 結合テスト
 *
 * 栄養セクションは左列に数値要約だけを置き、評価は右列の所見カードへ寄せる。
 * null 値でも NaN/undefined を露出せず安全にフォールバックすることを確認する。
 */

// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { WeeklyReviewCard } from "@/components/dashboard/WeeklyReviewCard";
import type { WeeklyReviewData } from "@/lib/utils/calcWeeklyReview";

jest.mock("lucide-react", () => ({
  ClipboardList: () => <span data-testid="icon-clipboard" />,
  TrendingDown: () => <span data-testid="icon-trending-down" />,
  TrendingUp: () => <span data-testid="icon-trending-up" />,
  Minus: () => <span data-testid="icon-minus" />,
  CheckCircle2: () => <span data-testid="icon-check" />,
  CircleDot: () => <span data-testid="icon-dot" />,
  AlertTriangle: () => <span data-testid="icon-alert" />,
  HelpCircle: () => <span data-testid="icon-help" />,
  Flame: () => <span data-testid="icon-flame" />,
  Beef: () => <span data-testid="icon-beef" />,
}));

function makeData(overrides: Partial<WeeklyReviewData> = {}): WeeklyReviewData {
  return {
    weekLabel: "2026-03-27〜2026-04-02",
    weight: {
      avg: 70,
      prevAvg: 70.3,
      change: -0.3,
      trendKgPerWeek: -0.35,
      bwRatePctPerWeek: 0.5,
    },
    nutrition: {
      avgCalories: 2000,
      avgProtein: 140,
      avgFat: 50,
      avgCarbs: 220,
      daysLogged: 7,
      proteinRatioPct: 28,
      proteinGPerKgBw: 2,
      fatCaloriesRatioPct: 23,
    },
    tdee: {
      avgEstimated: 2300,
      balancePerDay: -300,
    },
    quality: {
      score: 90,
      weightMissingDays: 0,
      caloriesMissingDays: 0,
    },
    stagnation: {
      level: "advancing",
      weightChange7d: -0.3,
      trendKgPerWeek: -0.35,
      qualityNote: null,
    },
    specialDays: {
      cheatDays: 0,
      refeedDays: 0,
      eatingOutDays: 0,
      travelDays: 0,
      totalTaggedDays: 0,
    },
    findings: [],
    ...overrides,
  };
}

describe("WeeklyReviewCard", () => {
  it("左列にタンパク質 g/kg BW と脂質比を表示し、タンパク質比の独立行を出さない", () => {
    render(<WeeklyReviewCard data={makeData()} phase="Cut" />);

    expect(screen.getByText("タンパク質")).toBeInTheDocument();
    expect(screen.getByText("脂質")).toBeInTheDocument();
    expect(screen.getByText("g/kg BW")).toBeInTheDocument();
    expect(screen.getByText("(140g)")).toBeInTheDocument();
    expect(screen.queryByText("タンパク質比")).not.toBeInTheDocument();
    expect(screen.getAllByText(/脂質比 23%/)).toHaveLength(1);
  });

  it("右列の所見に脂質評価カードを追加する", () => {
    render(<WeeklyReviewCard data={makeData()} phase="Cut" />);

    expect(screen.getByText("脂質比 23%")).toBeInTheDocument();
    expect(screen.getAllByText("推奨レンジ内を維持")).toHaveLength(2);
  });

  it("必要値が欠けるときは — 表示にフォールバックし、該当所見カードを出さない", () => {
    render(
      <WeeklyReviewCard
        data={makeData({
          nutrition: {
            avgCalories: 2000,
            avgProtein: 140,
            avgFat: null,
            avgCarbs: 220,
            daysLogged: 7,
            proteinRatioPct: 28,
            proteinGPerKgBw: null,
            fatCaloriesRatioPct: null,
          },
        })}
        phase="Cut"
      />
    );

    const docText = document.body.textContent ?? "";
    expect(docText).not.toMatch(/NaN|undefined/);
    expect(screen.queryByText(/タンパク質 2\.00 g\/kg BW/)).not.toBeInTheDocument();
    expect(screen.queryByText(/脂質比 23%/)).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
