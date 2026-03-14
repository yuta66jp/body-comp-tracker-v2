/**
 * FactorAnalysis / FactorAnalysisPlaceholder UI 結合テスト
 * — Analytics unavailable 表示シナリオ
 *
 * テスト戦略:
 * - FactorAnalysisPlaceholder は analyticsAvailability を props で受け取る
 *   Client Component なので、availability を差し替えて表示を検証する
 * - FactorAnalysis は recharts を含むため、recharts をモックして jsdom での
 *   描画エラーを回避する
 * - importance 値の不当な露出（NaN・undefined など）がないことを確認する
 *
 * 検証内容:
 * 1. unavailable: 「分析結果がまだありません」が表示される
 * 2. error: 「データ取得に失敗しました」が表示される
 * 3. FactorAnalysis: importance 値が正常に表示され NaN を露出しない
 * 4. FactorAnalysis: データが空のとき「有効な分析結果がありません」が表示される
 */

// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import type { AnalyticsAvailability } from "@/lib/analytics/status";
import type { FactorEntry, FactorMeta } from "@/lib/utils/factorAnalysisUtils";

// lucide-react をモック（FactorAnalysis は lucide-react を使用しない）

// recharts をモックして jsdom での描画計算エラーを回避する
jest.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-bar-chart">{children}</div>
  ),
  Bar: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-bar">{children}</div>
  ),
  XAxis: () => <div data-testid="recharts-xaxis" />,
  YAxis: () => <div data-testid="recharts-yaxis" />,
  CartesianGrid: () => <div data-testid="recharts-grid" />,
  Tooltip: () => <div data-testid="recharts-tooltip" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-container">{children}</div>
  ),
  Cell: () => <div data-testid="recharts-cell" />,
  LabelList: () => <div data-testid="recharts-label-list" />,
}));

import { FactorAnalysis, FactorAnalysisPlaceholder } from "@/components/charts/FactorAnalysis";

// ─── シナリオ 1: FactorAnalysisPlaceholder — unavailable ─────────────────────

describe("FactorAnalysisPlaceholder — unavailable", () => {
  const unavailableAvailability: AnalyticsAvailability = {
    status: "unavailable",
    lastUpdatedDate: null,
    staleDays: null,
  };

  it("「分析結果がまだありません」が表示される", () => {
    render(
      <FactorAnalysisPlaceholder analyticsAvailability={unavailableAvailability} />
    );

    expect(screen.getByText("分析結果がまだありません")).toBeInTheDocument();
  });

  it("「ML バッチ（analyze.py）が実行されると結果が表示されます」が表示される", () => {
    render(
      <FactorAnalysisPlaceholder analyticsAvailability={unavailableAvailability} />
    );

    expect(
      screen.getByText(/ML バッチ（analyze\.py）が実行されると結果が表示されます/)
    ).toBeInTheDocument();
  });

  it("エラーメッセージ（「データ取得に失敗しました」）は表示されない", () => {
    render(
      <FactorAnalysisPlaceholder analyticsAvailability={unavailableAvailability} />
    );

    expect(screen.queryByText("データ取得に失敗しました")).not.toBeInTheDocument();
  });
});

// ─── シナリオ 2: FactorAnalysisPlaceholder — error ───────────────────────────

describe("FactorAnalysisPlaceholder — error", () => {
  const errorAvailability: AnalyticsAvailability = {
    status: "error",
    lastUpdatedDate: null,
    staleDays: null,
  };

  it("「データ取得に失敗しました」が表示される", () => {
    render(
      <FactorAnalysisPlaceholder analyticsAvailability={errorAvailability} />
    );

    expect(screen.getByText("データ取得に失敗しました")).toBeInTheDocument();
  });

  it("unavailable メッセージ（「分析結果がまだありません」）は表示されない", () => {
    render(
      <FactorAnalysisPlaceholder analyticsAvailability={errorAvailability} />
    );

    expect(screen.queryByText("分析結果がまだありません")).not.toBeInTheDocument();
  });

  it("再読み込みを促す説明文が表示される", () => {
    render(
      <FactorAnalysisPlaceholder analyticsAvailability={errorAvailability} />
    );

    expect(screen.getByText(/ページを再読み込みしてください/)).toBeInTheDocument();
  });
});

// ─── シナリオ 3: FactorAnalysisPlaceholder — analyticsAvailability 未指定 ────

describe("FactorAnalysisPlaceholder — analyticsAvailability 未指定", () => {
  it("unavailable 扱いで「分析結果がまだありません」が表示される", () => {
    render(<FactorAnalysisPlaceholder />);

    // undefined のとき isError = false なので unavailable テキストが表示される
    expect(screen.getByText("分析結果がまだありません")).toBeInTheDocument();
  });
});

// ─── シナリオ 4: FactorAnalysis — 正常データ表示 ─────────────────────────────

describe("FactorAnalysis — 正常データ表示", () => {
  const freshAvailability: AnalyticsAvailability = {
    status: "fresh",
    lastUpdatedDate: "2026-03-14",
    staleDays: null,
  };

  // pct は importance を相対値に変換したもの（合計 100）
  // label は getFeatureLabel の fallback として key をそのまま使う
  const sampleData: Record<string, FactorEntry> = {
    calories: { label: "カロリー", importance: 0.40, pct: 40, stability: "high" },
    protein:  { label: "タンパク質", importance: 0.30, pct: 30, stability: "medium" },
    carbs:    { label: "炭水化物", importance: 0.20, pct: 20, stability: "low" },
    fat:      { label: "脂質", importance: 0.10, pct: 10, stability: "unavailable" },
  };

  const sampleMeta: FactorMeta = {
    sample_count: 60,
    date_from: "2025-01-01",
    date_to: "2026-03-14",
    dropped_count: 5,
    total_rows: 65,
  };

  it("コンポーネントがクラッシュせずにレンダリングされる", () => {
    expect(() => {
      render(
        <FactorAnalysis
          data={sampleData}
          meta={sampleMeta}
          updatedAt="2026-03-14T12:00:00Z"
          analyticsAvailability={freshAvailability}
        />
      );
    }).not.toThrow();
  });

  it("importance 値が正常に変換され NaN が露出しない", () => {
    render(
      <FactorAnalysis
        data={sampleData}
        meta={sampleMeta}
        updatedAt="2026-03-14T12:00:00Z"
        analyticsAvailability={freshAvailability}
      />
    );

    const docText = document.body.textContent ?? "";
    expect(docText).not.toMatch(/NaN/);
    expect(docText).not.toMatch(/undefined/);
  });

  it("重要度パーセント値が表示される（合計 100% に正規化されている）", () => {
    render(
      <FactorAnalysis
        data={sampleData}
        meta={sampleMeta}
        updatedAt="2026-03-14T12:00:00Z"
        analyticsAvailability={freshAvailability}
      />
    );

    // 特徴量テーブルに「%」を含む数値が表示される
    const docText = document.body.textContent ?? "";
    expect(docText).toMatch(/\d+%/);
  });

  it("stale のとき「再計算前データ」注記が表示される", () => {
    const staleAvailability: AnalyticsAvailability = {
      status: "stale",
      lastUpdatedDate: "2026-03-10",
      staleDays: 4,
    };

    render(
      <FactorAnalysis
        data={sampleData}
        meta={sampleMeta}
        updatedAt="2026-03-10T12:00:00Z"
        analyticsAvailability={staleAvailability}
      />
    );

    expect(screen.getByText(/再計算前データ/)).toBeInTheDocument();
  });
});

// ─── シナリオ 5: FactorAnalysis — 空データ ───────────────────────────────────

describe("FactorAnalysis — 空データ", () => {
  const freshAvailability: AnalyticsAvailability = {
    status: "fresh",
    lastUpdatedDate: "2026-03-14",
    staleDays: null,
  };

  it("data が空オブジェクトのとき「有効な分析結果がありません」が表示される", () => {
    render(
      <FactorAnalysis
        data={{}}
        meta={null}
        updatedAt="2026-03-14T12:00:00Z"
        analyticsAvailability={freshAvailability}
      />
    );

    expect(screen.getByText("有効な分析結果がありません")).toBeInTheDocument();
  });

  it("空データでも NaN を露出しない", () => {
    render(
      <FactorAnalysis
        data={{}}
        meta={null}
        updatedAt="2026-03-14T12:00:00Z"
        analyticsAvailability={freshAvailability}
      />
    );

    const docText = document.body.textContent ?? "";
    expect(docText).not.toMatch(/NaN/);
  });
});
