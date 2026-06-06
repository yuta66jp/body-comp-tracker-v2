/**
 * calcMonthlyBehaviorStats — 月別行動・生活集計
 *
 * 月ごとに以下を集計する pure function:
 *   - 便通日数 (had_bowel_movement === true の日数)
 *   - トレーニング部位別日数 (training_type の有効値ごと)
 *   - 仕事モード別日数 (work_mode の有効値ごと)
 *   - 特殊日フラグ別日数 (is_cheat_day / is_refeed_day / is_eating_out / is_travel_day)
 *   - 睡眠リズム (sleepStats: calcMonthlySleepStats の結果, #581 / Google Health 対応 #688)
 *   - 心肺機能 (Google Health 由来の HRV / 安静時心拍数の月平均)
 *
 * null 扱いの方針 (既存仕様に準拠):
 *   - had_bowel_movement: null = 未記録 → 集計対象外。true のみ日数としてカウント。false は「便通なし」だがカウントしない
 *   - training_type: null = 未記録 → 集計対象外。"off" は「オフ日」として有効値かつカウント対象
 *   - work_mode: null = 未記録 → 集計対象外。"off" は「休日」として有効値かつカウント対象
 *   - 特殊日フラグ: true のみ日数としてカウント。false / null は集計対象外
 *   - 睡眠: Google Health metrics が渡された場合は sleep_minutes / sleep_bed_at / sleep_wake_at を優先。
 *           未指定時は後方互換として sleep_sessions を使う。勤務形態未記録日は勤務形態別集計から除外
 *   - 心肺機能: null を除外し、0 補完しない
 */

import type { DashboardDailyLog } from "@/lib/supabase/types";
import type { GoogleHealthDailyMetricForDisplay } from "@/lib/googleHealth/displayMetrics";
import {
  isValidTrainingType,
  isValidWorkMode,
  TRAINING_TYPES,
  WORK_MODES,
} from "./trainingType";
import type { TrainingType, WorkMode } from "./trainingType";
import { calcMonthlySleepStats } from "./calcMonthlySleepStats";
import type { MonthlySleepStats } from "./calcMonthlySleepStats";

export type { MonthlySleepStats };

export interface MonthlyCardioStats {
  /** HRV の月平均 (ms)。有効値なしなら null */
  avgHrvMs: number | null;
  /** 安静時心拍数の月平均 (bpm)。有効値なしなら null */
  avgRhrBpm: number | null;
}

type SleepSessionInput = {
  wake_date: string;
  bed_at: string;
  wake_at: string;
};

export interface MonthlyBehaviorStats {
  month: string; // "YYYY-MM"
  /** had_bowel_movement === true の日数 */
  bowelDays: number;
  /**
   * training_type 別日数。
   * null / 無効値は除外。"off"（オフ日）は含む。
   * キーが存在しない = その部位のログが1日もない。
   */
  trainingCounts: Partial<Record<TrainingType, number>>;
  /**
   * work_mode 別日数。
   * null / 無効値は除外。"off"（休日）は含む。
   * キーが存在しない = そのモードのログが1日もない。
   */
  workModeCounts: Partial<Record<WorkMode, number>>;
  /** 特殊日フラグ別日数。各フラグ === true の日数。 */
  flagCounts: {
    is_cheat_day: number;
    is_refeed_day: number;
    is_eating_out: number;
    is_travel_day: number;
  };
  /**
   * 睡眠リズム集計 (#581)。
   * Google Health metrics / sleepSessions が渡されなかった場合、または対象月に有効値がない場合は null。
   */
  sleepStats: MonthlySleepStats | null;
  /**
   * 心肺機能集計 (#688)。
   * Google Health metrics が渡されなかった場合 / 対象月に有効値がない場合は null。
   */
  cardioStats: MonthlyCardioStats | null;
}

/**
 * 月別行動・生活集計を計算する。
 *
 * @param logs          - DashboardDailyLog の配列（全期間）
 * @param months        - 最新から何ヶ月分を返すか。0 以下なら全月を返す (デフォルト: 0)
 * @param sleepSessions - sleep_sessions の配列（省略時は睡眠集計なし）
 * @param googleHealthMetrics - Google Health 日次メトリクス（指定時は睡眠集計の参照元として優先）
 * @returns 月ごとの集計結果。新しい月から順（降順）に並ぶ
 */
export function calcMonthlyBehaviorStats(
  logs: DashboardDailyLog[],
  months = 0,
  sleepSessions: SleepSessionInput[] = [],
  googleHealthMetrics?: GoogleHealthDailyMetricForDisplay[],
): MonthlyBehaviorStats[] {
  // month → ログ配列 に振り分ける
  const map = new Map<string, DashboardDailyLog[]>();
  for (const log of logs) {
    const month = log.log_date.slice(0, 7);
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(log);
  }

  let entries = Array.from(map.entries()).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );

  // months > 0 の場合は最新 N ヶ月に絞る
  if (months > 0) {
    entries = entries.slice(0, months);
  }

  return entries.map(([month, dayLogs]) => {
    // 便通: had_bowel_movement === true の日数
    const bowelDays = dayLogs.filter(
      (e) => e.had_bowel_movement === true,
    ).length;

    // training_type 別件数: null および無効値を除外
    const trainingCounts: Partial<Record<TrainingType, number>> = {};
    for (const e of dayLogs) {
      if (e.training_type != null && isValidTrainingType(e.training_type)) {
        const t = e.training_type as TrainingType;
        trainingCounts[t] = (trainingCounts[t] ?? 0) + 1;
      }
    }

    // work_mode 別件数: null および無効値を除外
    const workModeCounts: Partial<Record<WorkMode, number>> = {};
    for (const e of dayLogs) {
      if (e.work_mode != null && isValidWorkMode(e.work_mode)) {
        const w = e.work_mode as WorkMode;
        workModeCounts[w] = (workModeCounts[w] ?? 0) + 1;
      }
    }

    // 特殊日フラグ別件数: === true の件数のみ
    const flagCounts = {
      is_cheat_day: dayLogs.filter((e) => e.is_cheat_day === true).length,
      is_refeed_day: dayLogs.filter((e) => e.is_refeed_day === true).length,
      is_eating_out: dayLogs.filter((e) => e.is_eating_out === true).length,
      is_travel_day: dayLogs.filter((e) => e.is_travel_day === true).length,
    };

    // 睡眠リズム集計
    const workModeByDate = new Map<string, string | null>(
      dayLogs.map((l) => [l.log_date, l.work_mode]),
    );
    const monthGoogleHealthMetrics = googleHealthMetrics?.filter(
      (metric) => metric.metric_date.slice(0, 7) === month,
    ) ?? [];
    const sleepInputs = googleHealthMetrics
      ? monthGoogleHealthMetrics.map((metric) => ({
          wake_date:      metric.metric_date,
          bed_at:         metric.sleep_bed_at,
          wake_at:        metric.sleep_wake_at,
          sleep_minutes:  metric.sleep_minutes,
        }))
      : sleepSessions.filter((s) => s.wake_date.slice(0, 7) === month);
    const rawSleepStats =
      sleepInputs.length > 0
        ? calcMonthlySleepStats(sleepInputs, workModeByDate)
        : null;
    const sleepStats =
      rawSleepStats &&
      (
        rawSleepStats.avgSleepHours !== null ||
        rawSleepStats.medianBedTime !== null ||
        rawSleepStats.medianWakeTime !== null
      )
        ? rawSleepStats
        : null;

    const avg = (values: Array<number | null>): number | null => {
      const valid = values.filter((value): value is number => value !== null);
      if (valid.length === 0) return null;
      return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10;
    };
    const avgHrvMs = avg(monthGoogleHealthMetrics.map((metric) => metric.hrv_ms));
    const avgRhrBpm = avg(monthGoogleHealthMetrics.map((metric) => metric.rhr_bpm));
    const cardioStats =
      avgHrvMs !== null || avgRhrBpm !== null
        ? { avgHrvMs, avgRhrBpm }
        : null;

    return { month, bowelDays, trainingCounts, workModeCounts, flagCounts, sleepStats, cardioStats };
  });
}

/**
 * TRAINING_TYPES の定義順で trainingCounts を走査し、
 * 件数が 1 以上のエントリーを返す。
 * 表示順を canonical 定義 (TRAINING_TYPES) に揃えるためのヘルパー。
 */
export function sortedTrainingEntries(
  counts: Partial<Record<TrainingType, number>>,
): Array<{ type: TrainingType; count: number }> {
  return TRAINING_TYPES.filter(
    (t) => (counts[t] ?? 0) > 0,
  ).map((t) => ({ type: t, count: counts[t]! }));
}

/**
 * WORK_MODES の定義順で workModeCounts を走査し、
 * 件数が 1 以上のエントリーを返す。
 */
export function sortedWorkModeEntries(
  counts: Partial<Record<WorkMode, number>>,
): Array<{ mode: WorkMode; count: number }> {
  return WORK_MODES.filter(
    (w) => (counts[w] ?? 0) > 0,
  ).map((w) => ({ mode: w, count: counts[w]! }));
}
