/**
 * settings テーブルの read 責務を集約する。
 *
 * - fetchSettings()     : 全キーを AppSettings ドメイン型に変換して返す（page 用）
 * - fetchSettingsRows() : settings テーブルの行配列を返す（SettingsForm などフォーム用）
 * - fetchMacroTargets() : マクロ目標値キーだけをピンポイント取得する（MacroPage 用）
 *
 * write 系（upsert / insert / update）はここに含めない。
 * UI 固有の表示文言はここに含めない。
 */
import { createClient } from "@/lib/supabase/server";
import type { Setting } from "@/lib/supabase/types";
import type { MacroTargets } from "@/lib/utils/calcMacro";
import { mapToAppSettings } from "@/lib/domain/settings";
import type { AppSettings } from "@/lib/domain/settings";
import type { QueryResult } from "./queryResult";

/**
 * settings テーブルを全件取得し、AppSettings ドメイン型に変換して返す。
 *
 * - DB row[] → AppSettings の変換は mapToAppSettings (lib/domain/settings.ts) に委譲する。
 * 戻り値:
 *   kind: "ok"    — 取得成功。data の全フィールド null = 設定未入力（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 */
export async function fetchSettings(): Promise<QueryResult<AppSettings>> {
  const supabase = createClient();
  const { data, error } = await supabase.from("settings").select("key, value_num, value_str");
  if (error) {
    console.error("[fetchSettings] settings fetch error:", error.message, { code: error.code });
    return { kind: "error", message: error.message };
  }
  const rows = (data as Setting[] | null) ?? [];
  return { kind: "ok", data: mapToAppSettings(rows) };
}

/**
 * settings テーブルを全件取得し、行配列をそのまま返す。
 * SettingsForm など、個別の key / value_num / value_str にアクセスする場面で使う。
 *
 * フォールバック: エラー時は空配列を返す。
 */
export async function fetchSettingsRows(): Promise<Setting[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("settings").select("*");
  if (error) {
    console.error("settings fetch error:", error.message);
    return [];
  }
  return (data as Setting[]) ?? [];
}

/**
 * マクロ目標キーをピンポイントで取得し、MacroTargets と calTarget を返す。
 *
 * 取得キー: target_calories_kcal / target_protein_g / target_fat_g / target_carbs_g / goal_calories
 * フォールバック: エラー時は全 null を返す。
 */
export async function fetchMacroTargets(): Promise<MacroTargets & { calTarget: number | null }> {
  const supabase = createClient();
  const keys = ["target_calories_kcal", "target_protein_g", "target_fat_g", "target_carbs_g", "goal_calories"];
  const { data } = await supabase
    .from("settings")
    .select("key, value_num")
    .in("key", keys);
  const map: Record<string, number | null> = {};
  for (const row of (data as { key: string; value_num: number | null }[]) ?? []) {
    map[row.key] = row.value_num;
  }
  return {
    calories: map["target_calories_kcal"] ?? null,
    protein:  map["target_protein_g"]     ?? null,
    fat:      map["target_fat_g"]         ?? null,
    carbs:    map["target_carbs_g"]       ?? null,
    // 後方互換: MacroDailyTable 用 (旧 goal_calories → target_calories_kcal にフォールバック)
    calTarget: map["target_calories_kcal"] ?? map["goal_calories"] ?? null,
  };
}
