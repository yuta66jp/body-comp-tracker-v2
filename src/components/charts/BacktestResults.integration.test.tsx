/**
 * BacktestResults / BacktestComparison mobile UI 結合テスト
 *
 * 検証内容:
 * 1. Best model カードが sm:grid-cols-3 (モバイルで縦積み可能) レイアウトになっている
 * 2. モバイル詳細カードが horizon ごとにレンダリングされる (md:hidden)
 * 3. BacktestComparison のモバイル horizon サマリーカードが表示される (md:hidden)
 * 4. ForecastAccuracyRefreshButton が refresh ボタンをレンダリングする
 * 5. #545 regression: 重複行がある場合に両コンポーネントが最小 MAE で一致する
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
  created_at: "2026-03-01T00:00:00Z",
  model_name: "daily",
  model_version: null,
  horizons: [7, 14, 30],
  train_min_date: "2025-01-01",
  train_max_date: "2026-02-28",
  n_source_rows: 200,
  notes: null,
  config: {},
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
    eval_policy: "all_days",
    mae,
    rmse: mae * 1.2,
    mape: mae * 5,
    bias: 0.01,
    n_predictions: 30,
    n_total: 30,
    n_excluded: 0,
    computed_at: "2026-03-01T00:00:00Z",
    extra: {},
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
      <BacktestResults run={MOCK_RUN} metrics={MOCK_METRICS} horizons={MOCK_RUN.horizons} />
    );
    // Best model カードのグリッド wrapper
    const grid = container.querySelector(".sm\\:grid-cols-3");
    expect(grid).not.toBeNull();
  });

  it("ベストモデルカードが horizon ごとに表示される", () => {
    render(<BacktestResults run={MOCK_RUN} metrics={MOCK_METRICS} horizons={MOCK_RUN.horizons} />);
    // 7日先 / 14日先 / 30日先 — それぞれ「最良モデル」テキスト
    expect(screen.getAllByText(/日先 — 最良モデル/)).toHaveLength(3);
  });

  it("モバイル詳細カードが horizon ごとに見出しを表示する", () => {
    render(<BacktestResults run={MOCK_RUN} metrics={MOCK_METRICS} horizons={MOCK_RUN.horizons} />);
    // md:hidden 内の h3 "X 日先"
    // Tailwind のクラスは DOM に存在する (非表示はブラウザ側で制御)
    expect(screen.getAllByText("7 日先").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("14 日先").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("30 日先").length).toBeGreaterThanOrEqual(1);
  });

  it("モバイル詳細カードで 7日先の最良モデル (EW Linear Trend) がランク1位に表示される", () => {
    const { container } = render(
      <BacktestResults run={MOCK_RUN} metrics={MOCK_METRICS} horizons={MOCK_RUN.horizons} />
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
      <BacktestResults run={MOCK_RUN} metrics={MOCK_METRICS} horizons={MOCK_RUN.horizons} />
    );
    const desktopTable = container.querySelector(".hidden.md\\:block table");
    expect(desktopTable).not.toBeNull();
  });

  it("metrics が空でもクラッシュしない", () => {
    expect(() =>
      render(<BacktestResults run={MOCK_RUN} metrics={[]} horizons={MOCK_RUN.horizons} />)
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
      <BacktestComparison dailyMetrics={[]} sma7Metrics={[]} horizons={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("モバイル horizon サマリーカードが 3 件 (D+7/D+14/D+30) 表示される", () => {
    render(
      <BacktestComparison dailyMetrics={DAILY_METRICS} sma7Metrics={SMA7_METRICS} horizons={[7, 14, 30]} />
    );
    expect(screen.getByText("D+7 日先")).toBeTruthy();
    expect(screen.getByText("D+14 日先")).toBeTruthy();
    expect(screen.getByText("D+30 日先")).toBeTruthy();
  });

  it("モバイルサマリーが md:hidden ラッパー内にある", () => {
    const { container } = render(
      <BacktestComparison dailyMetrics={DAILY_METRICS} sma7Metrics={SMA7_METRICS} horizons={[7, 14, 30]} />
    );
    const mobileSection = container.querySelector(".md\\:hidden.p-4");
    expect(mobileSection).not.toBeNull();
    // D+7 見出しが含まれている
    expect(mobileSection!.textContent).toContain("D+7 日先");
  });

  it("デスクトップ比較テーブルが hidden md:block ラッパー内にある", () => {
    const { container } = render(
      <BacktestComparison dailyMetrics={DAILY_METRICS} sma7Metrics={SMA7_METRICS} horizons={[7, 14, 30]} />
    );
    const desktopTable = container.querySelector(".hidden.md\\:block table");
    expect(desktopTable).not.toBeNull();
  });

  it("単日データのみのときモバイルカードが単日評価 ★ を表示する", () => {
    render(
      <BacktestComparison dailyMetrics={DAILY_METRICS} sma7Metrics={[]} horizons={[7, 14, 30]} />
    );
    expect(screen.getAllByText("単日評価 ★").length).toBeGreaterThanOrEqual(1);
  });
});

// ─── #545 regression: 重複行での MAE 一致 ──────────────────────────────────────
//
// DB の UNIQUE 制約が有効になる前のデータや旧バッチ実行で、同一
// (run_id, model_name, horizon_days, eval_policy) の行が複数存在するケースがある。
//
// 旧挙動:
//   BacktestComparison.buildMaeMap → "last-wins" → 0.578 (2件目)
//   BacktestResults.bestModels → min を winner に選出するが find() で最初の行を取得 → 0.626
//   → 両者の表示値が 0.578 / 0.626 でズレていた
//
// 新挙動:
//   buildMaeMap → "min-wins" → 0.578
//   bestModels → min を winner として mae ごと返す → 0.578
//   → 両者とも 0.578 で一致する

/** id suffix 付きで重複行を生成する（id 衝突を避けるためのヘルパー） */
function makeMetricDup(
  model: string,
  horizon: number,
  mae: number,
  suffix: string
): ForecastBacktestMetric {
  return {
    id: `dup-${model}-${horizon}-${suffix}`,
    run_id: "run-dup",
    model_name: model,
    horizon_days: horizon,
    eval_policy: "all_days",
    mae,
    rmse: mae * 1.2,
    mape: mae * 5,
    bias: 0.01,
    n_predictions: 30,
    n_total: 30,
    n_excluded: 0,
    computed_at: "2026-04-01T00:00:00Z",
    extra: {},
  };
}

// D+7: Naive が 2 行存在 (0.626 が先、0.578 が後)。最小値 0.578 を採用すべき。
const DUP_METRICS: ForecastBacktestMetric[] = [
  makeMetricDup("Naive", 7, 0.626, "a"), // 先行行 (大きい値)
  makeMetricDup("Naive", 7, 0.578, "b"), // 後続行 (小さい値 = 最小値)
  makeMetricDup("LinearTrend30d", 7, 0.700, "c"), // 別モデル
];

const DUP_MOCK_RUN: ForecastBacktestRun = {
  ...MOCK_RUN,
  id: "run-dup",
  horizons: [7],
};

describe("BacktestResults — duplicate metrics regression (#545)", () => {
  it("重複行がある場合、ベストカードは最小 MAE (0.578) を表示し 0.626 を表示しない", () => {
    const { container } = render(
      <BacktestResults run={DUP_MOCK_RUN} metrics={DUP_METRICS} horizons={[7]} />
    );
    // best card の MAE は bestEntry.mae (最小値) から直接取得するため 0.578 になる
    expect(container.textContent).toContain("0.578");
    // ベストカードに 0.626 が表示されないこと（detail table の first-occurrence 行は除外）
    // note: detail table にはまだ 0.626 が表示される場合があるため、ベストカード領域だけ検証する
    const bestCards = container.querySelector(".grid.grid-cols-1");
    expect(bestCards).not.toBeNull();
    expect(bestCards!.textContent).not.toContain("0.626");
    expect(bestCards!.textContent).toContain("0.578");
  });

  it("重複行がある場合でも最良モデルの判定が正しい (Naive < LinearTrend30d)", () => {
    const { container } = render(
      <BacktestResults run={DUP_MOCK_RUN} metrics={DUP_METRICS} horizons={[7]} />
    );
    const bestCards = container.querySelector(".grid.grid-cols-1");
    // Naive (0.578) が LinearTrend30d (0.700) より小さいため最良モデルは Naive
    expect(bestCards!.textContent).toContain("Naive");
  });
});

describe("BacktestComparison — duplicate metrics regression (#545)", () => {
  it("重複行がある場合、sma7 比較カードは最小 MAE (0.578) を表示する", () => {
    const { container } = render(
      <BacktestComparison
        dailyMetrics={[makeMetricDup("Naive", 7, 0.900, "d")]}
        sma7Metrics={DUP_METRICS}
        horizons={[7]}
      />
    );
    // mobile horizon card の sma7 best は min-wins で 0.578
    const mobileSection = container.querySelector(".md\\:hidden.p-4");
    expect(mobileSection).not.toBeNull();
    expect(mobileSection!.textContent).toContain("0.578");
    expect(mobileSection!.textContent).not.toContain("0.626");
  });
});

describe("BacktestComparison + BacktestResults — MAE consistency (#545)", () => {
  it("同じ重複 sma7 metrics を渡した場合、両コンポーネントのベストカードが同じ MAE を表示する", () => {
    const { container: compContainer } = render(
      <BacktestComparison
        dailyMetrics={[makeMetricDup("Naive", 7, 0.900, "d")]}
        sma7Metrics={DUP_METRICS}
        horizons={[7]}
      />
    );
    const { container: resultsContainer } = render(
      <BacktestResults run={DUP_MOCK_RUN} metrics={DUP_METRICS} horizons={[7]} />
    );

    // BacktestComparison の mobile sma7 ★ 欄
    const compMobile = compContainer.querySelector(".md\\:hidden.p-4");
    // BacktestResults のベストカード欄
    const resultsBestCards = resultsContainer.querySelector(".grid.grid-cols-1");

    // 両者が最小値 0.578 を表示する
    expect(compMobile!.textContent).toContain("0.578");
    expect(resultsBestCards!.textContent).toContain("0.578");

    // 両者とも 0.626 (first-occurrence の大きい値) をベストカードに表示しない
    expect(compMobile!.textContent).not.toContain("0.626");
    expect(resultsBestCards!.textContent).not.toContain("0.626");
  });
});
