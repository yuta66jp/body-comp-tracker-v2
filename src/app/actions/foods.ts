"use server";

import { createClient, requireCurrentUser } from "@/lib/supabase/server";
import { AUTH_REQUIRED_MESSAGE, isAuthRequiredError } from "@/lib/auth/actionErrors";
import { revalidateAfterFoodMutation } from "@/lib/cache/revalidate";
import type { Database, Json } from "@/lib/supabase/types";
import type { RecipeItem } from "@/lib/supabase/types";

type FoodMasterInsert = Database["public"]["Tables"]["food_master"]["Insert"];

export type FoodActionResult = { error: string | null; reason?: "auth_required" };

async function getCurrentUserIdForFoodAction(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string; reason: "auth_required" }
> {
  try {
    const user = await requireCurrentUser();
    return { ok: true, userId: user.id };
  } catch (error) {
    if (isAuthRequiredError(error)) {
      return { ok: false, error: AUTH_REQUIRED_MESSAGE, reason: "auth_required" };
    }
    throw error;
  }
}

/** food_master への insert */
export async function insertFood(payload: FoodMasterInsert): Promise<FoodActionResult> {
  const auth = await getCurrentUserIdForFoodAction();
  if (!auth.ok) return { error: auth.error, reason: auth.reason };

  const supabase = await createClient();
  const { error } = await supabase.from("food_master").insert({ ...payload, user_id: auth.userId });
  if (!error) revalidateAfterFoodMutation();
  return { error: error?.message ?? null };
}

/** food_master からの delete（name が PK） */
export async function deleteFood(name: string): Promise<FoodActionResult> {
  const auth = await getCurrentUserIdForFoodAction();
  if (!auth.ok) return { error: auth.error, reason: auth.reason };

  const supabase = await createClient();
  const { error } = await supabase.from("food_master").delete().eq("user_id", auth.userId).eq("name", name);
  if (!error) revalidateAfterFoodMutation();
  return { error: error?.message ?? null };
}

/** menu_master への insert（新規作成） */
export async function insertMenu(payload: {
  name: string;
  recipe: RecipeItem[];
}): Promise<FoodActionResult> {
  const auth = await getCurrentUserIdForFoodAction();
  if (!auth.ok) return { error: auth.error, reason: auth.reason };

  const supabase = await createClient();
  const { error } = await supabase.from("menu_master").insert({
    user_id: auth.userId,
    name: payload.name,
    recipe: payload.recipe as unknown as Json,
  });
  if (!error) revalidateAfterFoodMutation();
  return { error: error?.message ?? null };
}

/** menu_master の update（originalName で対象行を特定） */
export async function updateMenu(
  originalName: string,
  payload: { name: string; recipe: RecipeItem[] }
): Promise<FoodActionResult> {
  const auth = await getCurrentUserIdForFoodAction();
  if (!auth.ok) return { error: auth.error, reason: auth.reason };

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_master")
    .update({ name: payload.name, recipe: payload.recipe as unknown as Json })
    .eq("user_id", auth.userId)
    .eq("name", originalName);
  if (!error) revalidateAfterFoodMutation();
  return { error: error?.message ?? null };
}

/** menu_master からの delete（name が PK） */
export async function deleteMenu(name: string): Promise<FoodActionResult> {
  const auth = await getCurrentUserIdForFoodAction();
  if (!auth.ok) return { error: auth.error, reason: auth.reason };

  const supabase = await createClient();
  const { error } = await supabase.from("menu_master").delete().eq("user_id", auth.userId).eq("name", name);
  if (!error) revalidateAfterFoodMutation();
  return { error: error?.message ?? null };
}
