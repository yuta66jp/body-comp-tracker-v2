"use client";

import { useState } from "react";
import { useRecipeList } from "@/lib/hooks/useRecipeList";
import { calcRecipeNutrition } from "@/lib/recipes";
import type { Recipe } from "@/lib/recipes";

export function RecipePicker({ onAdd }: { onAdd: (recipe: Recipe) => void }) {
  const { data: recipes = [], error, isLoading, mutate } = useRecipeList();
  const [query, setQuery] = useState("");
  const activeRecipes = recipes.filter((recipe) => !recipe.is_archived);
  const visible = activeRecipes.filter((recipe) => recipe.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return (
    <div className="space-y-2">
      <input type="search" aria-label="記録する料理を検索" placeholder="料理名で検索..." value={query} onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
      {error ? <p role="alert" className="text-xs text-rose-600">料理を取得できませんでした。<button type="button" onClick={() => void mutate()} className="ml-1 underline">再試行</button></p>
        : isLoading ? <p className="py-4 text-center text-xs text-slate-500">料理を読み込み中...</p>
        : activeRecipes.length === 0 ? <p className="py-4 text-center text-xs text-slate-500">料理が未登録です。食品データベースの「料理」から登録できます。</p>
        : visible.length === 0 ? <p className="py-4 text-center text-xs text-slate-500">該当する料理がありません</p>
        : <ul className="max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-900">
          {visible.map((recipe) => {
            const nutrition = calcRecipeNutrition(recipe.ingredients, 1, true);
            return <li key={recipe.id} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0 dark:border-slate-700">
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-slate-800 dark:text-slate-100">{recipe.name}</p>
                <p className="text-xs text-slate-500">{nutrition.calories} kcal · P {nutrition.protein}g F {nutrition.fat}g C {nutrition.carbs}g / 1食</p></div>
              <button type="button" aria-label={`${recipe.name}を1食追加`} onClick={() => onAdd(recipe)} className="shrink-0 rounded-full bg-emerald-600 px-3 py-2 text-xs font-medium text-white">1食追加</button>
            </li>;
          })}
        </ul>}
    </div>
  );
}
