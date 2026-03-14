import { FoodTable } from "@/components/foods/FoodTable";
import { MenuTable } from "@/components/foods/MenuTable";
import { fetchFoods, fetchMenus } from "@/lib/queries/foods";

export const revalidate = 0;

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
