import type { DashboardDailyLog } from "@/lib/supabase/types";

/**
 * ログ配列（昇順ソート済み）と対象ログから体重差分を計算する。
 *
 * RecentLogsTable / RecentLogsCards で共通利用する。
 * 直前の体重記録が存在しない場合、または体重が null の場合は null を返す。
 *
 * @param ascending - log_date 昇順でソート済みの DashboardDailyLog 配列
 * @param log       - 差分を求めたいログエントリ
 */
export function computeWeightDelta(
  ascending: DashboardDailyLog[],
  log: DashboardDailyLog
): number | null {
  const idx = ascending.findIndex((d) => d.log_date === log.log_date);
  if (idx <= 0) return null;
  const prev = ascending[idx - 1];
  if (prev.weight === null || log.weight === null) return null;
  return log.weight - prev.weight;
}

/**
 * ログ配列から表示用の sorted（降順 14件）と ascending（昇順）を生成する。
 *
 * 体重未記録（weight === null）のログは除外する。
 */
export function buildRecentLogArrays(logs: DashboardDailyLog[]): {
  sorted: DashboardDailyLog[];
  ascending: DashboardDailyLog[];
} {
  const ascending = [...logs]
    .filter((d) => d.weight !== null)
    .sort((a, b) => a.log_date.localeCompare(b.log_date));

  const sorted = [...ascending]
    .sort((a, b) => b.log_date.localeCompare(a.log_date))
    .slice(0, 14);

  return { sorted, ascending };
}
