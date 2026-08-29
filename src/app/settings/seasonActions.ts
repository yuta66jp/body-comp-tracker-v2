"use server";

import { authRequiredMessage } from "@/lib/auth/actionErrors";
import { revalidateAfterSettingsMutation } from "@/lib/cache/revalidate";
import {
  parseSeasonEndInput,
  parseSeasonGoalInput,
  parseSeasonPlanOverridesInput,
  parseSeasonStartInput,
} from "@/lib/schemas/seasonLifecycleSchema";
import type {
  SeasonEndInput,
  SeasonGoalInput,
  SeasonLifecycleValidationError,
  SeasonPlanOverridesInput,
  SeasonStartInput,
} from "@/lib/schemas/seasonLifecycleSchema";
import { createClient, requireCurrentUser } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { addDaysStr, toJstDateStr } from "@/lib/utils/date";
import { buildSeasonMonthlyPlanSnapshot } from "@/lib/utils/seasonMonthlyPlan";

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
  if (message.includes("past_season_plan_override_immutable")) {
    return { ok: false, error: "過去月の手動設定は変更できません。画面を再読み込みしてください。", reason: "conflict" };
  }
  if (
    message.includes("season_plan_overrides_invalid") ||
    message.includes("season_plan_snapshot_invalid")
  ) {
    return { ok: false, error: "月次計画の内容を確認してください。", reason: "validation" };
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

interface SnapshotSeasonRow {
  id: number;
  start_date: string;
  start_weight: number;
  target_date: string;
  target_weight: number | null;
  monthly_plan_start_month: string | null;
  monthly_plan_start_weight: number | null;
  monthly_plan_overrides: Json;
  updated_at: string;
}

function parseOverrides(value: Json): Array<{ month: string; targetWeight: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item === null || Array.isArray(item) || typeof item !== "object") return [];
    return typeof item.month === "string" && typeof item.targetWeight === "number"
      ? [{ month: item.month, targetWeight: item.targetWeight }]
      : [];
  });
}

async function preparePlanSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seasonId: number,
  expectedUpdatedAt: string,
  snapshotDate: string
): Promise<{ ok: true; snapshot: Json } | { ok: false; result: SeasonLifecycleResult }> {
  const { data, error } = await supabase
    .from("seasons")
    .select(
      "id, start_date, start_weight, target_date, target_weight, " +
      "monthly_plan_start_month, monthly_plan_start_weight, monthly_plan_overrides, updated_at"
    )
    .eq("id", seasonId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return { ok: false, result: databaseError(error) };

  const season = data as SnapshotSeasonRow | null;
  if (
    !season ||
    new Date(season.updated_at).getTime() !== new Date(expectedUpdatedAt).getTime()
  ) {
    return {
      ok: false,
      result: databaseError({ message: "active_season_changed" }),
    };
  }
  if (
    season.target_weight === null ||
    season.monthly_plan_start_month === null ||
    season.monthly_plan_start_weight === null
  ) {
    return {
      ok: false,
      result: databaseError({ message: "season_plan_snapshot_invalid" }),
    };
  }

  const { data: logs, error: logsError } = await supabase
    .from("daily_logs")
    .select("log_date, weight")
    .gte("log_date", season.start_date)
    .lte("log_date", snapshotDate)
    .order("log_date", { ascending: true });
  if (logsError) return { ok: false, result: databaseError(logsError) };

  const snapshot = buildSeasonMonthlyPlanSnapshot(
    {
      startDate: season.start_date,
      startWeight: season.start_weight,
      targetDate: season.target_date,
      targetWeight: season.target_weight,
      planStartMonth: season.monthly_plan_start_month,
      planStartWeight: season.monthly_plan_start_weight,
      overrides: parseOverrides(season.monthly_plan_overrides),
    },
    logs ?? [],
    snapshotDate
  );
  if (snapshot.length === 0) {
    return {
      ok: false,
      result: databaseError({ message: "season_plan_snapshot_invalid" }),
    };
  }
  return { ok: true, snapshot: snapshot as unknown as Json };
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
  let previousPlanSnapshot: Json | null = null;
  if (
    parsed.data.expectedActiveSeasonId !== null &&
    parsed.data.expectedActiveSeasonUpdatedAt !== null
  ) {
    const snapshotDate = addDaysStr(parsed.data.startDate, -1);
    if (snapshotDate === null) return validationError([{ field: "startDate", message: "開始日を確認してください" }]);
    const prepared = await preparePlanSnapshot(
      supabase,
      parsed.data.expectedActiveSeasonId,
      parsed.data.expectedActiveSeasonUpdatedAt,
      snapshotDate
    );
    if (!prepared.ok) return prepared.result;
    previousPlanSnapshot = prepared.snapshot;
  }
  const { error } = await supabase.rpc("start_or_switch_season", {
    p_expected_active_season_id: parsed.data.expectedActiveSeasonId,
    p_expected_active_season_updated_at: parsed.data.expectedActiveSeasonUpdatedAt,
    p_name: parsed.data.name,
    p_phase: parsed.data.phase,
    p_start_date: parsed.data.startDate,
    p_target_date: parsed.data.targetDate,
    p_target_weight: parsed.data.targetWeight,
    p_previous_plan_snapshot: previousPlanSnapshot,
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
  const prepared = await preparePlanSnapshot(
    supabase,
    parsed.data.expectedActiveSeasonId,
    parsed.data.expectedActiveSeasonUpdatedAt,
    parsed.data.endDate
  );
  if (!prepared.ok) return prepared.result;
  const { error } = await supabase.rpc("end_active_season", {
    p_expected_active_season_id: parsed.data.expectedActiveSeasonId,
    p_expected_active_season_updated_at: parsed.data.expectedActiveSeasonUpdatedAt,
    p_end_date: parsed.data.endDate,
    p_plan_snapshot: prepared.snapshot,
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
    p_expected_active_season_updated_at: parsed.data.expectedActiveSeasonUpdatedAt,
    p_target_date: parsed.data.targetDate,
    p_target_weight: parsed.data.targetWeight,
  });
  if (error) return databaseError(error);

  revalidateAfterSettingsMutation();
  return { ok: true };
}

export async function saveSeasonPlanOverrides(
  input: SeasonPlanOverridesInput
): Promise<SeasonLifecycleResult> {
  const parsed = parseSeasonPlanOverridesInput(input);
  if (!parsed.ok) return validationError(parsed.errors);

  const authError = await requireAuth();
  if (authError) return authError;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_active_season_plan_overrides", {
    p_expected_active_season_id: parsed.data.expectedActiveSeasonId,
    p_expected_active_season_updated_at: parsed.data.expectedActiveSeasonUpdatedAt,
    p_overrides: parsed.data.overrides as unknown as Json,
    p_reset_all: parsed.data.resetAll,
  });
  if (error) return databaseError(error);

  revalidateAfterSettingsMutation();
  return { ok: true };
}
