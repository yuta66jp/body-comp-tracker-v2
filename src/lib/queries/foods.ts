/**
 * food_master / menu_master テーブルの read 責務を集約する。
 *
 * - fetchFoods() : food_master 全件取得
 * - fetchMenus() : menu_master 全件取得
 *
 * write 系（upsert / insert / update / delete）はここに含めない。
 * UI 固有の表示文言はここに含めない。
 */
import { createClient } from "@/lib/supabase/server";
import type { FoodMaster, RecipeItem } from "@/lib/supabase/types";
import type { MenuEntry } from "@/lib/hooks/useMenuList";
import type { QueryResult } from "./queryResult";

/**
 * food_master を全件・名前昇順で取得する。
 *
 * 戻り値:
 *   kind: "ok"    — 取得成功。data が空配列 = 食品未登録（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 *
 * foods/page.tsx の主データ。エラー時に空配列を返すと
 * 「食品が登録されていません」と誤表示されるため QueryResult を使用する。
 */
export async function fetchFoods(): Promise<QueryResult<FoodMaster[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("food_master")
    .select("*")
    .order("name", { ascending: true });
  if (error) {
    console.error("[fetchFoods] food_master fetch error:", error.message);
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", data: (data as FoodMaster[]) ?? [] };
}

/**
 * menu_master を全件・名前昇順で取得し、MenuEntry 形式に変換する。
 *
 * 戻り値:
 *   kind: "ok"    — 取得成功。data が空配列 = メニュー未登録（正常な空状態）。
 *   kind: "error" — DB フェッチ失敗。呼び出し側で error banner を表示すること。
 *
 * foods/page.tsx の主データ。fetchFoods と同一ページで使うため同水準のエラー処理を持つ。
 */
export async function fetchMenus(): Promise<QueryResult<MenuEntry[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_master")
    .select("name, recipe")
    .order("name", { ascending: true });
  if (error) {
    console.error("[fetchMenus] menu_master fetch error:", error.message);
    return { kind: "error", message: error.message };
  }
  return {
    kind: "ok",
    data: ((data as Array<{ name: string; recipe: unknown }>) ?? []).map((row) => ({
      name: row.name,
      recipe: Array.isArray(row.recipe) ? (row.recipe as RecipeItem[]) : [],
    })),
  };
}
