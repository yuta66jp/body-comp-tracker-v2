"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import { isValidTrainingType, isValidWorkMode } from "@/lib/utils/trainingType";
import { deriveSleepHours } from "@/lib/utils/sleep";
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
  /** 体重測定時刻 "HH:MM" 形式。null = 明示クリア */
  weigh_in_time?: string | null;
  // ── #436 追加 ──
  /** Apple Health 歩数（日次集計）。null = 明示クリア */
  step_count?: number | null;
  // ── #501 追加 ──
  /**
   * 就寝時刻 "HH:MM" 形式。null = 明示クリア。
   * bed_time + weigh_in_time が両方揃った場合、保存時に sleep_hours を自動算出する。
   * bed_time を null でクリアした場合、sleep_hours も null にリセットする。
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
  for (const key of ["last_meal_end_time", "weigh_in_time", "bed_time"] as const) {
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

  // ── sleep_hours 自動算出 (#501) ────────────────────────────────────────────
  // 計算ロジックは deriveSleepHours (src/lib/utils/sleep.ts) に集約している。
  //
  // 仕様:
  //   A. bed_time (null)                   → sleep_hours も null にリセット (明示クリア連動)
  //   B. bed_time (値) + weigh_in_time (値) → 両方 payload にある場合はそのまま算出
  //   C. 片側のみ payload にある場合        → 既存 DB 値を取得してマージし再算出
  //      - bed_time のみ更新  : DB の weigh_in_time を取得
  //      - weigh_in_time のみ更新: DB の bed_time を取得
  //   D. どちらも payload になし            → sleep_hours を変更しない
  //
  // 片側更新時に stale になるのを防ぐため、DB フェッチによるマージを行う。
  // 算出結果が null (異常値・片側 null 等) の場合は sleep_hours を変更しない。
  {
    const bedInPayload  = input.bed_time      !== undefined;
    const weighInPayload = input.weigh_in_time !== undefined;

    if (bedInPayload && input.bed_time === null) {
      // A: bed_time 明示クリア → sleep_hours も連動クリア
      input.sleep_hours = null;
    } else if (bedInPayload || weighInPayload) {
      // B / C: いずれかが更新される → payload 値を優先し、なければ DB の現在値を使う

      // payload 側の確定値 (undefined は「使わない」側なので null に落とす)
      let finalBed:     string | null = bedInPayload   ? (input.bed_time as string)      : null;
      let finalWeighIn: string | null = weighInPayload ? (input.weigh_in_time as string | null) : null;

      if (bedInPayload !== weighInPayload) {
        // 片側のみ更新 → もう片側を DB から取得してマージ (C)
        const existing = await fetchExistingTimeFields(supabase, input.log_date);
        if (!bedInPayload)   finalBed     = existing?.bed_time      ?? null;
        if (!weighInPayload) finalWeighIn = existing?.weigh_in_time ?? null;
      }

      // 両方 non-null なら算出、どちらかが null なら変更しない
      if (finalBed !== null && finalWeighIn !== null) {
        const derived = deriveSleepHours(finalBed, finalWeighIn);
        if (derived !== null) {
          input.sleep_hours = derived;
        }
        // derived === null (異常値) → sleep_hours を変更しない
      }
    }
    // D: 両方 undefined → 何もしない
  }

  // undefined フィールドを除去したペイロードを構築
  const payload = buildUpdatePayload(input);

  // 保存する値が何もない場合は弾く
  // (全フィールド undefined = プログラムバグまたは空送信)
  if (Object.keys(payload).length === 0) {
    return { ok: false, message: "保存するデータがありません" };
  }

  // 開発時のみ: 実際に保存処理へ進むケースだけログを出す（空 payload の早期 return 後）
  // 生データは含まず、更新対象フィールド名のみ出力する
  if (process.env.NODE_ENV !== "production") {
    console.log("[saveDailyLog]", input.log_date, "fields:", Object.keys(payload).join(", "));
  }

  // --- Supabase: RPC で atomic save ---
  // save_daily_log_partial は「UPDATE 先行 → 既存行なければ INSERT」方式。
  // 既存行への partial update は INSERT 側の NOT NULL 制約に触れない。
  // 新規行作成時に weight がなければ RPC が new_log_requires_weight 例外を返す。
  // payload の JSONB キー存在が undefined/null/値の 3 状態を担保する。

  const { error: saveError } = await supabase.rpc("save_daily_log_partial", {
    p_log_date: input.log_date,
    p_fields:   payload,
  });

  if (saveError) {
    // RPC が new_log_requires_weight を返した場合は分かりやすいメッセージに変換する
    if (saveError.message === "new_log_requires_weight") {
      return { ok: false, message: "新しい日付を作成するには体重の入力が必要です" };
    }
    console.error("[saveDailyLog] rpc error:", saveError.message, "| payload keys:", Object.keys(payload));
    return { ok: false, message: "保存に失敗しました: " + saveError.message };
  }

  // --- On-demand revalidation ---
  // skipRevalidate: true の場合は呼び出し元で一括 revalidate するため省略する
  if (!options?.skipRevalidate) {
    revalidateAfterDailyLogMutation();
  }

  return { ok: true };
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
): Promise<{ bed_time: string | null; weigh_in_time: string | null } | null> {
  const { data } = await supabase
    .from("daily_logs")
    .select("bed_time, weigh_in_time")
    .eq("log_date", logDate)
    .maybeSingle();
  return (data as { bed_time: string | null; weigh_in_time: string | null } | null) ?? null;
}
