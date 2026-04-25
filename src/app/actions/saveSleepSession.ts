"use server";

/**
 * saveSleepSession / deleteSleepSession — sleep_sessions 保存 Server Action (#515)
 *
 * sleep_sessions テーブルが睡眠の source of truth。
 * upsert は wake_date の UNIQUE 制約を利用して主睡眠 1件を保証する。
 *
 * 保存後の daily_logs.sleep_hours は DB トリガー (trg_sync_sleep_hours) が
 * 自動で更新するため、この action から直接 daily_logs を触らない。
 *
 * ## 入力形式
 *   wake_date : YYYY-MM-DD  — 起床日 (daily_logs.log_date に対応)
 *   bed_time  : HH:MM       — 就寝時刻
 *   wake_time : HH:MM       — 起床時刻
 *   note      : string|null — 任意メモ
 *
 * ## 内部処理
 *   1. バリデーション
 *   2. buildSleepSessionDatetimes() で bed_at / wake_at (TIMESTAMPTZ) を組み立て
 *   3. sleep_sessions に upsert (conflict: wake_date)
 *   4. キャッシュ再検証 (revalidateAfterDailyLogMutation)
 *      → daily_logs.sleep_hours が更新されるためダッシュボード等も再取得が必要
 */

import { createClient, requireCurrentUser } from "@/lib/supabase/server";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import { parseLocalDateStr } from "@/lib/utils/date";
import { buildSleepSessionDatetimes } from "@/lib/utils/sleepSession";

export type SaveSleepSessionInput = {
  /** 起床日 (YYYY-MM-DD)。daily_logs.log_date と同値。 */
  wake_date: string;
  /** 就寝時刻 HH:MM。bedTimeHHMM > wakeTimeHHMM の場合は前日夜就寝として扱う。 */
  bed_time: string;
  /** 起床時刻 HH:MM。 */
  wake_time: string;
  /** 任意メモ。null = 明示クリア。 */
  note?: string | null;
};

export type SaveSleepSessionResult =
  | { ok: true }
  | { ok: false; message: string };

export type SaveSleepSessionOptions = {
  /**
   * true を渡すと保存後の revalidatePath 呼び出しを省略する。
   * CSV バッチインポートなど、複数行を連続保存して最後にまとめて revalidate したい場合に使う。
   * 通常の単体保存では渡さなくてよい。
   */
  skipRevalidate?: boolean;
};

/**
 * 睡眠セッションを保存 (upsert) する。
 * wake_date が既存なら上書き、なければ新規作成。
 *
 * ## エラーハンドリング方針
 * Server Action として呼ばれるため、Supabase の fetch 失敗など
 * 想定外の例外が発生した場合に throw が外部へ伝播すると
 * 呼び出し元 (MealLogger) の generic catch に落ちる。
 * 関数全体を try/catch で囲み、想定内外のすべての失敗を
 * `{ ok: false }` に正規化して返す (#544)。
 */
export async function saveSleepSession(
  input: SaveSleepSessionInput,
  options?: SaveSleepSessionOptions
): Promise<SaveSleepSessionResult> {
  try {
    // ── バリデーション ──
    if (parseLocalDateStr(input.wake_date) === null) {
      return { ok: false, message: "wake_date の形式が正しくありません (YYYY-MM-DD)" };
    }

    const timePattern = /^\d{2}:\d{2}$/;
    if (!timePattern.test(input.bed_time)) {
      return { ok: false, message: "bed_time の形式が正しくありません (HH:MM)" };
    }
    if (!timePattern.test(input.wake_time)) {
      return { ok: false, message: "wake_time の形式が正しくありません (HH:MM)" };
    }

    // HH:MM 値域チェック
    for (const [label, value] of [["bed_time", input.bed_time], ["wake_time", input.wake_time]] as const) {
      const [hStr, mStr] = value.split(":");
      const h = parseInt(hStr ?? "", 10);
      const m = parseInt(mStr ?? "", 10);
      if (h < 0 || h > 23 || m < 0 || m > 59) {
        return { ok: false, message: `${label} の値が不正です (時: 0-23、分: 0-59)` };
      }
    }

    if (input.note !== undefined && input.note !== null && input.note.length > 500) {
      return { ok: false, message: "メモは 500 文字以内で入力してください" };
    }

    // ── TIMESTAMPTZ 組み立て ──
    const datetimes = buildSleepSessionDatetimes(
      input.wake_date,
      input.bed_time,
      input.wake_time
    );
    if (datetimes === null) {
      return { ok: false, message: "就寝・起床時刻の変換に失敗しました" };
    }

    // ── upsert ──
    const user = await requireCurrentUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("sleep_sessions")
      .upsert(
        {
          user_id:   user.id,
          wake_date: input.wake_date,
          bed_at:    datetimes.bedAt,
          wake_at:   datetimes.wakeAt,
          source:    "manual",
          note:      input.note ?? null,
        },
        { onConflict: "wake_date" }
      );

    if (error) {
      console.error("[saveSleepSession] upsert error:", error.message);
      return { ok: false, message: "保存に失敗しました: " + error.message };
    }

    // DB トリガーが daily_logs.sleep_hours を自動更新するため
    // ダッシュボード等が依存するキャッシュを再検証する
    // skipRevalidate: true の場合は呼び出し元で一括 revalidate するため省略する
    if (!options?.skipRevalidate) {
      revalidateAfterDailyLogMutation();
    }

    return { ok: true };
  } catch (e) {
    // Supabase の fetch 失敗など、想定外の例外が発生した場合のフォールバック。
    // throw をそのまま外部に伝播させると MealLogger の generic catch に落ちて
    // 「予期しないエラーが発生しました」が表示されるため、ここで { ok: false } に正規化する (#544)。
    console.error("[saveSleepSession] unexpected error:", e);
    return { ok: false, message: "睡眠記録の保存に失敗しました" };
  }
}

/**
 * 指定した wake_date の睡眠セッションを削除する。
 * 削除後に DB トリガーが daily_logs.sleep_hours を NULL に戻す。
 */
export async function deleteSleepSession(
  wakeDate: string
): Promise<SaveSleepSessionResult> {
  if (parseLocalDateStr(wakeDate) === null) {
    return { ok: false, message: "wake_date の形式が正しくありません (YYYY-MM-DD)" };
  }

  const user = await requireCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("sleep_sessions")
    .delete()
    .eq("user_id", user.id)
    .eq("wake_date", wakeDate);

  if (error) {
    console.error("[deleteSleepSession] delete error:", error.message);
    return { ok: false, message: "削除に失敗しました: " + error.message };
  }

  revalidateAfterDailyLogMutation();

  return { ok: true };
}
