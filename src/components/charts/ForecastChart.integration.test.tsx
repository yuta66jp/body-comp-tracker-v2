/**
 * ForecastChart 結合テスト
 *
 * 検証内容:
 * 1. predictions = [] のとき empty state メッセージが表示される
 * 2. predictions = [] のとき ResponsiveContainer（チャート）が描画されない
 * 3. predictions が 1 件以上あるとき ResponsiveContainer が描画される
 * 4. predictions が 1 件以上あるとき empty state メッセージが表示されない
 */

// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen } from "@testing-library/react";

// recharts をモック
jest.mock("recharts", () => ({
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-composed-chart">{children}</div>
  ),
  Line:               () => <div data-testid="recharts-line" />,
  XAxis:              () => <div data-testid="recharts-xaxis" />,
  YAxis:              () => <div data-testid="recharts-yaxis" />,
  CartesianGrid:      () => <div data-testid="recharts-grid" />,
  Tooltip:            () => <div data-testid="recharts-tooltip" />,
  Legend:             () => <div data-testid="recharts-legend" />,
  ReferenceLine:      () => <div data-testid="recharts-ref-line" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-container">{children}</div>
  ),
}));

import { ForecastChart } from "@/components/charts/ForecastChart";
import type { Prediction } from "@/lib/supabase/types";

// ─── テストフィクスチャ ──────────────────────────────────────────────────────

const basePrediction: Prediction = {
  id: 1,
  ds: "2025-06-01",
  yhat: 68.5,
  model_version: "neuralprophet-v1",
  created_at: "2025-05-01T00:00:00Z",
};

const baseProps = {
  logs: [],
  sma7: [],
  predictions: [] as Prediction[],
};

// ─── テスト ─────────────────────────────────────────────────────────────────

describe("ForecastChart empty state", () => {
  it("predictions が空のとき empty state メッセージを表示する", () => {
    render(<ForecastChart {...baseProps} predictions={[]} />);
    expect(screen.getByText("予測データがありません")).toBeInTheDocument();
    expect(screen.getByText("ML バッチ（predict.py）実行後に表示されます")).toBeInTheDocument();
  });

  it("predictions が空のとき ResponsiveContainer を描画しない", () => {
    render(<ForecastChart {...baseProps} predictions={[]} />);
    expect(screen.queryByTestId("recharts-container")).not.toBeInTheDocument();
  });

  it("predictions が 1 件以上あるとき ResponsiveContainer を描画する", () => {
    render(<ForecastChart {...baseProps} predictions={[basePrediction]} />);
    expect(screen.getByTestId("recharts-container")).toBeInTheDocument();
  });

  it("predictions が 1 件以上あるとき empty state メッセージを表示しない", () => {
    render(<ForecastChart {...baseProps} predictions={[basePrediction]} />);
    expect(screen.queryByText("予測データがありません")).not.toBeInTheDocument();
  });
});
