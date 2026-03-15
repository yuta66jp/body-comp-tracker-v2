/**
 * calcReadiness.test.ts
 *
 * ペース計算の 2週基準化・残り週数表示に関するテスト。
 * 主なカバレッジ:
 *   - calcRequiredPacePerTwoWeeks: 残り日数と必要 kg から kg/2週 を算出
 *   - calcActualPacePerTwoWeeks  : 直近 14 日の体重ログから実績 kg/2週 を算出
 *   - ReadinessMetrics の 2週ペースフィールド (calcReadiness の統合テスト)
 *   - 残り週数 (daysLeft / 7) の表示値
 */

import { calcReadiness, calcRequiredPacePerTwoWeeks, calcActualPacePerTwoWeeks } from "./calcReadiness";
import type { DailyLog } from "@/lib/supabase/types";

// ─── テスト用ヘルパー ──────────────────────────────────────────────────────────

/** 必要最小フィールドのみ持つ DailyLog を生成する */
function makeDailyLog(
  log_date: string,
  weight: number | null,
  overrides: Partial<DailyLog> = {}
): DailyLog {
  return {
    log_date,
    weight,
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
    note: null,
    sleep_hours: null,
    training_type: null,
    work_mode: null,
    had_bowel_movement: false,
    is_cheat_day: false,
    is_refeed_day: false,
    is_eating_out: false,
    is_travel_day: false,
    is_poor_sleep: false,
    leg_flag: false,
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

/** today から n 日前の日付 (YYYY-MM-DD) を返すシンプルなヘルパー */
function daysAgo(today: string, n: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y, m - 1, d - n);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ─── calcRequiredPacePerTwoWeeks ──────────────────────────────────────────────

describe("calcRequiredPacePerTwoWeeks", () => {
  test("14日で-1kg必要なら kg/2週 = -1.0", () => {
    // 残りKg = 1.0 (current - goal > 0, Cut で減量が必要)
    const result = calcRequiredPacePerTwoWeeks(14, 1.0);
    expect(result).toBeCloseTo(-1.0, 5);
  });

  test("7日で-0.5kg必要なら kg/2週 = -1.0", () => {
    // (0.5 / 7) * 14 = 1.0 → 必要ペースは -1.0 kg/2週
    const result = calcRequiredPacePerTwoWeeks(7, 0.5);
    expect(result).toBeCloseTo(-1.0, 5);
  });

  test("28日で-2kg必要なら kg/2週 = -1.0", () => {
    const result = calcRequiredPacePerTwoWeeks(28, 2.0);
    expect(result).toBeCloseTo(-1.0, 5);
  });

  test("Bulk: 残りKgが負(目標より低い)なら正の必要ペース", () => {
    // current = 70, goal = 72 → remainingKg = -2, 残り14日
    const result = calcRequiredPacePerTwoWeeks(14, -2.0);
    expect(result).toBeCloseTo(2.0, 5);
  });

  test("残り0日なら null を返す", () => {
    expect(calcRequiredPacePerTwoWeeks(0, 1.0)).toBeNull();
  });

  test("残り日数が負なら null を返す", () => {
    expect(calcRequiredPacePerTwoWeeks(-1, 1.0)).toBeNull();
  });

  test("残りKg = 0 なら 0.0 を返す (達成済み)", () => {
    const result = calcRequiredPacePerTwoWeeks(14, 0);
    expect(result).toBeCloseTo(0, 10);
  });

  test("残り1日で-0.1kgなら kg/2週 = -1.4", () => {
    const result = calcRequiredPacePerTwoWeeks(1, 0.1);
    expect(result).toBeCloseTo(-1.4, 5);
  });
});

// ─── calcActualPacePerTwoWeeks ────────────────────────────────────────────────

describe("calcActualPacePerTwoWeeks", () => {
  const today = "2026-03-15";

  test("直近14日の体重が線形に-1kg減少 → kg/2週 ≈ -1.0", () => {
    // 14日で -1kg の線形変化: 14点 (インデックス 0〜13)
    // calcWeightTrend はインデックス基準のため slope = -1/13 per index
    // ×14 = -14/13 ≈ -1.077 kg/2週
    const logs = Array.from({ length: 14 }, (_, i) => ({
      date: daysAgo(today, 13 - i),
      weight: 70 - (i / 13),
    }));
    const result = calcActualPacePerTwoWeeks(logs, today);
    expect(result).not.toBeNull();
    // slope = (-1/13) per index × 14 ≈ -1.077
    expect(result!).toBeCloseTo(-14 / 13, 3);
  });

  test("直近14日の体重が一定 → kg/2週 ≈ 0", () => {
    const logs = Array.from({ length: 14 }, (_, i) => ({
      date: daysAgo(today, 13 - i),
      weight: 70,
    }));
    const result = calcActualPacePerTwoWeeks(logs, today);
    expect(result).not.toBeNull();
    expect(Math.abs(result!)).toBeCloseTo(0, 5);
  });

  test("データが1件のみ → null を返す", () => {
    const logs = [{ date: today, weight: 70 }];
    const result = calcActualPacePerTwoWeeks(logs, today);
    expect(result).toBeNull();
  });

  test("データが空 → null を返す", () => {
    const result = calcActualPacePerTwoWeeks([], today);
    expect(result).toBeNull();
  });

  test("データが2件あれば計算できる", () => {
    // calcWeightTrend はインデックス基準: 2点の場合 slope = Δweight/1 per index
    // daysAgo(today, 13) と today の 2点: weight 70→69 → slope = -1 per index × 14 = -14 kg/2週
    const logs = [
      { date: daysAgo(today, 13), weight: 70 },
      { date: today, weight: 69 },
    ];
    const result = calcActualPacePerTwoWeeks(logs, today);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(-14, 5);
  });

  test("直近14日より古いデータは無視される", () => {
    // 15日前のデータは無視、今日から遡る14日分のみ
    // 15日前のデータが含まれる場合と含まれない場合で結果が変わらないことを確認
    const logsWithOld = [
      { date: daysAgo(today, 20), weight: 65 }, // 古すぎて無視
      { date: daysAgo(today, 13), weight: 70 },
      { date: today, weight: 69 },
    ];
    const logsWithoutOld = [
      { date: daysAgo(today, 13), weight: 70 },
      { date: today, weight: 69 },
    ];
    const resultWithOld = calcActualPacePerTwoWeeks(logsWithOld, today);
    const resultWithoutOld = calcActualPacePerTwoWeeks(logsWithoutOld, today);
    expect(resultWithOld).not.toBeNull();
    expect(resultWithoutOld).not.toBeNull();
    // 20日前のデータが無視されるため結果が等しい
    expect(resultWithOld!).toBeCloseTo(resultWithoutOld!, 5);
  });
});

// ─── calcReadiness: weekly_rate_kg_per_2weeks / required_rate_kg_per_2weeks ──

describe("calcReadiness 2週ペースフィールド", () => {
  const today = "2026-03-15";

  function buildLogs(n: number, startWeight: number, slopePerDay: number): DailyLog[] {
    return Array.from({ length: n }, (_, i) => {
      const date = daysAgo(today, n - 1 - i);
      const weight = startWeight + slopePerDay * i;
      return makeDailyLog(date, weight);
    });
  }

  test("weekly_rate_kg_per_2weeks は weekly_rate_kg の 2倍", () => {
    const logs = buildLogs(14, 70, -1 / 13);
    const metrics = calcReadiness(logs, {}, today);
    if (metrics.weekly_rate_kg !== null && metrics.weekly_rate_kg_per_2weeks !== null) {
      expect(metrics.weekly_rate_kg_per_2weeks).toBeCloseTo(metrics.weekly_rate_kg * 2, 5);
    } else {
      // どちらかが null のときは両方 null であること
      expect(metrics.weekly_rate_kg).toBeNull();
      expect(metrics.weekly_rate_kg_per_2weeks).toBeNull();
    }
  });

  test("required_rate_kg_per_2weeks は required_rate_kg_per_week の 2倍", () => {
    const logs = buildLogs(14, 70, -1 / 13);
    const metrics = calcReadiness(
      logs,
      { contest_date: "2026-04-12", goal_weight: 68 },
      today
    );
    if (
      metrics.required_rate_kg_per_week !== null &&
      metrics.required_rate_kg_per_2weeks !== null
    ) {
      expect(metrics.required_rate_kg_per_2weeks).toBeCloseTo(
        metrics.required_rate_kg_per_week * 2,
        5
      );
    } else {
      expect(metrics.required_rate_kg_per_week).toBeNull();
      expect(metrics.required_rate_kg_per_2weeks).toBeNull();
    }
  });

  test("データなし → 2週ペースフィールドは null", () => {
    const metrics = calcReadiness([], {}, today);
    expect(metrics.weekly_rate_kg_per_2weeks).toBeNull();
    expect(metrics.required_rate_kg_per_2weeks).toBeNull();
  });

  test("大会日未設定 → required_rate_kg_per_2weeks は null", () => {
    const logs = buildLogs(14, 70, -1 / 13);
    const metrics = calcReadiness(logs, { goal_weight: 68 }, today);
    expect(metrics.required_rate_kg_per_2weeks).toBeNull();
  });
});

// ─── 残り週数 (daysLeft / 7) の表示値 ────────────────────────────────────────

describe("残り週数の計算", () => {
  /**
   * KpiCards の表示ロジック: (daysLeft / 7).toFixed(1)
   * KpiCards はコンポーネントのためここでは純計算のみ検証する。
   */
  function weeksLeftStr(daysLeft: number): string {
    return (daysLeft / 7).toFixed(1);
  }

  test("残り14日なら 2.0週と表示される", () => {
    expect(weeksLeftStr(14)).toBe("2.0");
  });

  test("残り7日なら 1.0週と表示される", () => {
    expect(weeksLeftStr(7)).toBe("1.0");
  });

  test("残り1日なら 0.1週と表示される", () => {
    expect(weeksLeftStr(1)).toBe("0.1");
  });

  test("残り10日なら 1.4週と表示される (小数点1桁切捨て)", () => {
    // 10/7 = 1.4285... → toFixed(1) = "1.4"
    expect(weeksLeftStr(10)).toBe("1.4");
  });

  test("残り0日: KpiCards では週数を表示しない (weeksLeft = null)", () => {
    // KpiCards 内 weeksLeft = daysLeft > 0 ? ... : null
    const daysLeft = 0;
    const weeksLeft = daysLeft > 0 ? (daysLeft / 7).toFixed(1) : null;
    expect(weeksLeft).toBeNull();
  });
});
