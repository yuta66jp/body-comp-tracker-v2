"use server";

import { authRequiredMessage } from "@/lib/auth/actionErrors";
import { revalidateAfterSettingsMutation } from "@/lib/cache/revalidate";
import {
  parseSeasonEndInput,
  parseSeasonGoalInput,
  parseSeasonStartInput,
} from "@/lib/schemas/seasonLifecycleSchema";
import type {
  SeasonEndInput,
  SeasonGoalInput,
  SeasonLifecycleValidationError,
  SeasonStartInput,
} from "@/lib/schemas/seasonLifecycleSchema";
import { createClient, requireCurrentUser } from "@/lib/supabase/server";
import { toJstDateStr } from "@/lib/utils/date";

export type SeasonLifecycleResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      reason?: "auth_required" | "validation" | "conflict";
      fieldErrors?: SeasonLifecycleValidationError[];
    };

function validationError(errors: SeasonLifecycleValidationError[]): SeasonLifecycleResult {
  return {
    ok: false,
    error: "入力内容を確認してください。",
    reason: "validation",
    fieldErrors: errors,
  };
}

function databaseError(error: { code?: string; message: string }): SeasonLifecycleResult {
  const message = error.message;
  if (message.includes("season_start_weight_missing")) {
    return { ok: false, error: "開始日時点の体重記録がありません。先に体重を記録してください。" };
  }
  if (message.includes("active_season_not_found")) {
    return { ok: false, error: "進行中のシーズンが見つかりません。画面を再読み込みしてください。", reason: "conflict" };
  }
  if (message.includes("active_season_changed")) {
    return { ok: false, error: "別の画面でシーズンが更新されました。再読み込みして確認してください。", reason: "conflict" };
  }
  if (message.includes("season_switch_date_invalid")) {
    return { ok: false, error: "新しい開始日は現在のシーズン開始日より後にしてください。", reason: "validation" };
  }
  if (message.includes("season_end_date_invalid")) {
    return { ok: false, error: "終了日はシーズン開始日から今日までの範囲で入力してください。", reason: "validation" };
  }
  if (message.includes("season_target_date_invalid")) {
    return { ok: false, error: "目標日はシーズン開始日以降にしてください。", reason: "validation" };
  }
  if (
    error.code === "23505" ||
    error.code === "23P01" ||
    message.includes("season_settings_owner_conflict")
  ) {
    return {
      ok: false,
      error: "別の操作と競合しました。画面を再読み込みして状態を確認してください。",
      reason: "conflict",
    };
  }
  console.error("season lifecycle RPC error:", message, { code: error.code });
  return { ok: false, error: "保存に失敗しました。しばらく後に再試行してください。" };
}

async function requireAuth(): Promise<SeasonLifecycleResult | null> {
  try {
    await requireCurrentUser();
    return null;
  } catch (error) {
    const message = authRequiredMessage(error);
    if (message) return { ok: false, error: message, reason: "auth_required" };
    throw error;
  }
}

export async function startOrSwitchSeason(
  input: SeasonStartInput
): Promise<SeasonLifecycleResult> {
  const parsed = parseSeasonStartInput(input, toJstDateStr());
  if (!parsed.ok) return validationError(parsed.errors);

  const authError = await requireAuth();
  if (authError) return authError;

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_or_switch_season", {
    p_expected_active_season_id: parsed.data.expectedActiveSeasonId,
    p_name: parsed.data.name,
    p_phase: parsed.data.phase,
    p_start_date: parsed.data.startDate,
    p_target_date: parsed.data.targetDate,
    p_target_weight: parsed.data.targetWeight,
  });
  if (error) return databaseError(error);

  revalidateAfterSettingsMutation();
  return { ok: true };
}

export async function endSeason(input: SeasonEndInput): Promise<SeasonLifecycleResult> {
  const parsed = parseSeasonEndInput(input, toJstDateStr());
  if (!parsed.ok) return validationError(parsed.errors);

  const authError = await requireAuth();
  if (authError) return authError;

  const supabase = await createClient();
  const { error } = await supabase.rpc("end_active_season", {
    p_expected_active_season_id: parsed.data.expectedActiveSeasonId,
    p_end_date: parsed.data.endDate,
  });
  if (error) return databaseError(error);

  revalidateAfterSettingsMutation();
  return { ok: true };
}

export async function updateSeasonGoal(
  input: SeasonGoalInput
): Promise<SeasonLifecycleResult> {
  const parsed = parseSeasonGoalInput(input);
  if (!parsed.ok) return validationError(parsed.errors);

  const authError = await requireAuth();
  if (authError) return authError;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_active_season_goal", {
    p_expected_active_season_id: parsed.data.expectedActiveSeasonId,
    p_target_date: parsed.data.targetDate,
    p_target_weight: parsed.data.targetWeight,
  });
  if (error) return databaseError(error);

  revalidateAfterSettingsMutation();
  return { ok: true };
}
