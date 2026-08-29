"use server";

import { authRequiredMessage } from "@/lib/auth/actionErrors";
import { revalidateAfterCompletedSeasonMutation } from "@/lib/cache/revalidate";
import {
  parseCompletedSeasonEditInput,
  type CompletedSeasonEditInput,
  type SeasonLifecycleValidationError,
} from "@/lib/schemas/seasonLifecycleSchema";
import { createClient, requireCurrentUser } from "@/lib/supabase/server";
import { toJstDateStr } from "@/lib/utils/date";

export type CompletedSeasonEditResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      reason?: "auth_required" | "validation" | "conflict";
      fieldErrors?: SeasonLifecycleValidationError[];
    };

function databaseError(error: { code?: string; message: string }): CompletedSeasonEditResult {
  const message = error.message;
  if (message.includes("completed_season_changed") || message.includes("completed_season_not_found")) {
    return {
      ok: false,
      error: "別の画面でシーズンが更新されました。再読み込みして確認してください。",
      reason: "conflict",
    };
  }
  if (message.includes("completed_season_end_date_invalid")) {
    return {
      ok: false,
      error: "終了日はシーズン開始日から今日までの範囲で入力してください。",
      reason: "validation",
    };
  }
  if (message.includes("completed_season_period_overlap") || error.code === "23P01") {
    return {
      ok: false,
      error: "終了日は次のシーズン開始日の前日以前にしてください。",
      reason: "validation",
    };
  }
  if (message.includes("completed_season_career_log_out_of_range")) {
    return {
      ok: false,
      error: "移行済みキャリア履歴が期間外になるため、この終了日には変更できません。",
      reason: "validation",
    };
  }
  if (message.includes("season_name_invalid") || message.includes("season_phase_invalid")) {
    return { ok: false, error: "入力内容を確認してください。", reason: "validation" };
  }
  if (error.code === "23505") {
    return {
      ok: false,
      error: "同じ名称・開始日のシーズンがすでにあります。",
      reason: "conflict",
    };
  }
  console.error("completed season update RPC error:", message, { code: error.code });
  return { ok: false, error: "保存に失敗しました。しばらく後に再試行してください。" };
}

export async function updateCompletedSeason(
  input: CompletedSeasonEditInput
): Promise<CompletedSeasonEditResult> {
  const parsed = parseCompletedSeasonEditInput(input, toJstDateStr());
  if (!parsed.ok) {
    return {
      ok: false,
      error: "入力内容を確認してください。",
      reason: "validation",
      fieldErrors: parsed.errors,
    };
  }

  try {
    await requireCurrentUser();
  } catch (error) {
    const message = authRequiredMessage(error);
    if (message) return { ok: false, error: message, reason: "auth_required" };
    throw error;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_completed_season", {
    p_expected_completed_season_id: parsed.data.expectedCompletedSeasonId,
    p_expected_completed_season_updated_at: parsed.data.expectedCompletedSeasonUpdatedAt,
    p_name: parsed.data.name,
    p_phase: parsed.data.phase,
    p_end_date: parsed.data.endDate,
  });
  if (error) return databaseError(error);

  revalidateAfterCompletedSeasonMutation();
  return { ok: true };
}
