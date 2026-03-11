/**
 * 共通派生指標 (ReadinessMetrics)
 *
 * ダッシュボード・停滞検知・週次レビュー・目標ナビなど
 * 後続フェーズで横断的に使う指標の単一計算源。
 *
 * 責務の境界:
 *   - calcWeightTrend  → 線形回帰 slope (kg/day)
 *   - calcReadiness    → ビジネス指標 (現在体重・平均・変化率・目標距離)
 *   - KpiCards         → 表示フォーマット (将来的に calcReadiness へ委譲予定)
 */

import type { DailyLog } from "@/lib/supabase/types";
import { calcWeightTrend } from "./calcTrend";
import { toJstDateStr, dateRangeStr } from "./date";

export interface ReadinessMetrics {
  /** 最新の体重エントリ (kg) */
  current_weight: number | null;
  /** 直近7暦日の体重平均 (kg) */
  weight_7d_avg: number | null;
  /** 直近14暦日の体重平均 (kg) */
  weight_14d_avg: number | null;
  /**
   * 週平均体重の変化 (kg)
   * = 直近7日平均 − 前7日 (8〜14日前) 平均
   * null: どちらかの期間にデータがない場合
   */
  weight_change_7d: number | null;
  /**
   * 週あたりの体重変化率 (kg/週)
   * 直近14日の線形回帰 slope × 7
   * 負 = 減量, 正 = 増量
   */
  weekly_rate_kg: number | null;
  /** コンテストまでの残り日数 (今日含まず) */
  days_to_contest: number | null;
  /**
   * 目標体重までの距離 (kg)
   * = current_weight − goal_weight
   * 正 = まだ上 (Cut では減量が必要), 負 = 下回った
   */
  remaining_to_goal_kg: number | null;
  /**
   * 目標達成に必要な週あたり変化率 (kg/週)
   * = (goal_weight − current_weight) / weeks_left
   * 負 = 減量が必要 (Cut), 正 = 増量が必要 (Bulk)
   * null: days_to_contest が 0 以下 or データ不足
   */
  required_rate_kg_per_week: number | null;
}

interface ReadinessSettings {
  contest_date?: string | null;
  goal_weight?: number | null;
}

/** 数値配列の平均 (null を除く). データが空なら null. */
function avgOrNull(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * 共通派生指標を計算する。
 *
 * @param logs     daily_logs 全件 (ソート順不問)
 * @param settings contest_date / goal_weight を含む設定 Record
 * @param today    基準日 (YYYY-MM-DD). 省略時は JST の今日
 */
export function calcReadiness(
  logs: DailyLog[],
  settings: ReadinessSettings,
  today?: string
): ReadinessMetrics {
  const todayStr = today ?? toJstDateStr(new Date());

  // --- ログを日付 Map に変換 ---
  const logByDate = new Map<string, DailyLog>();
  for (const log of logs) {
    // 同日重複があれば後勝ち (DBのPK制約上は起きないが防御的に)
    logByDate.set(log.log_date, log);
  }

  // --- 期間ごとの暦日リストを生成 ---
  const d7Start = shiftDate(todayStr, -6);   // today-6 〜 today (7日間)
  const d14Start = shiftDate(todayStr, -13); // today-13 〜 today (14日間)
  const prev7Start = shiftDate(todayStr, -13);
  const prev7End = shiftDate(todayStr, -7);  // today-13 〜 today-7 (前の7日間)

  const last7Dates = dateRangeStr(d7Start, todayStr);
  const last14Dates = dateRangeStr(d14Start, todayStr);
  const prev7Dates = dateRangeStr(prev7Start, prev7End);

  // --- 各ウィンドウの体重値 ---
  const w7 = last7Dates.map((d) => logByDate.get(d)?.weight ?? null);
  const w14 = last14Dates.map((d) => logByDate.get(d)?.weight ?? null);
  const wPrev7 = prev7Dates.map((d) => logByDate.get(d)?.weight ?? null);

  // --- current_weight: 最新の非 null エントリ ---
  const sortedWithWeight = [...logs]
    .filter((l) => l.weight !== null)
    .sort((a, b) => b.log_date.localeCompare(a.log_date));
  const current_weight = sortedWithWeight[0]?.weight ?? null;

  // --- 移動平均 ---
  const weight_7d_avg = avgOrNull(w7);
  const weight_14d_avg = avgOrNull(w14);

  // --- 週平均体重の変化: 直近7日avg − 前7日avg ---
  const weight_7d_avg_prev = avgOrNull(wPrev7);
  const weight_change_7d =
    weight_7d_avg !== null && weight_7d_avg_prev !== null
      ? weight_7d_avg - weight_7d_avg_prev
      : null;

  // --- 週あたり変化率: 14日線形回帰 slope × 7 ---
  const trendData = last14Dates
    .map((d) => ({ date: d, weight: logByDate.get(d)?.weight ?? null }))
    .filter((p): p is { date: string; weight: number } => p.weight !== null);
  const weekly_rate_kg =
    trendData.length >= 2 ? calcWeightTrend(trendData).slope * 7 : null;

  // --- コンテストまでの残り日数 ---
  const contestDate = settings.contest_date ?? null;
  let days_to_contest: number | null = null;
  if (contestDate) {
    const msPerDay = 86_400_000;
    // today 0:00 JST から計算
    const todayMs = new Date(`${todayStr}T00:00:00+09:00`).getTime();
    const contestMs = new Date(`${contestDate}T00:00:00+09:00`).getTime();
    days_to_contest = Math.round((contestMs - todayMs) / msPerDay);
  }

  // --- 目標体重との距離 ---
  const goalWeight = settings.goal_weight ?? null;
  const remaining_to_goal_kg =
    current_weight !== null && goalWeight !== null
      ? current_weight - goalWeight
      : null;

  // --- 必要週次変化率: (goal - current) / weeks_left ---
  let required_rate_kg_per_week: number | null = null;
  if (
    remaining_to_goal_kg !== null &&
    days_to_contest !== null &&
    days_to_contest > 0
  ) {
    const weeksLeft = days_to_contest / 7;
    // (goal - current) = -remaining, 負なら減量が必要
    required_rate_kg_per_week = -remaining_to_goal_kg / weeksLeft;
  }

  return {
    current_weight,
    weight_7d_avg,
    weight_14d_avg,
    weight_change_7d,
    weekly_rate_kg,
    days_to_contest,
    remaining_to_goal_kg,
    required_rate_kg_per_week,
  };
}

/** YYYY-MM-DD から n 日ずらした YYYY-MM-DD を返す */
function shiftDate(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return toJstDateStr(d);
}
