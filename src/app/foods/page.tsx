import { createClient } from "@/lib/supabase/server";
import { FoodTable } from "@/components/foods/FoodTable";
import type { FoodMaster } from "@/lib/supabase/types";

export const revalidate = 0; // 毎回最新を取得

async function fetchFoods(): Promise<FoodMaster[]> {
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

export default async function FoodsPage() {
  const foods = await fetchFoods();

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">食品データベース</h1>
      <FoodTable initialFoods={foods} />
    </main>
  );
}
