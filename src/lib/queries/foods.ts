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

/**
 * food_master を全件・名前昇順で取得する。
 *
 * フォールバック: エラー時は空配列を返す。
 */
export async function fetchFoods(): Promise<FoodMaster[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("food_master")
    .select("*")
    .order("name", { ascending: true });
  if (error) {
    console.error("food_master fetch error:", error.message);
    return [];
  }
  return (data as FoodMaster[]) ?? [];
}

/**
 * menu_master を全件・名前昇順で取得し、MenuEntry 形式に変換する。
 *
 * フォールバック: エラー時は空配列を返す。
 */
export async function fetchMenus(): Promise<MenuEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_master")
    .select("name, recipe")
    .order("name", { ascending: true });
  if (error) {
    console.error("menu_master fetch error:", error.message);
    return [];
  }
  return ((data as Array<{ name: string; recipe: unknown }>) ?? []).map((row) => ({
    name: row.name,
    recipe: Array.isArray(row.recipe) ? (row.recipe as RecipeItem[]) : [],
  }));
}
