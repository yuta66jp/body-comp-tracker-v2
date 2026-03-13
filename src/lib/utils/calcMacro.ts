import type { DailyLog } from "@/lib/supabase/types";

/** Macro 画面用の目標値（settings から取得）*/
export interface MacroTargets {
  calories: number | null;
  protein:  number | null;
  fat:      number | null;
  carbs:    number | null;
}

/** 差分 = 実績 - 目標 */
export interface MacroDiff {
  calories: number | null;
  protein:  number | null;
  fat:      number | null;
  carbs:    number | null;
}

/** 今週の PFC kcal 比率 */
export interface PfcKcalRatio {
  proteinKcal: number;
  fatKcal:     number;
  carbsKcal:   number;
  totalKcal:   number;
  proteinPct:  number;
  fatPct:      number;
  carbsPct:    number;
}

/**
 * 実績 - 目標 の差分を返す。どちらかが null なら null。
 * calories: kcal (整数), protein/fat/carbs: g (整数)
 */
export function calcMacroDiff(
  actual: MacroPeriodStats,
  targets: MacroTargets
): MacroDiff {
  const d = (a: number | null, t: number | null) =>
    a !== null && t !== null ? Math.round(a) - t : null;
  return {
    calories: d(actual.avgCalories, targets.calories),
    protein:  d(actual.avgProtein,  targets.protein),
    fat:      d(actual.avgFat,      targets.fat),
    carbs:    d(actual.avgCarbs,    targets.carbs),
  };
}

/**
 * 今週の P/F/C 平均グラム値から kcal 換算比率を返す。
 * P×4 + C×4 + F×9 を 100% とする。
 * P/F/C いずれかが null、または合計 0 の場合は null。
 */
export function calcPfcKcalRatio(stats: MacroPeriodStats): PfcKcalRatio | null {
  const { avgProtein: p, avgFat: f, avgCarbs: c } = stats;
  if (p === null || f === null || c === null) return null;
  const pKcal = p * 4;
  const fKcal = f * 9;
  const cKcal = c * 4;
  const total = pKcal + fKcal + cKcal;
  if (total <= 0) return null;
  const proteinPct = Math.round((pKcal / total) * 100);
  const fatPct     = Math.round((fKcal / total) * 100);
  const carbsPct   = 100 - proteinPct - fatPct;
  return {
    proteinKcal: Math.round(pKcal),
    fatKcal:     Math.round(fKcal),
    carbsKcal:   Math.round(cKcal),
    totalKcal:   Math.round(total),
    proteinPct,
    fatPct,
    carbsPct,
  };
}

export interface MacroPeriodStats {
  avgCalories: number | null;
  avgProtein: number | null;
  avgFat: number | null;
  avgCarbs: number | null;
  days: number;
}

export interface MacroKpiData {
  weekly: MacroPeriodStats;
  prevWeekly: MacroPeriodStats;
  monthly: MacroPeriodStats;
  weightChangeRate: number | null; // %/週
  proteinRatio: number | null;     // %
}

function avg(vals: (number | null)[]): number | null {
  const v = vals.filter((x): x is number => x !== null);
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function periodStats(logs: DailyLog[]): MacroPeriodStats {
  return {
    avgCalories: avg(logs.map((d) => d.calories)),
    avgProtein: avg(logs.map((d) => d.protein)),
    avgFat: avg(logs.map((d) => d.fat)),
    avgCarbs: avg(logs.map((d) => d.carbs)),
    days: logs.length,
  };
}

export function calcMacroKpi(logs: DailyLog[]): MacroKpiData {
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));

  const last7 = sorted.slice(-7);
  const prev7 = sorted.slice(-14, -7);
  const last30 = sorted.slice(-30);

  // 週次体重変化率
  const weightsLast7 = last7.filter((d) => d.weight !== null).map((d) => d.weight!);
  const weightsPrev7 = prev7.filter((d) => d.weight !== null).map((d) => d.weight!);
  let weightChangeRate: number | null = null;
  if (weightsLast7.length > 0 && weightsPrev7.length > 0) {
    const avgCurr = weightsLast7.reduce((a, b) => a + b, 0) / weightsLast7.length;
    const avgPrev = weightsPrev7.reduce((a, b) => a + b, 0) / weightsPrev7.length;
    weightChangeRate = avgPrev > 0 ? ((avgCurr - avgPrev) / avgPrev) * 100 : null;
  }

  // タンパク質比率
  const weekly = periodStats(last7);
  const proteinRatio =
    weekly.avgCalories && weekly.avgCalories > 0 && weekly.avgProtein !== null
      ? (weekly.avgProtein * 4 / weekly.avgCalories) * 100
      : null;

  return {
    weekly,
    prevWeekly: periodStats(prev7),
    monthly: periodStats(last30),
    weightChangeRate,
    proteinRatio,
  };
}

/** 直近 N 日分の日次 PFC データ（グラフ用） */
export function calcDailyMacro(logs: DailyLog[], days = 60) {
  return [...logs]
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
    .slice(-days)
    .map((d) => ({
      date: d.log_date.slice(5), // MM-DD
      fullDate: d.log_date,
      calories: d.calories ?? 0,
      protein: d.protein ?? 0,
      fat: d.fat ?? 0,
      carbs: d.carbs ?? 0,
    }));
}
