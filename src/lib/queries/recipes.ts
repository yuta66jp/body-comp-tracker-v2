import { createClient } from "@/lib/supabase/server";
import { parseRecipe } from "@/lib/recipes";
import type { Recipe } from "@/lib/recipes";
import type { QueryResult } from "./queryResult";

export async function fetchRecipes(): Promise<QueryResult<Recipe[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("recipe_master").select("*").order("name", { ascending: true });
    if (error) throw error;
    return { kind: "ok", data: (data ?? []).map(parseRecipe) };
  } catch (error) {
    console.error("[fetchRecipes] fetch error:", error);
    return { kind: "error", message: "料理を取得できませんでした。再読み込みしてください。" };
  }
}
