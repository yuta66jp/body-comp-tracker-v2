"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidTrainingType, isValidWorkMode } from "@/lib/utils/trainingType";
import { buildUpdatePayload } from "./buildUpdatePayload";
import { parseLocalDateStr } from "@/lib/utils/date";

/**
 * フィールドの意味:
 *   undefined  — 今回更新しない（ペイロードに含めない）
 *   null       — 明示的に値を空にする
 *   値あり      — その値に更新する
 *
 * leg_flag はユーザー入力不可。training_type から buildUpdatePayload 内で導出される。
 */
export type SaveDailyLogInput = {
  log_date: string;
  weight?: number | null;
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  note?: string | null;
  is_cheat_day?: boolean;
  is_refeed_day?: boolean;
  is_eating_out?: boolean;
  /** @deprecated UIからの入力廃止。既存データとの互換のため型には残す。 */
  is_poor_sleep?: boolean;
  // ── Phase 2.5 追加 ──
  sleep_hours?: number | null;
  /** null = 明示クリア（未記録に戻す） */
  had_bowel_movement?: boolean | null;
  /** 'chest' | 'back' | 'shoulders' | 'glutes_hamstrings' | 'quads' */
  training_type?: string | null;
  /** 'off' | 'office' | 'remote' | 'active' | 'travel' | 'other' */
  work_mode?: string | null;
  // leg_flag はユーザーから受け取らない。training_type から導出する。
};

/** DB に渡す更新ペイロード（undefined フィールドを除去したもの）*/
export type DailyLogPayload = Omit<SaveDailyLogInput, "log_date"> & {
  leg_flag?: boolean | null;
};

export type SaveDailyLogResult =
  | { ok: true }
  | { ok: false; message: string };

export async function saveDailyLog(
  input: SaveDailyLogInput
): Promise<SaveDailyLogResult> {
  // --- サーバー側バリデーション ---
  // parseLocalDateStr は形式・月範囲・実在日付をローカル解釈で厳密検証する。
  // Date.parse は環境依存・実在日未検証のため使用しない。
  if (parseLocalDateStr(input.log_date) === null) {
    return { ok: false, message: "日付の形式が正しくありません" };
  }

  if (input.weight !== undefined && input.weight !== null) {
    if (!isFinite(input.weight) || input.weight <= 0 || input.weight > 300) {
      return { ok: false, message: "体重は 0〜300 kg の範囲で入力してください" };
    }
  }

  for (const key of ["calories", "protein", "fat", "carbs"] as const) {
    const v = input[key];
    if (v !== undefined && v !== null && (!isFinite(v) || v < 0 || v > 99999)) {
      return { ok: false, message: `${key} の値が不正です` };
    }
  }

  if (input.note !== undefined && input.note !== null && input.note.length > 500) {
    return { ok: false, message: "メモは 500 文字以内で入力してください" };
  }

  if (input.sleep_hours !== undefined && input.sleep_hours !== null) {
    if (!isFinite(input.sleep_hours) || input.sleep_hours < 0 || input.sleep_hours > 24) {
      return { ok: false, message: "睡眠時間は 0〜24 時間の範囲で入力してください" };
    }
  }

  if (input.training_type !== undefined && input.training_type !== null) {
    if (!isValidTrainingType(input.training_type)) {
      return { ok: false, message: "training_type の値が不正です" };
    }
  }

  if (input.work_mode !== undefined && input.work_mode !== null) {
    if (!isValidWorkMode(input.work_mode)) {
      return { ok: false, message: "work_mode の値が不正です" };
    }
  }

  // undefined フィールドを除去したペイロードを構築
  const payload = buildUpdatePayload(input);

  // 開発時のみ: 更新対象フィールド名を出力（生データは含まない）
  if (process.env.NODE_ENV !== "production") {
    console.log("[saveDailyLog]", input.log_date, "fields:", Object.keys(payload).join(", "));
  }

  // 保存する値が何もない場合は弾く
  // (全フィールド undefined = プログラムバグまたは空送信)
  if (Object.keys(payload).length === 0) {
    return { ok: false, message: "保存するデータがありません" };
  }

  // --- Supabase: RPC で atomic upsert ---
  // save_daily_log_partial は INSERT ... ON CONFLICT DO UPDATE で
  // read-then-write を廃し、1 回の DB 呼び出しで partial upsert を完結させる。
  // payload の JSONB キー存在が undefined/null/値の 3 状態を担保する。
  const supabase = createClient();

  const { error: saveError } = await supabase.rpc("save_daily_log_partial", {
    p_log_date: input.log_date,
    p_fields:   payload,
  });

  if (saveError) {
    console.error("[saveDailyLog] rpc error:", saveError.message, "| payload keys:", Object.keys(payload));
    return { ok: false, message: "保存に失敗しました: " + saveError.message };
  }

  // --- On-demand revalidation ---
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/macro");
  revalidatePath("/tdee");

  return { ok: true };
}
