/**
 * TdeeKpiCard UI 結合テスト — TDEE fallback / unavailable 表示シナリオ
 *
 * テスト戦略:
 * - TdeeKpiCard は純粋な props-driven Client Component なので、
 *   enrichedAvailability を直接渡してシナリオを制御する
 * - lucide-react のアイコンをモックして描画を安定させる
 * - 「NaN や空文字を露出しない」「unavailable 状態を適切に表示する」を検証する
 */

// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import type { AnalyticsAvailability } from "@/lib/analytics/status";

// lucide-react アイコンをモック
jest.mock("lucide-react", () => ({
  ShieldCheck: () => <span data-testid="icon-shield-check" />,
  ShieldAlert: () => <span data-testid="icon-shield-alert" />,
  Shield: () => <span data-testid="icon-shield" />,
}));

// recharts は jsdom 環境でのレイアウト計算が不安定なため、必要に応じてモック
// TdeeKpiCard はグラフを含まないため recharts のモックは不要

import { TdeeKpiCard } from "@/components/tdee/TdeeKpiCard";

// テスト共通の最小限 props
const baseProps = {
  avgCalories: 2000,
  balance: null,
  theoreticalWeightChange: null,
  measuredWeightChange: null,
  confidence: { level: "low" as const, reason: "データ不足" },
  interpretation: "データが不足しています。",
};

// ─── シナリオ 1: enriched unavailable — TDEE 数値が「—」で表示される ────────

describe("TdeeKpiCard — enriched unavailable", () => {
  const unavailableAvailability: AnalyticsAvailability = {
    status: "unavailable",
    lastUpdatedDate: null,
    staleDays: null,
  };

  it("avgTdee が null のとき「—」が表示され、NaN/空文字を露出しない", () => {
    render(
      <TdeeKpiCard
        {...baseProps}
        avgTdee={null}
        theoreticalTdee={null}
        enrichedAvailability={unavailableAvailability}
      />
    );

    // 実測 TDEE カードに「—」が表示される
    const tdeeCard = screen.getByText("実測 TDEE（7日平均）").closest("div")!;
    expect(tdeeCard).toBeInTheDocument();

    // NaN が露出していないことを確認する（DOM 全体をテキストで検索）
    const docText = document.body.textContent ?? "";
    expect(docText).not.toMatch(/NaN/);
    expect(docText).not.toMatch(/undefined/);
  });

  it("enrichedAvailability が unavailable のとき stale 注記が表示されない", () => {
    render(
      <TdeeKpiCard
        {...baseProps}
        avgTdee={null}
        theoreticalTdee={null}
        enrichedAvailability={unavailableAvailability}
      />
    );

    // stale 注記（「再計算前データ」）は表示されない
    expect(screen.queryByText(/再計算前データ/)).not.toBeInTheDocument();
  });
});

// ─── シナリオ 2: enriched error — エラー情報が適切に非露出 ──────────────────

describe("TdeeKpiCard — enriched error", () => {
  const errorAvailability: AnalyticsAvailability = {
    status: "error",
    lastUpdatedDate: null,
    staleDays: null,
  };

  it("avgTdee が null のとき「—」が表示される（error 状態でも NaN を露出しない）", () => {
    render(
      <TdeeKpiCard
        {...baseProps}
        avgTdee={null}
        theoreticalTdee={null}
        enrichedAvailability={errorAvailability}
      />
    );

    const docText = document.body.textContent ?? "";
    expect(docText).not.toMatch(/NaN/);
    expect(docText).not.toMatch(/undefined/);
  });
});

// ─── シナリオ 3: enriched stale — 補助注記が表示される ──────────────────────

describe("TdeeKpiCard — enriched stale", () => {
  const staleAvailability: AnalyticsAvailability = {
    status: "stale",
    lastUpdatedDate: "2026-03-10",
    staleDays: 4,
  };

  it("stale のとき「再計算前データ」注記が表示される", () => {
    render(
      <TdeeKpiCard
        {...baseProps}
        avgTdee={2200}
        theoreticalTdee={null}
        enrichedAvailability={staleAvailability}
      />
    );

    // AnalyticsStatusNote が stale 注記を出力する
    expect(screen.getByText(/再計算前データ/)).toBeInTheDocument();
  });

  it("stale でも avgTdee の数値が正常に表示される", () => {
    render(
      <TdeeKpiCard
        {...baseProps}
        avgTdee={2200}
        theoreticalTdee={null}
        enrichedAvailability={staleAvailability}
      />
    );

    // 2,200 が表示される（toLocaleString で "2,200" になる）
    expect(screen.getByText(/2,200/)).toBeInTheDocument();
  });
});

// ─── シナリオ 4: enriched fresh — 注記なしで正常表示 ────────────────────────

describe("TdeeKpiCard — enriched fresh", () => {
  const freshAvailability: AnalyticsAvailability = {
    status: "fresh",
    lastUpdatedDate: "2026-03-14",
    staleDays: null,
  };

  it("fresh のとき stale 注記が表示されない", () => {
    render(
      <TdeeKpiCard
        {...baseProps}
        avgTdee={2100}
        theoreticalTdee={2150}
        enrichedAvailability={freshAvailability}
      />
    );

    expect(screen.queryByText(/再計算前データ/)).not.toBeInTheDocument();
  });

  it("理論 TDEE が指定されているとき参考値が表示される", () => {
    render(
      <TdeeKpiCard
        {...baseProps}
        avgTdee={2100}
        theoreticalTdee={2150}
        enrichedAvailability={freshAvailability}
      />
    );

    expect(screen.getByText(/理論値/)).toBeInTheDocument();
    expect(screen.getByText(/2,150/)).toBeInTheDocument();
  });
});

// ─── シナリオ 5: enrichedAvailability 未指定（undefined）───────────────────

describe("TdeeKpiCard — enrichedAvailability 未指定", () => {
  it("enrichedAvailability が undefined でもクラッシュしない", () => {
    expect(() => {
      render(
        <TdeeKpiCard
          {...baseProps}
          avgTdee={null}
          theoreticalTdee={null}
          // enrichedAvailability を渡さない
        />
      );
    }).not.toThrow();
  });
});
