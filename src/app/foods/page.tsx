import { FoodTable } from "@/components/foods/FoodTable";
import { MenuTable } from "@/components/foods/MenuTable";
import { fetchFoods, fetchMenus } from "@/lib/queries/foods";

export const revalidate = 0;

export default async function FoodsPage() {
  const [foodsResult, menusResult] = await Promise.all([fetchFoods(), fetchMenus()]);

  if (foodsResult.kind === "error" || menusResult.kind === "error") {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <h1 className="mb-6 text-xl font-bold text-gray-800">食品データベース</h1>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          食品データベースの取得に失敗しました。しばらく経ってから再度お試しください。
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">食品データベース</h1>
      <div className="space-y-8">
        <FoodTable initialFoods={foodsResult.data} />
        <MenuTable initialMenus={menusResult.data} foods={foodsResult.data} />
      </div>
    </main>
  );
}
