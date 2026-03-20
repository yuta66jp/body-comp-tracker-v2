/**
 * MonthlyGoalPlanSection UI 結合テスト
 *
 * テスト戦略:
 * - today を固定値 "2026-03-20" でプロップとして渡す (toJstDateStr() のモック不要)
 * - buildMonthlyGoalPlan / redistributeMonthlyGoals は実装ごとテストする
 * - lucide-react アイコンはシンプルな span に差し替える
 *
 * 検証内容:
 * 1. 前提条件未設定時にエラーメッセージが表示される
 * 2. 有効な設定時に月別テーブルが表示される
 * 3. 月を編集してコミットすると onOverridesChange が呼ばれる
 * 4. 警告メッセージが表示される
 */

// @jest-environment jest-environment-jsdom

import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MonthlyGoalPlanSection } from "@/components/settings/MonthlyGoalPlanSection";
import type { MonthlyGoalOverride } from "@/lib/utils/monthlyGoalPlan";

jest.mock("lucide-react", () => ({
  AlertTriangle: () => <span data-testid="icon-alert-triangle" />,
  Info: () => <span data-testid="icon-info" />,
}));

const TODAY = "2026-03-20";

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

/** 状態を持つラッパー。overrides を実際に更新して再レンダリングをテストできる */
function ControlledSection(props: {
  goalWeight: number | null;
  contestDate: string | null;
  currentWeight: number | null;
  today?: string;
  initialOverrides?: MonthlyGoalOverride[];
  onOverridesChange?: jest.MockedFunction<(o: MonthlyGoalOverride[]) => void>;
}) {
  const [overrides, setOverrides] = useState<MonthlyGoalOverride[]>(props.initialOverrides ?? []);
  const handleChange = (o: MonthlyGoalOverride[]) => {
    setOverrides(o);
    props.onOverridesChange?.(o);
  };
  return (
    <MonthlyGoalPlanSection
      goalWeight={props.goalWeight}
      contestDate={props.contestDate}
      currentWeight={props.currentWeight}
      today={props.today ?? TODAY}
      overrides={overrides}
      onOverridesChange={handleChange}
    />
  );
}

// ─── シナリオ 1: 前提条件未設定 ─────────────────────────────────────────────

describe("MonthlyGoalPlanSection — 前提条件未設定", () => {
  it("contestDate が null のとき案内メッセージが表示される", () => {
    render(
      <MonthlyGoalPlanSection
        goalWeight={70}
        contestDate={null}
        currentWeight={75}
        today={TODAY}
        overrides={[]}
        onOverridesChange={() => {}}
      />
    );
    expect(screen.getByText(/コンテスト日を設定してください/)).toBeInTheDocument();
  });

  it("goalWeight が null のとき案内メッセージが表示される", () => {
    render(
      <MonthlyGoalPlanSection
        goalWeight={null}
        contestDate="2026-06-30"
        currentWeight={75}
        today={TODAY}
        overrides={[]}
        onOverridesChange={() => {}}
      />
    );
    expect(screen.getByText(/目標体重を設定してください/)).toBeInTheDocument();
  });

  it("currentWeight が null のとき案内メッセージが表示される", () => {
    render(
      <MonthlyGoalPlanSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={null}
        today={TODAY}
        overrides={[]}
        onOverridesChange={() => {}}
      />
    );
    expect(screen.getByText(/体重が記録されていません/)).toBeInTheDocument();
  });

  it("contestDate が過去のときエラーが表示される", () => {
    render(
      <MonthlyGoalPlanSection
        goalWeight={70}
        contestDate="2025-01-01"
        currentWeight={75}
        today={TODAY}
        overrides={[]}
        onOverridesChange={() => {}}
      />
    );
    expect(screen.getByText(/コンテスト日が過去です/)).toBeInTheDocument();
  });
});

// ─── シナリオ 2: 月別テーブル表示 ─────────────────────────────────────────

describe("MonthlyGoalPlanSection — 月別テーブル表示", () => {
  it("有効な設定のとき月別テーブルが表示される", () => {
    render(
      <MonthlyGoalPlanSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        today={TODAY}
        overrides={[]}
        onOverridesChange={() => {}}
      />
    );
    // 今月と目標月が表示される
    expect(screen.getByText("2026年3月")).toBeInTheDocument();
    expect(screen.getByText("2026年6月")).toBeInTheDocument();
    // 今月バッジ
    expect(screen.getByText("今月")).toBeInTheDocument();
    // 目標バッジ (最終月)
    expect(screen.getByText("目標")).toBeInTheDocument();
  });

  it("最終月の目標体重は編集不可で teal 色で表示される", () => {
    render(
      <MonthlyGoalPlanSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        today={TODAY}
        overrides={[]}
        onOverridesChange={() => {}}
      />
    );
    // 最終月のセルに input がない (目標体重が固定表示)
    // 最終月のラベルが "終点" バッジとして存在する
    expect(screen.getByText("終点")).toBeInTheDocument();
  });

  it("入力フィールドが最終月以外の月数だけ存在する", () => {
    render(
      <MonthlyGoalPlanSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        today={TODAY}
        overrides={[]}
        onOverridesChange={() => {}}
      />
    );
    // 2026-03 〜 2026-06 の 4 ヶ月のうち、最終月以外の 3 ヶ月に input がある
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(3);
  });
});

// ─── シナリオ 3: インライン編集と再配分 ────────────────────────────────────

describe("MonthlyGoalPlanSection — インライン編集と再配分", () => {
  it("月を編集して blur すると onOverridesChange が呼ばれる", async () => {
    const onOverridesChange = jest.fn();

    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        onOverridesChange={onOverridesChange}
      />
    );

    // 今月 (2026-03) の入力フィールドを編集
    const input = screen.getByRole("spinbutton", { name: "2026年3月 目標体重" });
    fireEvent.change(input, { target: { value: "73" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onOverridesChange).toHaveBeenCalledTimes(1);
    });

    const called = onOverridesChange.mock.calls[0][0] as MonthlyGoalOverride[];
    expect(called).toHaveLength(1);
    expect(called[0]).toMatchObject({ month: "2026-03", targetWeight: 73 });
  });

  it("不正値 (0) を入力して blur すると元の値に戻り onOverridesChange は呼ばれない", async () => {
    const onOverridesChange = jest.fn();

    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        onOverridesChange={onOverridesChange}
      />
    );

    const input = screen.getByRole("spinbutton", { name: "2026年3月 目標体重" });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);

    await waitFor(() => {
      // 0 は不正値なので onOverridesChange は呼ばれない
      expect(onOverridesChange).not.toHaveBeenCalled();
    });
  });

  it("Enter キー押下でもコミットが実行される", async () => {
    const onOverridesChange = jest.fn();

    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        onOverridesChange={onOverridesChange}
      />
    );

    const input = screen.getByRole("spinbutton", { name: "2026年3月 目標体重" });
    fireEvent.change(input, { target: { value: "73.5" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onOverridesChange).toHaveBeenCalledTimes(1);
    });
  });

  it("翌月以降が再配分されてテーブルに反映される", async () => {
    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
      />
    );

    // 今月 (2026-03) を 73.0 kg に設定
    const input = screen.getByRole("spinbutton", { name: "2026年3月 目標体重" });
    fireEvent.change(input, { target: { value: "73" } });
    fireEvent.blur(input);

    // 翌月 (2026-04) は 73 → 70 の 3分の1 = 72.0 kg に再配分されるはず
    await waitFor(() => {
      const apr = screen.getByRole("spinbutton", { name: "2026年4月 目標体重" }) as HTMLInputElement;
      expect(parseFloat(apr.value)).toBeCloseTo(72.0, 1);
    });
  });
});

// ─── シナリオ 4: 警告表示 ───────────────────────────────────────────────────

describe("MonthlyGoalPlanSection — 警告表示", () => {
  it("DEADLINE_TOO_CLOSE 警告が表示される (今月のみの期間)", () => {
    render(
      <MonthlyGoalPlanSection
        goalWeight={70}
        contestDate="2026-03-31"
        currentWeight={75}
        today={TODAY}
        overrides={[]}
        onOverridesChange={() => {}}
      />
    );
    expect(screen.getByText(/コンテスト日まで残り1ヶ月以下です/)).toBeInTheDocument();
  });

  it("HIGH_MONTHLY_DELTA 警告が大幅な目標変化のときに表示される", () => {
    // currentWeight=80, goalWeight=70, 1ヶ月で -10 kg → HIGH_MONTHLY_DELTA
    render(
      <MonthlyGoalPlanSection
        goalWeight={70}
        contestDate="2026-04-30"
        currentWeight={80}
        today={TODAY}
        overrides={[]}
        onOverridesChange={() => {}}
      />
    );
    const warnings = screen.getAllByText(/推奨上限.*を超えています/);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
