"use client";

import { useState, useMemo } from "react";
import { Search, Plus, Check } from "lucide-react";
import { useFoodList } from "@/lib/hooks/useFoodList";
import { MenuPicker } from "./MenuPicker";
import type { FoodMaster } from "@/lib/supabase/types";
import type { CartItem } from "./Cart";

interface FoodPickerProps {
  onAdd: (food: FoodMaster) => void;
  onAddSet: (items: CartItem[]) => void;
}

type Tab = "single" | "set";

export function FoodPicker({ onAdd, onAddSet }: FoodPickerProps) {
  const { data: foods = [], isLoading } = useFoodList();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("single");
  const [category, setCategory] = useState<string>("すべて");
  // 追加済み一時フィードバック: food.name → true の Set（1.2秒後に自動解除）
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());

  const handleAdd = (food: FoodMaster) => {
    onAdd(food);
    setRecentlyAdded((prev) => new Set([...prev, food.name]));
    setTimeout(() => {
      setRecentlyAdded((prev) => {
        const next = new Set(prev);
        next.delete(food.name);
        return next;
      });
    }, 1200);
  };

  // food_master に登録されているカテゴリを動的に取得
  const categories = useMemo(() => {
    const cats = Array.from(
      new Set(foods.map((f) => f.category).filter((c): c is string => !!c))
    ).sort();
    return ["すべて", ...cats];
  }, [foods]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = foods;

    if (category !== "すべて") {
      result = result.filter((f) => f.category === category);
    }
    if (q) {
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }
    return result.slice(0, 30);
  }, [foods, query, category]);

  return (
    <div className="flex flex-col gap-2">
      {/* 単品 / セット タブ */}
      <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {(["single", "set"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setQuery(""); setCategory("すべて"); }}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t === "single" ? "単品" : "[SET] セット"}
          </button>
        ))}
      </div>

      {tab === "set" ? (
        <MenuPicker foods={foods} onAddSet={onAddSet} />
      ) : (
        <>
          {/* 検索ボックス */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="食品名で検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400"
            />
          </div>

          {/* カテゴリフィルター */}
          {categories.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    category === cat
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* 食品リスト */}
          {isLoading ? (
            <p className="py-4 text-center text-sm text-slate-400">読み込み中...</p>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">該当なし</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-white">
              {filtered.map((food) => (
                <li
                  key={food.name}
                  className="flex items-center justify-between border-b border-slate-50 px-3 py-2 last:border-0 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{food.name}</p>
                    <p className="text-xs text-slate-400">
                      {food.calories} kcal&nbsp;·&nbsp;P {food.protein}g F {food.fat}g C {food.carbs}g
                    </p>
                  </div>
                  <button
                    onClick={() => handleAdd(food)}
                    className={`ml-3 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white transition-colors ${
                      recentlyAdded.has(food.name)
                        ? "bg-green-500"
                        : "bg-blue-500 hover:bg-blue-600"
                    }`}
                    aria-label={recentlyAdded.has(food.name) ? `${food.name}を追加済み` : `${food.name}を追加`}
                  >
                    {recentlyAdded.has(food.name) ? <Check size={14} /> : <Plus size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
