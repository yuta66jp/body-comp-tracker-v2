"use server";

import { saveDailyLog } from "./saveDailyLog";
import type { SaveDailyLogInput } from "./saveDailyLog";
import type { ParsedRow } from "@/lib/utils/csvParser";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";

export type ImportDailyLogsResult =
  | { ok: true; count: number; skipped: number }
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
 * revalidate の扱い:
 * - 行単位の revalidate は抑止（saveDailyLog に skipRevalidate: true を渡す）
 * - 全行保存完了後に 1 回だけ revalidateAfterDailyLogMutation() を呼ぶ
 * - 呼び出し元 (ImportSection.tsx) は BATCH_SIZE 単位でこの action を呼ぶため、
 *   revalidate はバッチ 1 回につき 1 回になる（行単位ではなくなる）
 *
 * @returns ok:true の場合は count（成功件数）と skipped（スキップ件数）を返す
 */
export async function importDailyLogs(
  rows: ParsedRow[]
): Promise<ImportDailyLogsResult> {
  if (rows.length === 0) return { ok: true, count: 0, skipped: 0 };

  let count = 0;
  let skipped = 0;

  for (const row of rows) {
    // ParsedRow → SaveDailyLogInput 変換
    // - leg_flag は saveDailyLog 内の buildUpdatePayload で training_type から導出するため除外
    const input: SaveDailyLogInput = {
      log_date: row.log_date,
      weight: row.weight,
      calories: row.calories,
      protein: row.protein,
      fat: row.fat,
      carbs: row.carbs,
      note: row.note,
      is_cheat_day: row.is_cheat_day,
      is_refeed_day: row.is_refeed_day,
      is_eating_out: row.is_eating_out,
      is_travel_day: row.is_travel_day,
      sleep_hours: row.sleep_hours,
      had_bowel_movement: row.had_bowel_movement,
      training_type: row.training_type,
      work_mode: row.work_mode,
    };

    // skipRevalidate: true でバッチ中の行単位 revalidate を抑止する
    const result = await saveDailyLog(input, { skipRevalidate: true });
    if (result.ok) {
      count++;
    } else {
      skipped++;
    }
  }

  // バッチ内で 1 件でも保存成功したら、ここで 1 回だけ revalidate する
  if (count > 0) {
    revalidateAfterDailyLogMutation();
  }

  return { ok: true, count, skipped };
}
