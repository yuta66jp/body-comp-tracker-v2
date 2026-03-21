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

import type { DashboardDailyLog } from "@/lib/supabase/types";
import { calcWeightTrend } from "./calcTrend";
import { toJstDateStr, dateRangeStr, calcDaysLeft, addDaysStr } from "./date";

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
  /**
   * 2週あたりの体重変化率 (kg/2週) — ペース分析の primary 単位
   * = weekly_rate_kg * 2
   * null: weekly_rate_kg が null の場合
   */
  weekly_rate_kg_per_2weeks: number | null;
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
  /**
   * 目標達成に必要な2週あたり変化率 (kg/2週) — ペース分析の primary 単位
   * = required_rate_kg_per_week * 2
   * null: required_rate_kg_per_week が null の場合
   */
  required_rate_kg_per_2weeks: number | null;
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
  logs: DashboardDailyLog[],
  settings: ReadinessSettings,
  today?: string
): ReadinessMetrics {
  const todayStr = today ?? toJstDateStr(new Date());

  // --- ログを日付 Map に変換 ---
  const logByDate = new Map<string, DashboardDailyLog>();
  for (const log of logs) {
    // 同日重複があれば後勝ち (DBのPK制約上は起きないが防御的に)
    logByDate.set(log.log_date, log);
  }

  // --- 期間ごとの暦日リストを生成 ---
  const d7Start = addDaysStr(todayStr, -6) ?? todayStr;    // today-6 〜 today (7日間)
  const d14Start = addDaysStr(todayStr, -13) ?? todayStr;  // today-13 〜 today (14日間)
  const prev7Start = addDaysStr(todayStr, -13) ?? todayStr;
  const prev7End = addDaysStr(todayStr, -7) ?? todayStr;   // today-13 〜 today-7 (前の7日間)

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
  // 2週あたり変化率: weekly_rate_kg × 2
  const weekly_rate_kg_per_2weeks =
    weekly_rate_kg !== null ? weekly_rate_kg * 2 : null;

  // --- コンテストまでの残り日数 ---
  // calcDaysLeft を使い KpiCards / GoalNavigator / calcReadiness で定義を統一する
  const contestDate = settings.contest_date ?? null;
  const days_to_contest = contestDate ? calcDaysLeft(todayStr, contestDate) : null;

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
  // 必要2週次変化率: required_rate_kg_per_week × 2
  const required_rate_kg_per_2weeks =
    required_rate_kg_per_week !== null ? required_rate_kg_per_week * 2 : null;

  return {
    current_weight,
    weight_7d_avg,
    weight_14d_avg,
    weight_change_7d,
    weekly_rate_kg,
    weekly_rate_kg_per_2weeks,
    days_to_contest,
    remaining_to_goal_kg,
    required_rate_kg_per_week,
    required_rate_kg_per_2weeks,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2週ベースペース計算（純粋関数 / テスト可能）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 目標達成に必要な 2週あたり変化率 (kg/2週) を返す。
 *
 * 計算式: (remainingKg / remainingDays) * 14
 * 負 = 減量が必要 (Cut), 正 = 増量が必要 (Bulk)
 *
 * @param remainingDays  残り日数 (0 以下のとき null を返す)
 * @param remainingKg    基準体重 − 目標体重 (正=まだ上, Cut では減量が必要)
 * @returns kg/2週。residual が 0 の場合は 0, remainingDays ≤ 0 なら null。
 */
export function calcRequiredPacePerTwoWeeks(
  remainingDays: number,
  remainingKg: number
): number | null {
  if (remainingDays <= 0) return null;
  // (goal - current) / days * 14 = -(remainingKg / remainingDays) * 14
  return (-remainingKg / remainingDays) * 14;
}

/**
 * 直近の実績ペース (kg/2週) を体重ログから算出する。
 *
 * 内部計算: 直近14暦日の線形回帰 slope × 14
 * データ点が 2件未満の場合は null を返す。
 *
 * @param logs   体重ログ配列 (date: YYYY-MM-DD, weight: number)
 * @param today  基準日 YYYY-MM-DD。省略時は JST 今日。
 * @returns kg/2週。データ不足なら null。
 */
export function calcActualPacePerTwoWeeks(
  logs: { date: string; weight: number }[],
  today?: string
): number | null {
  const todayStr = today ?? toJstDateStr(new Date());
  const d14Start = addDaysStr(todayStr, -13) ?? todayStr;
  const last14Dates = dateRangeStr(d14Start, todayStr);

  const logMap = new Map<string, number>();
  for (const l of logs) {
    logMap.set(l.date, l.weight);
  }

  const trendData = last14Dates
    .map((d) => ({ date: d, weight: logMap.get(d) ?? null }))
    .filter((p): p is { date: string; weight: number } => p.weight !== null);

  if (trendData.length < 2) return null;
  const slopePerDay = calcWeightTrend(trendData).slope;
  return slopePerDay * 14;
}

// ─────────────────────────────────────────────────────────────────────────────
// 目標ステータス判定
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 目標達成ステータス。
 * - achieved   : 残り ≤ 0.2 kg
 * - on_track   : 実績ペース ≥ 必要ペース (比率 ≥ 1.0)
 * - adjust     : 比率 0.5〜1.0 未満
 * - behind     : 比率 0.5 未満 または逆方向
 * - no_contest : contest_date 未設定または過去
 * - unknown    : データ不足
 */
export type GoalStatus =
  | "achieved"
  | "on_track"
  | "adjust"
  | "behind"
  | "no_contest"
  | "unknown";

/**
 * ペース比率からステータスを判定する純粋関数。
 *
 * ratio = actualRate / requiredRate
 *   Cut:  required < 0, actual < 0 が理想
 *   Bulk: required > 0, actual > 0 が理想
 *
 * @param actualRateKgPerWeek   実績ペース (kg/週, 負=減量)
 * @param requiredRateKgPerWeek 必要ペース (kg/週, 負=減量)
 * @param remainingToGoalKg     基準体重 − 目標体重 (正=まだ上)
 * @param daysToContest         残り日数 (負=過去)
 */
export function calcGoalStatus(
  actualRateKgPerWeek: number | null,
  requiredRateKgPerWeek: number | null,
  remainingToGoalKg: number | null,
  daysToContest: number | null
): GoalStatus {
  if (daysToContest === null || daysToContest < 0) return "no_contest";
  if (remainingToGoalKg !== null && Math.abs(remainingToGoalKg) < 0.2) return "achieved";
  if (actualRateKgPerWeek === null || requiredRateKgPerWeek === null) return "unknown";
  if (requiredRateKgPerWeek === 0) return "on_track";

  const ratio = actualRateKgPerWeek / requiredRateKgPerWeek;
  if (ratio >= 1.0) return "on_track";
  if (ratio >= 0.5) return "adjust";
  return "behind";
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI 目標到達予定日計算（7日平均 + 14暦日回帰ベース）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KPI 目標到達予定の計算結果。
 *
 * - no_data   : 7日平均または目標体重が取得できない
 * - achieved  : |7日平均 − 目標体重| < 0.1 kg
 * - stalled   : 到達方向へ進んでいない、またはデータ不足でペース不明
 * - projected : 到達予定日が推定できた
 */
export interface GoalReachResult {
  status: "achieved" | "stalled" | "projected" | "no_data";
  /** 到達予定日 (YYYY-MM-DD)。status="projected" 時のみ非 null */
  date: string | null;
  /** 表示ラベル ("MM-DD" / "達成済み ✓" / "停滞中" / "—") */
  label: string;
}

/**
 * KPI の「目標到達予定日」を 7日平均 + 30暦日回帰ペースから算出する。
 *
 * - 現在地: weight7dAvg（生体重ノイズを除いた安定した基準点）
 * - 進行速度: slopePerDay（直近30暦日の線形回帰 kg/day）
 *   14日回帰より短期局面の影響を受けにくく、安定した着地見通しを示す。
 * - 到達日数: (現在地 − 目標体重) / (-slopePerDay)
 *
 * KPI 主表示に AI 予測は採用しない。
 * AI 予測はダッシュボードのチャート（ForecastChart）で参考表示する。
 * 直近トレンドの短期補助線は ForecastChart の EW Linear Trend 線を参照する。
 *
 * @param weight7dAvg  直近7暦日の体重平均 (kg)。null ならラベル "—" を返す
 * @param slopePerDay  直近30暦日の線形回帰 slope (kg/day)。null なら停滞中扱い
 * @param goalWeight   目標体重 (kg)。null ならラベル "—" を返す
 * @param today        基準日 (YYYY-MM-DD)
 */
export function calcGoalReachDate(
  weight7dAvg: number | null,
  slopePerDay: number | null,
  goalWeight: number | null,
  today: string
): GoalReachResult {
  if (weight7dAvg === null || goalWeight === null) {
    return { status: "no_data", date: null, label: "—" };
  }

  const gap = weight7dAvg - goalWeight; // 正=まだ上 (Cut), 負=下回った (Bulk)

  if (Math.abs(gap) < 0.1) {
    return { status: "achieved", date: null, label: "達成済み ✓" };
  }

  // 停滞中: ペース不明 / ゼロ / 到達方向と逆
  if (
    slopePerDay === null ||
    slopePerDay === 0 ||
    (gap > 0 && slopePerDay >= 0) || // Cut: 減量必要なのに増減なし or 増量中
    (gap < 0 && slopePerDay <= 0)    // Bulk: 増量必要なのに増減なし or 減量中
  ) {
    return { status: "stalled", date: null, label: "停滞中" };
  }

  const daysNeeded = gap / (-slopePerDay);
  if (daysNeeded <= 0 || daysNeeded >= 730) {
    return { status: "stalled", date: null, label: "停滞中" };
  }

  const date = addDaysStr(today, Math.round(daysNeeded));
  if (!date) return { status: "stalled", date: null, label: "停滞中" };

  return { status: "projected", date, label: date.slice(5) }; // MM-DD
}

/**
 * 実績ペースを必要ペースに合わせるための 1日あたりカロリー調整量 (kcal)。
 * 負 = 摂取量を減らす、正 = 増やす。50 kcal 単位に丸め。
 */
export function calcKcalCorrection(
  actualRateKgPerWeek: number | null,
  requiredRateKgPerWeek: number | null
): number | null {
  if (actualRateKgPerWeek === null || requiredRateKgPerWeek === null) return null;
  const paceGap = requiredRateKgPerWeek - actualRateKgPerWeek;
  const raw = (paceGap * 7200) / 7;
  return Math.round(raw / 50) * 50;
}
