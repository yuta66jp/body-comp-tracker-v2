import { FoodTable } from "@/components/foods/FoodTable";
import { MenuTable } from "@/components/foods/MenuTable";
import { RecipeTable } from "@/components/foods/RecipeTable";
import { fetchRecipes } from "@/lib/queries/recipes";
import { fetchFoods, fetchMenus } from "@/lib/queries/foods";
import { PageShell } from "@/components/ui/PageShell";
import { StatusNotice } from "@/components/ui/StatusNotice";

export const revalidate = 0;

export default async function FoodsPage() {
  const [foodsResult, menusResult, recipesResult] = await Promise.all([fetchFoods(), fetchMenus(), fetchRecipes()]);

  if (foodsResult.kind === "error" || menusResult.kind === "error") {
    return (
      <PageShell title="食品データベース">
        <StatusNotice status="error">
          食品データベースの取得に失敗しました。しばらく経ってから再度お試しください。
        </StatusNotice>
      </PageShell>
    );
  }

  return (
    <PageShell title="食品データベース">
      <div className="space-y-8">
        <FoodTable initialFoods={foodsResult.data} />
        {recipesResult.kind === "ok" ? <RecipeTable initialRecipes={recipesResult.data} foods={foodsResult.data} /> : (
          <section id="recipes"><h2 className="mb-2 text-sm font-semibold">料理</h2><StatusNotice status="error">{recipesResult.message}</StatusNotice></section>
        )}
        <MenuTable initialMenus={menusResult.data} foods={foodsResult.data} />
      </div>
    </PageShell>
  );
}
