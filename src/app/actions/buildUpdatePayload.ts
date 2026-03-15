import { deriveLegFlag } from "@/lib/utils/trainingType";
import type { SaveDailyLogInput, DailyLogPayload } from "./saveDailyLog";

/**
 * input から undefined フィールドを除去した DB 更新ペイロードを構築する。
 *
 * ルール:
 *   - undefined → ペイロードに含めない（既存値を保持）
 *   - null      → ペイロードに含める（明示的クリア）
 *   - 値あり    → ペイロードに含める（上書き）
 *
 * training_type が含まれる場合は leg_flag を同時に導出してペイロードに追加する。
 * leg_flag は training_type に従属するため、常に一致した状態で保存される。
 */
export function buildUpdatePayload(
  input: Omit<SaveDailyLogInput, "log_date">
): DailyLogPayload {
  const payload: DailyLogPayload = {};

  // 既存フィールド
  if (input.weight !== undefined)        payload.weight        = input.weight;
  if (input.calories !== undefined)      payload.calories      = input.calories;
  if (input.protein !== undefined)       payload.protein       = input.protein;
  if (input.fat !== undefined)           payload.fat           = input.fat;
  if (input.carbs !== undefined)         payload.carbs         = input.carbs;
  if (input.note !== undefined)          payload.note          = input.note;
  if (input.is_cheat_day !== undefined)  payload.is_cheat_day  = input.is_cheat_day;
  if (input.is_refeed_day !== undefined) payload.is_refeed_day = input.is_refeed_day;
  if (input.is_eating_out !== undefined) payload.is_eating_out = input.is_eating_out;
  if (input.is_travel_day !== undefined) payload.is_travel_day = input.is_travel_day;
  if (input.is_poor_sleep !== undefined) payload.is_poor_sleep = input.is_poor_sleep;

  // Phase 2.5 新規フィールド
  if (input.sleep_hours !== undefined)         payload.sleep_hours         = input.sleep_hours;
  if (input.had_bowel_movement !== undefined)  payload.had_bowel_movement  = input.had_bowel_movement;
  if (input.work_mode !== undefined)           payload.work_mode           = input.work_mode;

  // training_type と leg_flag は必ず一緒に処理する（leg_flag は training_type から導出）
  if (input.training_type !== undefined) {
    payload.training_type = input.training_type;
    payload.leg_flag      = deriveLegFlag(input.training_type);
  }

  return payload;
}
