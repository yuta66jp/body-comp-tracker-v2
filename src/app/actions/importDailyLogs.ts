"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import { deriveLegFlag } from "@/lib/utils/trainingType";
import type { ParsedRow } from "@/lib/utils/csvParser";

export type ImportDailyLogsResult =
  | { ok: true; count: number }
  | { ok: false; message: string };

/**
 * CSV パース済みの行を batch で daily_logs に upsert する Server Action。
 *
 * 通常保存 (saveDailyLog) との整合:
 * - leg_flag は CSV の値を使わず training_type から再導出する（buildUpdatePayload と同じルール）
 * - is_poor_sleep は廃止済みのため保存対象から除外する
 * - 保存成功後に revalidateAfterDailyLogMutation() を呼ぶ（通常保存と同等の revalidate）
 */
export async function importDailyLogs(
  rows: ParsedRow[]
): Promise<ImportDailyLogsResult> {
  if (rows.length === 0) return { ok: true, count: 0 };

  // is_poor_sleep を除外し、leg_flag を training_type から再導出する
  const payload = rows.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ is_poor_sleep: _deprecated, leg_flag: _csvLegFlag, training_type, ...rest }) => ({
      ...rest,
      training_type,
      leg_flag: deriveLegFlag(training_type),
    })
  );

  const supabase = createClient();
  const { error } = await supabase
    .from("daily_logs")
    .upsert(payload as never, { onConflict: "log_date" });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAfterDailyLogMutation();
  return { ok: true, count: rows.length };
}
