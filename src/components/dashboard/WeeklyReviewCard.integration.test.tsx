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
import { calcBulkWeeklyPlanPace } from "@/lib/utils/bulkWeeklyPlanPace";

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
  Moon: () => <span data-testid="icon-moon" />,
  HeartPulse: () => <span data-testid="icon-heart-pulse" />,
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
    sleep: {
      avgSleepHours: null,
      sleepDaysLogged: 0,
      avgBedTime: null,
      avgWakeTime: null,
      avgBedTimeDeltaMins: null,
      avgWakeTimeDeltaMins: null,
      timeDaysLogged: 0,
    },
    cardio: {
      hrv: {
        avg7d: null,
        daysLogged7d: 0,
        baselineAvg14d: null,
        baselineStdDev14d: null,
        deviationPct: null,
      },
      rhr: {
        avg7d: null,
        daysLogged7d: 0,
        baselineAvg14d: null,
        baselineStdDev14d: null,
        deviationPct: null,
      },
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
  const bulkInput = {
    startDate: "2026-04-01",
    startWeight: 75,
    targetDate: "2026-04-30",
    entries: [{
      month: "2026-04",
      targetWeight: 76,
      requiredDeltaKg: 1,
      source: "auto_redistributed" as const,
      actualWeight: null,
    }],
    logs: Array.from({ length: 14 }, (_, index) => ({
      log_date: `2026-04-${String(index + 1).padStart(2, "0")}`,
      weight: 75 + index / 29,
    })),
  };

  it.each([
    [1, 1, 0],
    [7, 7, 0],
    [13, 7, 6],
  ])("Bulk開始%d日目は判定待ち・実際の日数・最短判定開始日を表示する", (day, currentDays, previousDays) => {
    render(<WeeklyReviewCard data={makeData({
      bulkPlanPace: calcBulkWeeklyPlanPace({
        ...bulkInput,
        today: `2026-04-${String(day).padStart(2, "0")}`,
      }),
    })} phase="Bulk" />);

    expect(screen.getByText("判定待ち")).toBeInTheDocument();
    expect(screen.queryByText("体重記録不足")).not.toBeInTheDocument();
    expect(screen.queryByText("データ不足")).not.toBeInTheDocument();
    expect(screen.getByText(/最短で2026-04-14から判定できます/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`今週 ${currentDays}日 / 前週 ${previousDays}日（今シーズン内）`))).toBeInTheDocument();
    expect(screen.getByText("70.0")).toBeInTheDocument();
    expect(screen.getByText("-0.3 kg")).toBeInTheDocument();
    expect(screen.queryByText("計画比")).not.toBeInTheDocument();
    expect(screen.getByText(/開始日を含めて14日目以降/)).toBeInTheDocument();
  });

  it("Bulk開始14日目で日数不足なら判定待ちではなく体重記録不足を表示する", () => {
    render(<WeeklyReviewCard data={makeData({
      bulkPlanPace: calcBulkWeeklyPlanPace({
        ...bulkInput,
        today: "2026-04-14",
        logs: bulkInput.logs.slice(0, 11),
      }),
    })} phase="Bulk" />);

    expect(screen.getByText("体重記録不足")).toBeInTheDocument();
    expect(screen.queryByText("判定待ち")).not.toBeInTheDocument();
    expect(screen.queryByText(/最短で/)).not.toBeInTheDocument();
    expect(screen.getByText(/今週 4日 \/ 前週 7日/)).toBeInTheDocument();
  });

  it("Bulk開始14日目で日数がそろえば通常の計画内表示へ切り替わる", () => {
    render(<WeeklyReviewCard data={makeData({
      bulkPlanPace: calcBulkWeeklyPlanPace({ ...bulkInput, today: "2026-04-14" }),
    })} phase="Bulk" />);

    expect(screen.getByText("計画内")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByText("判定待ち")).not.toBeInTheDocument();
    expect(screen.queryByText(/最短で/)).not.toBeInTheDocument();
  });

  it("Bulk開始直後でも月次計画の警告が判定待ちより優先される", () => {
    render(<WeeklyReviewCard data={makeData({
      bulkPlanPace: calcBulkWeeklyPlanPace({
        ...bulkInput,
        today: "2026-04-13",
        entries: [{ ...bulkInput.entries[0]!, targetWeight: 76.1, requiredDeltaKg: 1.1 }],
      }),
    })} phase="Bulk" />);

    expect(screen.getByText("月次計画を確認")).toBeInTheDocument();
    expect(screen.getByText(/上限を超える月次目標があります/)).toBeInTheDocument();
    expect(screen.queryByText("判定待ち")).not.toBeInTheDocument();
    expect(screen.queryByText(/最短で/)).not.toBeInTheDocument();
  });

  it("CutではBulkの判定待ち情報を使用しない", () => {
    render(<WeeklyReviewCard data={makeData({
      bulkPlanPace: calcBulkWeeklyPlanPace({ ...bulkInput, today: "2026-04-13" }),
    })} phase="Cut" />);

    expect(screen.getByText("順調")).toBeInTheDocument();
    expect(screen.queryByText("判定待ち")).not.toBeInTheDocument();
    expect(screen.queryByText(/最短で/)).not.toBeInTheDocument();
    expect(screen.queryByText(/開始日を含めて14日目以降/)).not.toBeInTheDocument();
  });

  it("Bulkは月次計画比で超過表示し、Cut固有の%BW基準を表示しない", () => {
    render(
      <WeeklyReviewCard
        data={makeData({
          weight: {
            avg: 75.8,
            prevAvg: 75.4,
            change: 0.4,
            trendKgPerWeek: 0.38,
            bwRatePctPerWeek: -0.5,
          },
          bulkPlanPace: {
            state: "over_pace",
            actualChangeKg: 0.4,
            plannedChangeKg: 0.2,
            paceRatioPct: 200,
            actualChangePct: 0.53,
            currentWeightDays: 7,
            previousWeightDays: 7,
            dataInsufficientReason: null,
            earliestEvaluationDate: "2026-04-14",
            monthlyLimitViolations: [],
          },
        })}
        phase="Bulk"
      />
    );

    expect(screen.getByText("増量ペース超過")).toBeInTheDocument();
    expect(screen.getByText("計画ペース")).toBeInTheDocument();
    expect(screen.getByText("+0.2 kg/週")).toBeInTheDocument();
    expect(screen.getByText("計画比")).toBeInTheDocument();
    expect(screen.getByText("200%")).toBeInTheDocument();
    expect(screen.queryByText(/推奨レンジ 0.5〜1.0% BW\/週/)).not.toBeInTheDocument();
  });

  it("左列にタンパク質 g/kg BW と脂質比を表示し、タンパク質比の独立行を出さない", () => {
    render(<WeeklyReviewCard data={makeData()} phase="Cut" />);

    expect(screen.getByText("タンパク質")).toBeInTheDocument();
    expect(screen.getByText("脂質")).toBeInTheDocument();
    expect(screen.getByText("g/kg BW")).toBeInTheDocument();
    expect(screen.getByText("(140g)")).toBeInTheDocument();
    expect(screen.getByText("(50g)")).toBeInTheDocument();
    expect(
      screen.getByText("推奨レンジ 1.8〜2.7 g/kg BW（Roberts et al. 2020）")
    ).toBeInTheDocument();
    expect(
      screen.getByText("推奨レンジ 15〜30%（Helms et al. 2014）")
    ).toBeInTheDocument();
    expect(screen.queryByText("タンパク質比")).not.toBeInTheDocument();
    expect(screen.getAllByText("推奨レンジ")).toHaveLength(3);
  });

  it("右列の所見に脂質評価カードを追加する", () => {
    render(<WeeklyReviewCard data={makeData()} phase="Cut" />);

    expect(screen.getByText("脂質比 23%（平均 50 g/日）")).toBeInTheDocument();
    expect(screen.getAllByText("推奨レンジ内を維持")).toHaveLength(2);
  });

  it("avgSleepHours が非 null のとき睡眠セクションを表示し、ステータスラベルを付与する", () => {
    render(
      <WeeklyReviewCard
        data={makeData({ sleep: { avgSleepHours: 7.5, sleepDaysLogged: 6, avgBedTime: null, avgWakeTime: null, avgBedTimeDeltaMins: null, avgWakeTimeDeltaMins: null, timeDaysLogged: 0 } })}
        phase="Cut"
      />
    );

    expect(screen.getByText("睡眠 (6 日分)")).toBeInTheDocument();
    expect(screen.getByText("平均睡眠時間")).toBeInTheDocument();
    expect(screen.getByText("h")).toBeInTheDocument();
    expect(screen.getByText("目安: 7〜9 時間")).toBeInTheDocument();
    expect(screen.getByText("適正")).toBeInTheDocument();
  });

  it("avgSleepHours < 7 のとき「短め」ラベルを表示する", () => {
    render(
      <WeeklyReviewCard
        data={makeData({ sleep: { avgSleepHours: 6.0, sleepDaysLogged: 5, avgBedTime: null, avgWakeTime: null, avgBedTimeDeltaMins: null, avgWakeTimeDeltaMins: null, timeDaysLogged: 0 } })}
        phase="Cut"
      />
    );
    expect(screen.getByText("短め")).toBeInTheDocument();
  });

  it("avgSleepHours > 9 のとき「長め」ラベルを表示する", () => {
    render(
      <WeeklyReviewCard
        data={makeData({ sleep: { avgSleepHours: 9.5, sleepDaysLogged: 7, avgBedTime: null, avgWakeTime: null, avgBedTimeDeltaMins: null, avgWakeTimeDeltaMins: null, timeDaysLogged: 0 } })}
        phase="Cut"
      />
    );
    expect(screen.getByText("長め")).toBeInTheDocument();
  });

  it("avgSleepHours が null のとき睡眠セクションを表示しない (bed/wake も null)", () => {
    render(
      <WeeklyReviewCard
        data={makeData({ sleep: { avgSleepHours: null, sleepDaysLogged: 0, avgBedTime: null, avgWakeTime: null, avgBedTimeDeltaMins: null, avgWakeTimeDeltaMins: null, timeDaysLogged: 0 } })}
        phase="Cut"
      />
    );
    expect(screen.queryByText("平均睡眠時間")).not.toBeInTheDocument();
  });

  it("avgBedTime / avgWakeTime が非 null のとき就寝・起床時刻を表示する", () => {
    render(
      <WeeklyReviewCard
        data={makeData({
          sleep: {
            avgSleepHours: 7.5,
            sleepDaysLogged: 6,
            avgBedTime: "23:30",
            avgWakeTime: "07:00",
            avgBedTimeDeltaMins: 15,
            avgWakeTimeDeltaMins: -10,
            timeDaysLogged: 6,
          },
        })}
        phase="Cut"
      />
    );
    expect(screen.getByText("就寝")).toBeInTheDocument();
    expect(screen.getByText("23:30")).toBeInTheDocument();
    expect(screen.getByText("(+15分)")).toBeInTheDocument();
    expect(screen.getByText("起床")).toBeInTheDocument();
    expect(screen.getByText("07:00")).toBeInTheDocument();
    expect(screen.getByText("(-10分)")).toBeInTheDocument();
  });

  it("avgBedTimeDeltaMins が null のとき delta を表示しない", () => {
    render(
      <WeeklyReviewCard
        data={makeData({
          sleep: {
            avgSleepHours: null,
            sleepDaysLogged: 0,
            avgBedTime: "23:30",
            avgWakeTime: "07:00",
            avgBedTimeDeltaMins: null,
            avgWakeTimeDeltaMins: null,
            timeDaysLogged: 3,
          },
        })}
        phase="Cut"
      />
    );
    expect(screen.getByText("就寝")).toBeInTheDocument();
    expect(screen.getByText("23:30")).toBeInTheDocument();
    // delta が null のときは delta テキストが出ない
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\+\d+分/);
  });

  it("sleepDaysLogged と timeDaysLogged のうち大きい方をヘッダーに表示する", () => {
    render(
      <WeeklyReviewCard
        data={makeData({
          sleep: {
            avgSleepHours: 7.0,
            sleepDaysLogged: 4,
            avgBedTime: "23:00",
            avgWakeTime: "07:00",
            avgBedTimeDeltaMins: null,
            avgWakeTimeDeltaMins: null,
            timeDaysLogged: 6,
          },
        })}
        phase="Cut"
      />
    );
    expect(screen.getByText("睡眠 (6 日分)")).toBeInTheDocument();
  });

  it("心肺機能セクションにHRVと安静時心拍数を表示する", () => {
    render(
      <WeeklyReviewCard
        data={makeData({
          cardio: {
            hrv: {
              avg7d: 127,
              daysLogged7d: 5,
              baselineAvg14d: 124.5,
              baselineStdDev14d: 8.2,
              deviationPct: 2,
            },
            rhr: {
              avg7d: 43.4,
              daysLogged7d: 6,
              baselineAvg14d: 44.1,
              baselineStdDev14d: 1.7,
              deviationPct: -1.6,
            },
          },
        })}
        phase="Cut"
      />
    );

    expect(screen.getByText("心肺機能 (6 日分)")).toBeInTheDocument();
    expect(screen.getByText("HRV")).toBeInTheDocument();
    expect(screen.getByText("127.0")).toBeInTheDocument();
    expect(screen.getByText("ms")).toBeInTheDocument();
    expect(screen.getByText("(2週 124.5±8.2ms)")).toBeInTheDocument();
    expect(screen.getByText("安静時")).toBeInTheDocument();
    expect(screen.getByText("43.4")).toBeInTheDocument();
    expect(screen.getByText("bpm")).toBeInTheDocument();
    expect(screen.getByText("(2週 44.1±1.7bpm)")).toBeInTheDocument();
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
    expect(screen.queryByText("(50g)")).not.toBeInTheDocument();
    expect(
      screen.queryByText("推奨レンジ 1.8〜2.7 g/kg BW（Roberts et al. 2020）")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("推奨レンジ 15〜30%（Helms et al. 2014）")
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
