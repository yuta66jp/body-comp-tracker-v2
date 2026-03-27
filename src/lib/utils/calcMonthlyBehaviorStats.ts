/**
 * calcMonthlyBehaviorStats — 月別行動・生活集計
 *
 * 月ごとに以下を集計する pure function:
 *   - 便通日数 (had_bowel_movement === true の件数)
 *   - トレーニング部位別件数 (training_type の有効値ごと)
 *   - 仕事モード別件数 (work_mode の有効値ごと)
 *   - 特殊日フラグ別件数 (is_cheat_day / is_refeed_day / is_eating_out / is_travel_day / is_poor_sleep)
 *
 * null 扱いの方針 (既存仕様に準拠):
 *   - had_bowel_movement: null = 未記録 → 集計対象外。true のみカウント。false は「便通なし」だがカウントしない
 *   - training_type: null = 未記録 → 集計対象外。"off" は「オフ日」として有効値かつカウント対象
 *   - work_mode: null = 未記録 → 集計対象外。"off" は「休日」として有効値かつカウント対象
 *   - 特殊日フラグ: true のみカウント。false / null は集計対象外
 */

import type { DashboardDailyLog } from "@/lib/supabase/types";
import {
  isValidTrainingType,
  isValidWorkMode,
  TRAINING_TYPES,
  WORK_MODES,
} from "./trainingType";
import type { TrainingType, WorkMode } from "./trainingType";

export interface MonthlyBehaviorStats {
  month: string; // "YYYY-MM"
  /** had_bowel_movement === true の件数 */
  bowelCount: number;
  /**
   * training_type 別件数。
   * null / 無効値は除外。"off"（オフ日）は含む。
   * キーが存在しない = その部位のログが1件もない。
   */
  trainingCounts: Partial<Record<TrainingType, number>>;
  /**
   * work_mode 別件数。
   * null / 無効値は除外。"off"（休日）は含む。
   * キーが存在しない = そのモードのログが1件もない。
   */
  workModeCounts: Partial<Record<WorkMode, number>>;
  /** 特殊日フラグ別件数。各フラグ === true の件数。 */
  flagCounts: {
    is_cheat_day: number;
    is_refeed_day: number;
    is_eating_out: number;
    is_travel_day: number;
    /** is_poor_sleep は入力 UI 廃止済みだが DB データが残るため集計対象とする */
    is_poor_sleep: number;
  };
}

/**
 * 月別行動・生活集計を計算する。
 *
 * @param logs - DashboardDailyLog の配列（全期間）
 * @param months - 最新から何ヶ月分を返すか。0 以下なら全月を返す (デフォルト: 0)
 * @returns 月ごとの集計結果。新しい月から順（降順）に並ぶ
 */
export function calcMonthlyBehaviorStats(
  logs: DashboardDailyLog[],
  months = 0,
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
    // 便通: had_bowel_movement === true の件数
    const bowelCount = dayLogs.filter(
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
      is_poor_sleep: dayLogs.filter((e) => e.is_poor_sleep === true).length,
    };

    return { month, bowelCount, trainingCounts, workModeCounts, flagCounts };
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
