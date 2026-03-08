"use client";

import { useState, useMemo } from "react";
import { Search, Plus } from "lucide-react";
import { useFoodList } from "@/lib/hooks/useFoodList";
import type { FoodMaster } from "@/lib/supabase/types";

interface FoodPickerProps {
  onAdd: (food: FoodMaster) => void;
}

export function FoodPicker({ onAdd }: FoodPickerProps) {
  const { data: foods = [], isLoading } = useFoodList();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods.slice(0, 20);
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 20);
  }, [foods, query]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="食品を検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-sm text-gray-400">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">該当なし</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-gray-100 bg-white">
          {filtered.map((food) => (
            <li
              key={food.name}
              className="flex items-center justify-between border-b border-gray-50 px-3 py-2 last:border-0 hover:bg-gray-50"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">{food.name}</p>
                <p className="text-xs text-gray-400">
                  {food.calories} kcal / 100g &nbsp;|&nbsp; P {food.protein}g F {food.fat}g C {food.carbs}g
                </p>
              </div>
              <button
                onClick={() => onAdd(food)}
                className="ml-3 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600"
                aria-label={`${food.name}を追加`}
              >
                <Plus size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
