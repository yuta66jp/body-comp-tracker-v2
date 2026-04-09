"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import { isValidTrainingType, isValidWorkMode } from "@/lib/utils/trainingType";
import { deriveSleepHours } from "@/lib/utils/sleep";
import { buildUpdatePayload } from "./buildUpdatePayload";
import { addDaysStr, parseLocalDateStr } from "@/lib/utils/date";

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
  is_travel_day?: boolean;
  // ── Phase 2.5 追加 ──
  sleep_hours?: number | null;
  /** null = 明示クリア（未記録に戻す） */
  had_bowel_movement?: boolean | null;
  /** 'off' | 'chest' | 'back' | 'shoulders' | 'glutes_hamstrings' | 'quads' */
  training_type?: string | null;
  /** 'off' | 'office' | 'remote' */
  work_mode?: string | null;
  // leg_flag はユーザーから受け取らない。training_type から導出する。
  // ── #435 追加 ──
  /** 最後の食事終了時刻 "HH:MM" 形式。null = 明示クリア */
  last_meal_end_time?: string | null;
  // ── #436 追加 ──
  /** Apple Health 歩数（日次集計）。null = 明示クリア */
  step_count?: number | null;
  // ── #501 追加 ──
  /**
   * 就寝時刻 "HH:MM" 形式。null = 明示クリア。
   *
   * 起床日基準（#507）: この log_date の朝に終了した睡眠セッションの開始時刻を表す。
   * 前日夜就寝（例: 23:30）・当日深夜就寝（例: 01:30）・早朝就寝（例: 04:00）のいずれも
   * 起床した日の log_date に属する値として保存する。
   *
   * #515 以降は sleep_sessions が睡眠の source of truth。MealLogger からは送信しない。
   * 移行期カラムとして DB には残存する（将来 #518 で廃止予定）。
   * #515 以降は sleep_sessions が source of truth。#526 で weigh_in_time は廃止（projection 値へ移行）。
   */
  bed_time?: string | null;
};

/** DB に渡す更新ペイロード（undefined フィールドを除去したもの）*/
export type DailyLogPayload = Omit<SaveDailyLogInput, "log_date"> & {
  /** training_type から導出される派生値。buildUpdatePayload が自動で追加する。 */
  leg_flag?: boolean | null;
};

export type SaveDailyLogResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * saveDailyLog のオプション。
 *
 * skipRevalidate: true を渡すと保存後の revalidatePath 呼び出しを省略する。
 * CSV バッチインポートなど、複数行を連続保存する場合に呼び出し元で
 * 1 回だけ revalidate したいときに使う。通常の単体保存では渡さなくてよい。
 */
export type SaveDailyLogOptions = {
  skipRevalidate?: boolean;
};

export async function saveDailyLog(
  input: SaveDailyLogInput,
  options?: SaveDailyLogOptions
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

  // step_count は Apple Health インポート専用。MealLogger からは渡されないが、
  // 万一渡された場合に不正値で上書きされないようバリデーションを維持する。
  if (input.step_count !== undefined && input.step_count !== null) {
    if (!Number.isInteger(input.step_count) || input.step_count < 0 || input.step_count > 200000) {
      return { ok: false, message: "歩数は 0〜200,000 の整数で入力してください" };
    }
  }

  // 時刻バリデーション: "HH:MM" または "HH:MM:SS" 形式 + 値域チェック
  for (const key of ["last_meal_end_time", "bed_time"] as const) {
    const v = input[key];
    if (v !== undefined && v !== null) {
      const parts = v.split(":");
      if (parts.length < 2 || parts.length > 3) {
        return { ok: false, message: `${key} の形式が正しくありません（HH:MM 形式で入力してください）` };
      }
      const h = parseInt(parts[0] ?? "", 10);
      const m = parseInt(parts[1] ?? "", 10);
      const s = parts.length === 3 ? parseInt(parts[2] ?? "", 10) : 0;
      if (
        isNaN(h) || isNaN(m) || isNaN(s) ||
        h < 0 || h > 23 ||
        m < 0 || m > 59 ||
        s < 0 || s > 59
      ) {
        return { ok: false, message: `${key} の値が不正です（時: 0-23、分: 0-59 の範囲で入力してください）` };
      }
    }
  }

  // Supabase クライアントを早期に生成する。
  // sleep_hours 算出で既存行を読む可能性があるため、RPC より前に用意する。
  const supabase = createClient();

  let payload = buildUpdatePayload(input);
  let hasBasePayload = Object.keys(payload).length > 0;
  let sleepPlan: SleepSavePlan = { targetLogDate: input.log_date, payload: {} };
  let hasSleepPayload = false;

  if (input.bed_time !== undefined) {
    const baseInput: SaveDailyLogInput = { ...input };
    const overnightLogDate = addDaysStr(input.log_date, 1);
    const nextDayTimeFields = overnightLogDate
      ? await fetchExistingTimeFields(supabase, overnightLogDate)
      : null;
    const currentTimeFields = await fetchExistingTimeFields(supabase, input.log_date);

    sleepPlan = deriveSleepSavePlan(baseInput, currentTimeFields, nextDayTimeFields);
    const saveSleepSeparately = sleepPlan.targetLogDate !== input.log_date;

    if (saveSleepSeparately) {
      baseInput.bed_time = undefined;
      baseInput.sleep_hours = undefined;
    } else {
      baseInput.sleep_hours = sleepPlan.payload.sleep_hours;
    }

    payload = buildUpdatePayload(baseInput);
    hasBasePayload = Object.keys(payload).length > 0;
    hasSleepPayload = saveSleepSeparately && Object.keys(sleepPlan.payload).length > 0;
  }

  if (!hasBasePayload && !hasSleepPayload) {
    return { ok: false, message: "保存するデータがありません" };
  }

  if (hasBasePayload) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[saveDailyLog]", input.log_date, "fields:", Object.keys(payload).join(", "));
    }

    const { error: saveError } = await supabase.rpc("save_daily_log_partial", {
      p_log_date: input.log_date,
      p_fields: payload,
    });

    if (saveError) {
      if (saveError.message === "new_log_requires_weight") {
        return { ok: false, message: "新しい日付を作成するには体重の入力が必要です" };
      }
      console.error("[saveDailyLog] rpc error:", saveError.message, "| payload keys:", Object.keys(payload));
      return { ok: false, message: "保存に失敗しました: " + saveError.message };
    }
  }

  if (hasSleepPayload) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[saveDailyLog:sleep]", sleepPlan.targetLogDate, "fields:", Object.keys(sleepPlan.payload).join(", "));
    }

    const { error: saveError } = await supabase.rpc("save_daily_log_partial", {
      p_log_date: sleepPlan.targetLogDate,
      p_fields: sleepPlan.payload,
    });

    if (saveError) {
      if (saveError.message === "new_log_requires_weight") {
        return { ok: false, message: "新しい日付を作成するには体重の入力が必要です" };
      }
      console.error("[saveDailyLog] sleep rpc error:", saveError.message, "| payload keys:", Object.keys(sleepPlan.payload));
      return { ok: false, message: "保存に失敗しました: " + saveError.message };
    }
  }

  // --- On-demand revalidation ---
  // skipRevalidate: true の場合は呼び出し元で一括 revalidate するため省略する
  if (!options?.skipRevalidate) {
    revalidateAfterDailyLogMutation();
  }

  return { ok: true };
}

type ExistingTimeFields = { bed_time: string | null; weigh_in_time: string | null } | null;

type SleepSavePlan = {
  targetLogDate: string;
  payload: DailyLogPayload;
};

function deriveSleepSavePlan(
  input: SaveDailyLogInput,
  currentRow: ExistingTimeFields,
  nextRow: ExistingTimeFields
): SleepSavePlan {
  if (input.bed_time === undefined) {
    return { targetLogDate: input.log_date, payload: {} };
  }

  const bedInPayload = true; // bed_time が undefined でないことを明示

  if (input.bed_time === null) {
    return {
      targetLogDate: input.log_date,
      payload: buildUpdatePayload({ bed_time: null, sleep_hours: null }),
    };
  }

  // ここまで到達した場合、input.bed_time は string（undefined/null は早期 return 済み）
  const bedTime: string = input.bed_time;

  // weigh_in_time は #526 で手動入力廃止。sleep_sessions.wake_at から DB トリガーで自動同期される。
  // ここでは既存行の weigh_in_time (projection 値) を DB から読んで睡眠計算の起床時刻として使う。
  const currentBed   = currentRow?.bed_time    ?? null;
  const currentWeigh = currentRow?.weigh_in_time ?? null;

  const overnightTarget = addDaysStr(input.log_date, 1);
  // nextWeigh は翌日 DB 行の weigh_in_time (sleep_sessions 由来の projection 値)
  const nextWeigh = nextRow?.weigh_in_time ?? null;
  const currentRowAlreadyHasWakeDateOvernightPair = (
    currentRow?.bed_time !== null &&
    currentRow?.bed_time !== undefined &&
    currentRow?.weigh_in_time !== null &&
    currentRow?.weigh_in_time !== undefined &&
    deriveSleepHours(currentRow.bed_time, currentRow.weigh_in_time) !== null &&
    timeIsOnOrBefore(currentRow.weigh_in_time, currentRow.bed_time)
  );
  // 翌日レコードが存在しない場合はシフトしない。
  // 翌日が存在しないままシフトすると save_daily_log_partial が
  // 新規 INSERT を試みて new_log_requires_weight エラーを起こす。
  const shouldShiftToNextDay = (
    nextWeigh !== null &&
    nextRow !== null &&
    deriveSleepHours(bedTime, nextWeigh) !== null &&
    timeIsOnOrBefore(nextWeigh, bedTime) &&
    !currentRowAlreadyHasWakeDateOvernightPair
  );

  const targetLogDate = shouldShiftToNextDay && overnightTarget ? overnightTarget : input.log_date;
  // targetBed は常に user's new value（bedInPayload/null は上の早期 return で保証済み）
  const targetBed   = bedTime;
  const targetWeigh = shouldShiftToNextDay ? nextWeigh : currentWeigh;

  const sleepInput: Omit<SaveDailyLogInput, "log_date"> = {};
  if (bedInPayload) sleepInput.bed_time = bedTime;

  if (targetWeigh !== null) {
    const derived = deriveSleepHours(targetBed, targetWeigh);
    if (derived !== null) sleepInput.sleep_hours = derived;
  }

  return {
    targetLogDate,
    payload: buildUpdatePayload(sleepInput),
  };
}

function timeIsOnOrBefore(lhs: string, rhs: string): boolean {
  return lhs.localeCompare(rhs) <= 0;
}

// ─── 内部ヘルパー ──────────────────────────────────────────────────────────────

/**
 * 既存行の bed_time / weigh_in_time を取得する。
 *
 * 片側のみ更新する場合に、もう片側の現在値を取得して sleep_hours の再算出に使う。
 * 行が存在しない場合は null を返す（新規行作成シナリオでは両値ともペイロードにあるはずなので問題なし）。
 */
async function fetchExistingTimeFields(
  supabase: ReturnType<typeof createClient>,
  logDate: string
): Promise<ExistingTimeFields> {
  const { data } = await supabase
    .from("daily_logs")
    .select("bed_time, weigh_in_time")
    .eq("log_date", logDate)
    .maybeSingle();
  return (data as { bed_time: string | null; weigh_in_time: string | null } | null) ?? null;
}
