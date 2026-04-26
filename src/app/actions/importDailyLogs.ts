"use server";

import { saveDailyLog } from "./saveDailyLog";
import type { SaveDailyLogInput } from "./saveDailyLog";
import { saveSleepSession } from "./saveSleepSession";
import type { ParsedRow } from "@/lib/utils/csvParser";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";

export type ImportDailyLogsResult =
  | { ok: true; count: number; skipped: number; sleepSkipped: number }
  | { ok: false; message: string };

/**
 * CSV パース済みの行を 1 件ずつ saveDailyLog 経由で保存する Server Action。
 *
 * 前提: rows は log_date が一意であること（呼び出し元 ImportSection.tsx で
 * deduplicateByLogDate により重複排除済み）。同日行が複数あると最後の行が
 * DBに残るが、その場合は preflight の件数表示と不一致になるため渡さないこと。
 *
 * 通常保存 (saveDailyLog) との整合:
 * - 日付 / 数値範囲 / enum バリデーションを通常保存と同じ経路で実施
 * - leg_flag は training_type から buildUpdatePayload 内で導出（CSV の値を使わない）
 * - save_daily_log_partial RPC で atomic UPDATE → INSERT
 *
 * sleep_sessions の保存:
 * - sleep_bed_time / sleep_wake_time が両方ある行は saveSleepSession を呼ぶ
 * - saveDailyLog より後に saveSleepSession を呼ぶことで DB トリガーが正しく発火する
 *   （新規日付の場合、daily_logs 行が先に存在しないとトリガーが sleep_hours を書けない #528）
 * - sleep_hours 列は import 元として使用しない（projection 値であり source は sleep_sessions）
 * - saveSleepSession が失敗した場合は sleepSkipped をインクリメントする
 *   （daily_logs は保存済みのため count には含める）
 *
 * revalidate の扱い:
 * - この action は revalidate を一切行わない
 * - 行単位の revalidate は skipRevalidate: true を渡すことで抑止
 * - import 全体の完了後に呼び出し元 (ImportSection.tsx) が
 *   revalidateAfterImport() を 1 回だけ呼ぶ責務を持つ
 *
 * @returns ok:true の場合は count（成功件数）、skipped（日次ログスキップ件数）、
 *          sleepSkipped（睡眠セッション保存失敗件数）を返す
 */
export async function importDailyLogs(
  rows: ParsedRow[]
): Promise<ImportDailyLogsResult> {
  if (rows.length === 0) return { ok: true, count: 0, skipped: 0, sleepSkipped: 0 };

  let count = 0;
  let skipped = 0;
  let sleepSkipped = 0;

  for (const row of rows) {
    // ParsedRow → SaveDailyLogInput 変換
    // - leg_flag は saveDailyLog 内の buildUpdatePayload で training_type から導出するため除外
    // - sleep_hours は projection 値のため除外。就寝・起床時刻は sleep_sessions 経由で保存する
    const input: SaveDailyLogInput = {
      log_date: row.log_date,
      weight: row.weight,
      calories: row.calories,
      protein: row.protein,
      fat: row.fat,
      carbs: row.carbs,
      note: row.note,
      is_cheat_day:   row.is_cheat_day,
      is_refeed_day:  row.is_refeed_day,
      is_eating_out:  row.is_eating_out,
      is_travel_day:  row.is_travel_day,
      is_tanning_day: row.is_tanning_day,
      is_posing_day:  row.is_posing_day,
      had_bowel_movement: row.had_bowel_movement,
      training_type: row.training_type,
      work_mode: row.work_mode,
    };

    // skipRevalidate: true でバッチ中の行単位 revalidate を抑止する
    const result = await saveDailyLog(input, { skipRevalidate: true });
    if (result.ok) {
      count++;

      // 睡眠データがある場合は sleep_sessions を保存する。
      // saveDailyLog の後に呼ぶことで daily_logs 行が先に存在し、
      // DB トリガー (trg_sync_sleep_hours) が正しく sleep_hours を同期できる。
      if (row.sleep_bed_time !== null && row.sleep_wake_time !== null) {
        const sleepResult = await saveSleepSession(
          {
            wake_date: row.log_date,
            bed_time:  row.sleep_bed_time,
            wake_time: row.sleep_wake_time,
          },
          { skipRevalidate: true }
        );
        if (!sleepResult.ok) {
          if (sleepResult.reason === "auth_required") {
            return { ok: false, message: sleepResult.message };
          }
          sleepSkipped++;
        }
      }
    } else {
      if (result.reason === "auth_required") {
        return { ok: false, message: result.message };
      }
      skipped++;
    }
  }

  return { ok: true, count, skipped, sleepSkipped };
}

/**
 * CSV インポート全体の完了後に呼ぶ Server Action。
 * ImportSection.tsx がバッチループを終えた後に 1 回だけ呼ぶことで、
 * import 完了後に必要なページを一括再検証する。
 */
export async function revalidateAfterImport(): Promise<void> {
  revalidateAfterDailyLogMutation();
}
