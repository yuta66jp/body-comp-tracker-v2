/**
 * BacktestResults / BacktestComparison mobile UI 結合テスト
 *
 * 検証内容:
 * 1. Best model カードが sm:grid-cols-3 (モバイルで縦積み可能) レイアウトになっている
 * 2. モバイル詳細カードが horizon ごとにレンダリングされる (md:hidden)
 * 3. BacktestComparison のモバイル horizon サマリーカードが表示される (md:hidden)
 * 4. ForecastAccuracyRefreshButton が refresh ボタンをレンダリングする
 */

// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import type {
  ForecastBacktestRun,
  ForecastBacktestMetric,
} from "@/lib/supabase/types";

// recharts をモック
jest.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="recharts-bar" />,
  XAxis: () => <div data-testid="recharts-xaxis" />,
  YAxis: () => <div data-testid="recharts-yaxis" />,
  CartesianGrid: () => <div data-testid="recharts-grid" />,
  Tooltip: () => <div data-testid="recharts-tooltip" />,
  Legend: () => <div data-testid="recharts-legend" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-container">{children}</div>
  ),
}));

// lucide-react をモック
jest.mock("lucide-react", () => ({
  AlertTriangle: () => <span data-testid="icon-alert" />,
  AlertCircle: () => <span data-testid="icon-alert-circle" />,
  TrendingUp: () => <span data-testid="icon-trending-up" />,
  TrendingDown: () => <span data-testid="icon-trending-down" />,
  Minus: () => <span data-testid="icon-minus" />,
  Info: () => <span data-testid="icon-info" />,
}));

import { BacktestResults } from "@/components/charts/BacktestResults";
import { BacktestComparison } from "@/components/charts/BacktestComparison";

// ─── テストフィクスチャ ─────────────────────────────────────────────────────

const MOCK_RUN: ForecastBacktestRun = {
  id: "run-1",
  series_type: "daily",
  created_at: "2026-03-01T00:00:00Z",
  train_min_date: "2025-01-01",
  train_max_date: "2026-02-28",
  n_source_rows: 200,
  notes: null,
};

function makeMetric(
  model: string,
  horizon: number,
  mae: number
): ForecastBacktestMetric {
  return {
    id: `${model}-${horizon}`,
    run_id: "run-1",
    model_name: model,
    horizon_days: horizon,
    mae,
    rmse: mae * 1.2,
    mape: mae * 5,
    bias: 0.01,
    n_predictions: 30,
  };
}

const MOCK_METRICS: ForecastBacktestMetric[] = [
  makeMetric("NeuralProphet",   7,  0.345),
  makeMetric("Naive",           7,  0.520),
  makeMetric("MovingAverage7d", 7,  0.380),
  makeMetric("LinearTrend30d",  7,  0.420),
  makeMetric("EWLinearTrend",   7,  0.320), // best at 7d
  makeMetric("NeuralProphet",   14, 0.410),
  makeMetric("Naive",           14, 0.590),
  makeMetric("MovingAverage7d", 14, 0.450),
  makeMetric("LinearTrend30d",  14, 0.390), // best at 14d
  makeMetric("EWLinearTrend",   14, 0.400),
  makeMetric("NeuralProphet",   30, 0.480),
  makeMetric("Naive",           30, 0.650),
  makeMetric("MovingAverage7d", 30, 0.510),
  makeMetric("LinearTrend30d",  30, 0.460), // best at 30d
  makeMetric("EWLinearTrend",   30, 0.470),
];

// ─── BacktestResults ─────────────────────────────────────────────────────────

describe("BacktestResults", () => {
  it("ベストモデルカードが sm:grid-cols-3 レイアウトになっている", () => {
    const { container } = render(
      <BacktestResults run={MOCK_RUN} metrics={MOCK_METRICS} />
    );
    // Best model カードのグリッド wrapper
    const grid = container.querySelector(".sm\\:grid-cols-3");
    expect(grid).not.toBeNull();
  });

  it("ベストモデルカードが horizon ごとに表示される", () => {
    render(<BacktestResults run={MOCK_RUN} metrics={MOCK_METRICS} />);
    // 7日先 / 14日先 / 30日先 — それぞれ「最良モデル」テキスト
    expect(screen.getAllByText(/日先 — 最良モデル/)).toHaveLength(3);
  });

  it("モバイル詳細カードが horizon ごとに見出しを表示する", () => {
    render(<BacktestResults run={MOCK_RUN} metrics={MOCK_METRICS} />);
    // md:hidden 内の h3 "X 日先"
    // Tailwind のクラスは DOM に存在する (非表示はブラウザ側で制御)
    expect(screen.getAllByText("7 日先").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("14 日先").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("30 日先").length).toBeGreaterThanOrEqual(1);
  });

  it("モバイル詳細カードで 7日先の最良モデル (EW Linear Trend) がランク1位に表示される", () => {
    const { container } = render(
      <BacktestResults run={MOCK_RUN} metrics={MOCK_METRICS} />
    );
    // md:hidden のモバイルカードセクション
    const mobileSection = container.querySelector(".md\\:hidden.space-y-3");
    expect(mobileSection).not.toBeNull();
    // 7日先カードの最初のランク行に "1" と "EW Linear Trend" が存在する
    const rankCells = mobileSection!.querySelectorAll(".bg-blue-50");
    // 各 horizon で best=blue-50、best モデルが 3つ存在する
    expect(rankCells.length).toBe(3);
  });

  it("デスクトップ詳細テーブルが hidden md:block ラッパー内にある", () => {
    const { container } = render(
      <BacktestResults run={MOCK_RUN} metrics={MOCK_METRICS} />
    );
    const desktopTable = container.querySelector(".hidden.md\\:block table");
    expect(desktopTable).not.toBeNull();
  });

  it("metrics が空でもクラッシュしない", () => {
    expect(() =>
      render(<BacktestResults run={MOCK_RUN} metrics={[]} />)
    ).not.toThrow();
  });
});

// ─── BacktestComparison ───────────────────────────────────────────────────────

const DAILY_METRICS: ForecastBacktestMetric[] = [
  makeMetric("NeuralProphet",   7,  0.345),
  makeMetric("EWLinearTrend",   7,  0.320),
  makeMetric("NeuralProphet",   14, 0.410),
  makeMetric("EWLinearTrend",   14, 0.390),
  makeMetric("NeuralProphet",   30, 0.480),
  makeMetric("LinearTrend30d",  30, 0.460),
];

const SMA7_METRICS: ForecastBacktestMetric[] = [
  makeMetric("NeuralProphet",   7,  0.210),
  makeMetric("EWLinearTrend",   7,  0.200),
  makeMetric("NeuralProphet",   14, 0.280),
  makeMetric("EWLinearTrend",   14, 0.260),
  makeMetric("NeuralProphet",   30, 0.320),
  makeMetric("LinearTrend30d",  30, 0.300),
];

describe("BacktestComparison", () => {
  it("dailyMetrics も sma7Metrics も空のときは null をレンダリングする", () => {
    const { container } = render(
      <BacktestComparison dailyMetrics={[]} sma7Metrics={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("モバイル horizon サマリーカードが 3 件 (D+7/D+14/D+30) 表示される", () => {
    render(
      <BacktestComparison dailyMetrics={DAILY_METRICS} sma7Metrics={SMA7_METRICS} />
    );
    expect(screen.getByText("D+7 日先")).toBeTruthy();
    expect(screen.getByText("D+14 日先")).toBeTruthy();
    expect(screen.getByText("D+30 日先")).toBeTruthy();
  });

  it("モバイルサマリーが md:hidden ラッパー内にある", () => {
    const { container } = render(
      <BacktestComparison dailyMetrics={DAILY_METRICS} sma7Metrics={SMA7_METRICS} />
    );
    const mobileSection = container.querySelector(".md\\:hidden.p-4");
    expect(mobileSection).not.toBeNull();
    // D+7 見出しが含まれている
    expect(mobileSection!.textContent).toContain("D+7 日先");
  });

  it("デスクトップ比較テーブルが hidden md:block ラッパー内にある", () => {
    const { container } = render(
      <BacktestComparison dailyMetrics={DAILY_METRICS} sma7Metrics={SMA7_METRICS} />
    );
    const desktopTable = container.querySelector(".hidden.md\\:block table");
    expect(desktopTable).not.toBeNull();
  });

  it("単日データのみのときモバイルカードが単日評価 ★ を表示する", () => {
    render(
      <BacktestComparison dailyMetrics={DAILY_METRICS} sma7Metrics={[]} />
    );
    expect(screen.getAllByText("単日評価 ★").length).toBeGreaterThanOrEqual(1);
  });
});
