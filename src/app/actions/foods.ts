"use server";

import { createClient, requireCurrentUser } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import type { RecipeItem } from "@/lib/supabase/types";

type FoodMasterInsert = Database["public"]["Tables"]["food_master"]["Insert"];

export type FoodActionResult = { error: string | null };

/** food_master への insert */
export async function insertFood(payload: FoodMasterInsert): Promise<FoodActionResult> {
  const user = await requireCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase.from("food_master").insert({ ...payload, user_id: user.id });
  return { error: error?.message ?? null };
}

/** food_master からの delete（name が PK） */
export async function deleteFood(name: string): Promise<FoodActionResult> {
  const user = await requireCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase.from("food_master").delete().eq("user_id", user.id).eq("name", name);
  return { error: error?.message ?? null };
}

/** menu_master への insert（新規作成） */
export async function insertMenu(payload: {
  name: string;
  recipe: RecipeItem[];
}): Promise<FoodActionResult> {
  const user = await requireCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase.from("menu_master").insert({
    user_id: user.id,
    name: payload.name,
    recipe: payload.recipe as unknown as Json,
  });
  return { error: error?.message ?? null };
}

/** menu_master の update（originalName で対象行を特定） */
export async function updateMenu(
  originalName: string,
  payload: { name: string; recipe: RecipeItem[] }
): Promise<FoodActionResult> {
  const user = await requireCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_master")
    .update({ name: payload.name, recipe: payload.recipe as unknown as Json })
    .eq("user_id", user.id)
    .eq("name", originalName);
  return { error: error?.message ?? null };
}

/** menu_master からの delete（name が PK） */
export async function deleteMenu(name: string): Promise<FoodActionResult> {
  const user = await requireCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase.from("menu_master").delete().eq("user_id", user.id).eq("name", name);
  return { error: error?.message ?? null };
}
