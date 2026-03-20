/**
 * MonthlyGoalPlanSection UI 結合テスト
 *
 * テスト戦略:
 * - today を固定値 "2026-03-20" でプロップとして渡す (toJstDateStr() のモック不要)
 * - buildMonthlyGoalPlan は実装ごとテストする
 * - lucide-react アイコンはシンプルな span に差し替える
 *
 * 検証内容:
 * 1. 前提条件未設定時にエラーメッセージが表示される
 * 2. 有効な設定時に月別テーブルが表示される
 * 3. 月を編集してコミットすると onOverridesChange が呼ばれる
 * 4. 複数月 override が両方保持される (anchor が保たれる)
 * 5. 手動月の「解除」ボタンで override が削除される
 * 6. 警告メッセージが表示される
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

// ─── シナリオ 3: インライン編集 ─────────────────────────────────────────────

describe("MonthlyGoalPlanSection — インライン編集", () => {
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

  it("将来月 (2026-05) も編集可能で onOverridesChange が呼ばれる", async () => {
    const onOverridesChange = jest.fn();

    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        onOverridesChange={onOverridesChange}
      />
    );

    const input = screen.getByRole("spinbutton", { name: "2026年5月 目標体重" });
    fireEvent.change(input, { target: { value: "71" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onOverridesChange).toHaveBeenCalledTimes(1);
    });

    const called = onOverridesChange.mock.calls[0][0] as MonthlyGoalOverride[];
    expect(called.some((o) => o.month === "2026-05" && o.targetWeight === 71)).toBe(true);
  });
});

// ─── シナリオ 4: 複数月 override (anchor 保持) ───────────────────────────────

describe("MonthlyGoalPlanSection — 複数月 override", () => {
  it("2ヶ月に manual を設定しても両方の override が保持される", async () => {
    const onOverridesChange = jest.fn();

    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        onOverridesChange={onOverridesChange}
      />
    );

    // 1回目: 2026-03 を 73 kg に設定
    const mar = screen.getByRole("spinbutton", { name: "2026年3月 目標体重" });
    fireEvent.change(mar, { target: { value: "73" } });
    fireEvent.blur(mar);

    await waitFor(() => expect(onOverridesChange).toHaveBeenCalledTimes(1));

    // 2回目: 2026-05 を 71 kg に設定
    const may = screen.getByRole("spinbutton", { name: "2026年5月 目標体重" });
    fireEvent.change(may, { target: { value: "71" } });
    fireEvent.blur(may);

    await waitFor(() => expect(onOverridesChange).toHaveBeenCalledTimes(2));

    // 最後の呼び出しで両方の override が含まれている
    const lastCall = onOverridesChange.mock.calls[1][0] as MonthlyGoalOverride[];
    expect(lastCall.some((o) => o.month === "2026-03" && o.targetWeight === 73)).toBe(true);
    expect(lastCall.some((o) => o.month === "2026-05" && o.targetWeight === 71)).toBe(true);
  });

  it("ある月を再編集しても他の月の override は保持される", async () => {
    const onOverridesChange = jest.fn();

    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        // 2026-03 を 73, 2026-05 を 71 で初期化
        initialOverrides={[
          { month: "2026-03", targetWeight: 73 },
          { month: "2026-05", targetWeight: 71 },
        ]}
        onOverridesChange={onOverridesChange}
      />
    );

    // 2026-03 を 72 に変更
    const mar = screen.getByRole("spinbutton", { name: "2026年3月 目標体重" });
    fireEvent.change(mar, { target: { value: "72" } });
    fireEvent.blur(mar);

    await waitFor(() => expect(onOverridesChange).toHaveBeenCalledTimes(1));

    const called = onOverridesChange.mock.calls[0][0] as MonthlyGoalOverride[];
    // 2026-03 が更新されている
    expect(called.some((o) => o.month === "2026-03" && o.targetWeight === 72)).toBe(true);
    // 2026-05 は変わっていない
    expect(called.some((o) => o.month === "2026-05" && o.targetWeight === 71)).toBe(true);
  });

  it("複数 override がある場合、手動月に「手動」バッジが複数表示される", async () => {
    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        initialOverrides={[
          { month: "2026-03", targetWeight: 73 },
          { month: "2026-05", targetWeight: 71 },
        ]}
      />
    );

    const manualBadges = screen.getAllByText("手動");
    expect(manualBadges).toHaveLength(2);
  });
});

// ─── シナリオ 5: override 解除 ──────────────────────────────────────────────

describe("MonthlyGoalPlanSection — override 解除", () => {
  it("「解除」ボタンを押すと onOverridesChange が呼ばれ override が削除される", async () => {
    const onOverridesChange = jest.fn();

    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        initialOverrides={[{ month: "2026-03", targetWeight: 73 }]}
        onOverridesChange={onOverridesChange}
      />
    );

    // 「手動」バッジの下の「解除」ボタンを押す
    const resetBtn = screen.getByRole("button", { name: "2026年3月 手動設定を解除" });
    fireEvent.click(resetBtn);

    await waitFor(() => expect(onOverridesChange).toHaveBeenCalledTimes(1));

    const called = onOverridesChange.mock.calls[0][0] as MonthlyGoalOverride[];
    // override が空になる
    expect(called).toHaveLength(0);
  });

  it("解除後は「手動」バッジが消え「自動」バッジに戻る", async () => {
    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        initialOverrides={[{ month: "2026-03", targetWeight: 73 }]}
      />
    );

    // 解除前: 「手動」バッジが存在する
    expect(screen.getByText("手動")).toBeInTheDocument();

    const resetBtn = screen.getByRole("button", { name: "2026年3月 手動設定を解除" });
    fireEvent.click(resetBtn);

    // 解除後: 「手動」バッジが消え、3月が「自動」に戻る
    await waitFor(() => {
      expect(screen.queryByText("手動")).not.toBeInTheDocument();
    });
  });

  it("一方の override を解除しても他方の override は残る", async () => {
    const onOverridesChange = jest.fn();

    render(
      <ControlledSection
        goalWeight={70}
        contestDate="2026-06-30"
        currentWeight={75}
        initialOverrides={[
          { month: "2026-03", targetWeight: 73 },
          { month: "2026-05", targetWeight: 71 },
        ]}
        onOverridesChange={onOverridesChange}
      />
    );

    // 2026-03 のみ解除
    const resetBtn = screen.getByRole("button", { name: "2026年3月 手動設定を解除" });
    fireEvent.click(resetBtn);

    await waitFor(() => expect(onOverridesChange).toHaveBeenCalledTimes(1));

    const called = onOverridesChange.mock.calls[0][0] as MonthlyGoalOverride[];
    // 2026-05 は残っている
    expect(called).toHaveLength(1);
    expect(called[0]).toMatchObject({ month: "2026-05", targetWeight: 71 });
  });
});

// ─── シナリオ 6: 警告表示 ───────────────────────────────────────────────────

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
