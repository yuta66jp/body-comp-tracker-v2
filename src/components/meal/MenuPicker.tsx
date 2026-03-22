"use client";

import { useState, useMemo } from "react";
import { Search, ChevronRight } from "lucide-react";
import { useMenuList } from "@/lib/hooks/useMenuList";
import type { FoodMaster } from "@/lib/supabase/types";
import type { CartItem } from "./Cart";

interface MenuPickerProps {
  foods: FoodMaster[];
  onAddSet: (items: CartItem[]) => void;
}

export function MenuPicker({ foods, onAddSet }: MenuPickerProps) {
  const { data: menus = [], isLoading } = useMenuList();
  const [query, setQuery] = useState("");

  const foodMap = useMemo(
    () => new Map(foods.map((f) => [f.name, f])),
    [foods]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menus;
    return menus.filter((m) => m.name.toLowerCase().includes(q));
  }, [menus, query]);

  function handleAdd(menuName: string) {
    const menu = menus.find((m) => m.name === menuName);
    if (!menu) return;

    const items: CartItem[] = menu.recipe.flatMap((ri) => {
      const food = foodMap.get(ri.name);
      if (!food) return [];
      return [{ food, grams: ri.amount }];
    });

    if (items.length > 0) onAddSet(items);
  }

  function totalKcal(menuName: string) {
    const menu = menus.find((m) => m.name === menuName);
    if (!menu) return 0;
    return menu.recipe.reduce((sum, ri) => {
      const food = foodMap.get(ri.name);
      return sum + (food ? Math.round(((food.calories ?? 0) * ri.amount) / 100) : 0);
    }, 0);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="セットメニューを検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-sm text-gray-400">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">
          {menus.length === 0 ? "セットメニューが未登録です（食品DBから追加できます）" : "該当なし"}
        </p>
      ) : (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-gray-100 bg-white">
          {filtered.map((menu) => {
            const kcal = totalKcal(menu.name);
            return (
              <li
                key={menu.name}
                className="flex items-center justify-between border-b border-gray-50 px-3 py-2 last:border-0 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{menu.name}</p>
                  <p className="text-xs text-gray-400">
                    {menu.recipe.length} 品 &nbsp;|&nbsp; 計 {kcal} kcal
                  </p>
                </div>
                <button
                  onClick={() => handleAdd(menu.name)}
                  className="ml-3 flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
                >
                  まとめて追加
                  <ChevronRight size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
