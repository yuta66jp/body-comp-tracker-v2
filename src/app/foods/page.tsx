import { createClient } from "@/lib/supabase/server";
import { FoodTable } from "@/components/foods/FoodTable";
import { MenuTable } from "@/components/foods/MenuTable";
import type { FoodMaster, RecipeItem } from "@/lib/supabase/types";
import type { MenuEntry } from "@/lib/hooks/useMenuList";

export const revalidate = 0;

async function fetchFoods(): Promise<FoodMaster[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("food_master")
    .select("*")
    .order("name", { ascending: true });
  if (error) { console.error(error.message); return []; }
  return (data as FoodMaster[]) ?? [];
}

async function fetchMenus(): Promise<MenuEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_master")
    .select("name, recipe")
    .order("name", { ascending: true });
  if (error) { console.error(error.message); return []; }
  return ((data as Array<{ name: string; recipe: unknown }>) ?? []).map((row) => ({
    name: row.name,
    recipe: Array.isArray(row.recipe) ? (row.recipe as RecipeItem[]) : [],
  }));
}

export default async function FoodsPage() {
  const [foods, menus] = await Promise.all([fetchFoods(), fetchMenus()]);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">食品データベース</h1>
      <div className="space-y-8">
        <FoodTable initialFoods={foods} />
        <MenuTable initialMenus={menus} foods={foods} />
      </div>
    </main>
  );
}
