/**
 * calcTrend.test.ts
 *
 * calcWeightTrend の x 軸が実日数差になっていることを検証する。
 * 記録が毎日の場合と飛び飛びの場合で slope が一致することが重要。
 */

import { calcWeightTrend } from "./calcTrend";

describe("calcWeightTrend", () => {
  describe("毎日記録（連続）", () => {
    it("単純な減量トレンドで slope が kg/日 になる", () => {
      // 5日で -0.5 kg 減 → slope = -0.1 kg/日
      const data = [
        { date: "2026-03-01", weight: 75.0 },
        { date: "2026-03-02", weight: 74.9 },
        { date: "2026-03-03", weight: 74.8 },
        { date: "2026-03-04", weight: 74.7 },
        { date: "2026-03-05", weight: 74.6 },
      ];
      const { slope } = calcWeightTrend(data);
      expect(slope).toBeCloseTo(-0.1, 5);
    });

    it("体重変化なし → slope = 0", () => {
      const data = [
        { date: "2026-03-01", weight: 70.0 },
        { date: "2026-03-02", weight: 70.0 },
        { date: "2026-03-03", weight: 70.0 },
      ];
      const { slope } = calcWeightTrend(data);
      expect(slope).toBeCloseTo(0, 5);
    });
  });

  describe("飛び飛び記録", () => {
    it("3日おきの記録でも slope が kg/日 になる（インデックス使用では3倍になるバグの回帰）", () => {
      // 3/01, 3/04, 3/07 — 3日おき、6日で -0.6 kg 減 → slope = -0.1 kg/日
      const data = [
        { date: "2026-03-01", weight: 75.0 },
        { date: "2026-03-04", weight: 74.7 },
        { date: "2026-03-07", weight: 74.4 },
      ];
      const { slope } = calcWeightTrend(data);
      // インデックス x=[0,1,2] を使うと slope = -0.3 kg/記録間隔 になる（3倍誤差）
      // 実日数差 x=[0,3,6] を使えば slope = -0.1 kg/日 になる
      expect(slope).toBeCloseTo(-0.1, 5);
    });

    it("2日おきの記録でも slope が kg/日 になる", () => {
      // 3/01, 3/03, 3/05 — 2日おき、4日で -0.4 kg 減 → slope = -0.1 kg/日
      const data = [
        { date: "2026-03-01", weight: 75.0 },
        { date: "2026-03-03", weight: 74.8 },
        { date: "2026-03-05", weight: 74.6 },
      ];
      const { slope } = calcWeightTrend(data);
      expect(slope).toBeCloseTo(-0.1, 5);
    });

    it("不規則な記録間隔でも slope が日数ベースで計算される", () => {
      // 3/01 → 3/03 (2日後) → 3/08 (5日後)
      // 実際のトレンドは 7日で -0.7 kg 減 → slope = -0.1 kg/日
      const data = [
        { date: "2026-03-01", weight: 75.0 },
        { date: "2026-03-03", weight: 74.8 },
        { date: "2026-03-08", weight: 74.3 },
      ];
      const { slope } = calcWeightTrend(data);
      expect(slope).toBeCloseTo(-0.1, 3);
    });
  });

  describe("データ点が 1 件以下", () => {
    it("データが空のとき slope = 0, intercept = 0", () => {
      const { slope, intercept, rSquared } = calcWeightTrend([]);
      expect(slope).toBe(0);
      expect(intercept).toBe(0);
      expect(rSquared).toBe(0);
    });

    it("データが 1 件のとき slope = 0, intercept = 体重値", () => {
      const { slope, intercept } = calcWeightTrend([
        { date: "2026-03-01", weight: 74.5 },
      ]);
      expect(slope).toBe(0);
      expect(intercept).toBe(74.5);
    });
  });

  describe("rSquared", () => {
    it("完全な線形トレンドで rSquared ≈ 1", () => {
      const data = [
        { date: "2026-03-01", weight: 75.0 },
        { date: "2026-03-02", weight: 74.9 },
        { date: "2026-03-03", weight: 74.8 },
        { date: "2026-03-04", weight: 74.7 },
      ];
      const { rSquared } = calcWeightTrend(data);
      expect(rSquared).toBeCloseTo(1, 5);
    });
  });
});
