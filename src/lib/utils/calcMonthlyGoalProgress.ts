/**
 * calcMonthlyGoalProgress.ts
 *
 * Dashboard / GoalNavigator の「今月目標進捗」表示用 selector。
 *
 * #101 の buildMonthlyGoalPlan を使って今月のエントリーを取得し、
 * 現在値との差・月末までの残必要ペース・状態判定を計算する純粋関数群。
 *
 * UI 側で月次ロジックを再実装しないための canonical interface として設計する。
 */

import {
  buildMonthlyGoalPlan,
  MAX_SAFE_MONTHLY_DELTA_KG,
} from "@/lib/utils/monthlyGoalPlan";
import type { MonthlyGoalOverride } from "@/lib/utils/monthlyGoalPlan";
import { calcDaysLeft } from "@/lib/utils/date";

// ─── 閾値定数 ─────────────────────────────────────────────────────────────────

/**
 * 月末残必要ペース (kg/週) の "on_track" 判定閾値。
 * 絶対値がこれ以下なら計画内と判定する。
 * 0.5 kg/週 ≈ 月間 2 kg 上限の週次換算の半分。
 */
export const MONTHLY_ON_TRACK_PACE_KG_WEEK = 0.5;

/**
 * 月末残必要ペース (kg/週) の "replan_recommended" 閾値。
 * 絶対値がこれを超えると再計画推奨と判定する。
 * MAX_SAFE_MONTHLY_DELTA_KG / 2 = 1.0 kg/週 (月間 2 kg / 2 週換算)。
 */
export const MONTHLY_REPLAN_PACE_KG_WEEK: number = MAX_SAFE_MONTHLY_DELTA_KG / 2;

// ─── 型定義 ──────────────────────────────────────────────────────────────────

/**
 * 今月目標に対する進捗状態。
 *
 * - achieved          : 現在値が今月目標を達成済み (±0.2 kg 許容)
 * - on_track          : 計画内 (残ペース絶対値 ≤ 0.5 kg/週)
 * - slightly_behind   : やや遅れ (残ペース絶対値 0.5〜1.0 kg/週)
 * - replan_recommended: 再計画推奨 (残ペース絶対値 > 1.0 kg/週 or 残り時間なし)
 * - unavailable       : データ不足でプランを構築できない
 */
export type MonthlyProgressState =
  | "achieved"
  | "on_track"
  | "slightly_behind"
  | "replan_recommended"
  | "unavailable";

/** 今月目標進捗の計算結果 */
export interface MonthlyGoalProgress {
  /** true = プランを構築でき、各フィールドが有効 */
  hasData: boolean;
  /** 今月末の目標体重 (kg) */
  monthlyTargetWeight: number | null;
  /**
   * 比較値 (kg)。7日平均 優先、なければ最新体重。
   * GoalNavigator の refWeight と同一の値を渡すこと。
   */
  comparisonWeight: number | null;
  /**
   * 差分 (kg) = comparisonWeight − monthlyTargetWeight。
   * Cut: 正 = 遅れ (目標より重い)、負 = 先行 (目標を下回っている)
   * Bulk: 負 = 遅れ (目標より軽い)、正 = 先行 (目標を上回っている)
   */
  deltaKg: number | null;
  /** 今日から月末までの残り日数 (今日が月末なら 0) */
  daysToMonthEnd: number | null;
  /** 月末までの残り週数 (小数)。0 以下の場合は null */
  weeksToMonthEnd: number | null;
  /**
   * 月末までに必要な週あたりペース (kg/週)。
   * Cut: 負値が目標方向、Bulk: 正値が目標方向。
   * null = 残り時間 0 または計算不能。
   */
  requiredPaceKgPerWeek: number | null;
  /** 状態判定 */
  state: MonthlyProgressState;
  /** 今月の計画に warning が 1 件以上あるか */
  hasWarnings: boolean;
}

// ─── プライベートヘルパー ─────────────────────────────────────────────────────

/** year, month (1-indexed) の月の日数を返す */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * today (YYYY-MM-DD) の月末日を "YYYY-MM-DD" で返す。
 * today の形式が不正な場合は null を返す。
 */
export function getMonthEndDate(today: string): string | null {
  const matched = today.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const year = parseInt(matched[1]!, 10);
  const month = parseInt(matched[2]!, 10);
  if (month < 1 || month > 12) return null;
  const lastDay = daysInMonth(year, month);
  return `${matched[1]}-${matched[2]}-${String(lastDay).padStart(2, "0")}`;
}

/**
 * today から月末までの残り日数を返す。
 * 今日が月末の場合は 0。不正な日付なら null。
 */
export function calcDaysToMonthEnd(today: string): number | null {
  const monthEnd = getMonthEndDate(today);
  if (!monthEnd) return null;
  return calcDaysLeft(today, monthEnd);
}

/**
 * 今月目標に対する状態を判定する。
 *
 * @param deltaKg - comparisonWeight − monthlyTargetWeight
 * @param requiredPaceKgPerWeek - 残必要ペース。null = 残り時間なし
 * @param isCut - Cut フェーズかどうか
 */
function calcMonthlyProgressState(
  deltaKg: number,
  requiredPaceKgPerWeek: number | null,
  isCut: boolean
): MonthlyProgressState {
  // 達成済み判定: Cut では delta ≤ +0.2 (目標以下 or 誤差範囲内)、Bulk では delta ≥ -0.2
  const GOAL_TOLERANCE = 0.2;
  const isAchieved = isCut ? deltaKg <= GOAL_TOLERANCE : deltaKg >= -GOAL_TOLERANCE;
  if (isAchieved) return "achieved";

  // 残り時間なし (月末当日など)
  if (requiredPaceKgPerWeek === null) return "replan_recommended";

  const absPace = Math.abs(requiredPaceKgPerWeek);
  if (absPace <= MONTHLY_ON_TRACK_PACE_KG_WEEK) return "on_track";
  if (absPace <= MONTHLY_REPLAN_PACE_KG_WEEK) return "slightly_behind";
  return "replan_recommended";
}

// ─── メイン計算関数 ──────────────────────────────────────────────────────────

/**
 * 今月目標に対する進捗を計算する。
 *
 * - #101 の buildMonthlyGoalPlan を使って月次プランを構築し、今月エントリーを取得する
 * - comparisonWeight には GoalNavigator の refWeight (7日平均優先) と同じ値を渡すこと
 * - 計画が構築できない場合は hasData: false の fallback を返す (クラッシュしない)
 *
 * @param input.contestDate        - 大会・目標期限 (settings.contestDate)
 * @param input.targetWeight       - 最終目標体重 (settings.targetWeight)
 * @param input.monthlyPlanOverrides - 月次 override リスト (settings.monthlyPlanOverrides)
 * @param input.comparisonWeight   - 比較値 (weight_7d_avg ?? current_weight)
 * @param input.today              - 今日の JST 日付 (toJstDateStr() の値)
 * @param input.phase              - "Cut" | "Bulk"
 */
export function calcMonthlyGoalProgress(input: {
  contestDate: string | null;
  targetWeight: number | null;
  monthlyPlanOverrides: MonthlyGoalOverride[] | null;
  comparisonWeight: number | null;
  today: string;
  phase: string;
}): MonthlyGoalProgress {
  const { contestDate, targetWeight, monthlyPlanOverrides, comparisonWeight, today, phase } = input;

  const unavailable: MonthlyGoalProgress = {
    hasData: false,
    monthlyTargetWeight: null,
    comparisonWeight,
    deltaKg: null,
    daysToMonthEnd: null,
    weeksToMonthEnd: null,
    requiredPaceKgPerWeek: null,
    state: "unavailable",
    hasWarnings: false,
  };

  // 前提条件チェック (いずれか欠損 → 計算不能)
  if (!contestDate || targetWeight === null || comparisonWeight === null) {
    return unavailable;
  }

  // buildMonthlyGoalPlan は currentWeight を起点として使う。
  // GoalNavigator と同じ refWeight (7日平均優先) を渡すことでプランの起点を統一する。
  const plan = buildMonthlyGoalPlan({
    currentWeight: comparisonWeight,
    today,
    finalGoalWeight: targetWeight,
    goalDeadlineDate: contestDate,
    monthlyActuals: [],
    overrides: monthlyPlanOverrides ?? [],
  });

  // プランが無効 (DEADLINE_IN_PAST 等) → fallback
  if (!plan.isValid || plan.entries.length === 0) {
    return unavailable;
  }

  // 今月のエントリーを取得 (プランは todayMonth から始まるため必ず entries[0])
  const todayMonth = today.slice(0, 7);
  const currentEntry = plan.entries.find((e) => e.month === todayMonth);
  if (!currentEntry) {
    return unavailable;
  }

  const monthlyTargetWeight = currentEntry.targetWeight;

  // 差分 (FP 安全化: 0.01 kg 単位で丸める)
  const deltaKg = Math.round((comparisonWeight - monthlyTargetWeight) * 100) / 100;

  // 月末までの残り日数・週数
  const daysToMonthEnd = calcDaysToMonthEnd(today);
  const weeksToMonthEnd =
    daysToMonthEnd !== null && daysToMonthEnd > 0 ? daysToMonthEnd / 7 : null;

  // 残必要ペース (kg/週)
  // Cut: deltaKg > 0 → -deltaKg/weeks < 0 (減量方向 = 正しい方向)
  // Bulk: deltaKg < 0 → -deltaKg/weeks > 0 (増量方向 = 正しい方向)
  const requiredPaceKgPerWeek =
    weeksToMonthEnd !== null
      ? Math.round((-deltaKg / weeksToMonthEnd) * 100) / 100
      : null;

  const isCut = phase !== "Bulk";
  const state = calcMonthlyProgressState(deltaKg, requiredPaceKgPerWeek, isCut);

  return {
    hasData: true,
    monthlyTargetWeight,
    comparisonWeight,
    deltaKg,
    daysToMonthEnd,
    weeksToMonthEnd,
    requiredPaceKgPerWeek,
    state,
    hasWarnings: plan.warnings.length > 0,
  };
}
