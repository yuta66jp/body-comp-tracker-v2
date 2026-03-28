import { FoodTable } from "@/components/foods/FoodTable";
import { MenuTable } from "@/components/foods/MenuTable";
import { fetchFoods, fetchMenus } from "@/lib/queries/foods";
import { PageShell } from "@/components/ui/PageShell";
import { StatusNotice } from "@/components/ui/StatusNotice";

export const revalidate = 0;

export default async function FoodsPage() {
  const [foodsResult, menusResult] = await Promise.all([fetchFoods(), fetchMenus()]);

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
        <MenuTable initialMenus={menusResult.data} foods={foodsResult.data} />
      </div>
    </PageShell>
  );
}
