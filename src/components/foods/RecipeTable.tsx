"use client";

import { useState, useTransition } from "react";
import { saveRecipe, setRecipeArchived } from "@/app/actions/recipes";
import { useRecipeList } from "@/lib/hooks/useRecipeList";
import { calcRecipeNutrition, ingredientFromFood, NUTRIENT_KEYS, positiveRecipeAmount } from "@/lib/recipes";
import type { Recipe, RecipeIngredient } from "@/lib/recipes";
import type { FoodMaster } from "@/lib/supabase/types";

const inputClass = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const buttonClass = "rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700";

function RecipeNutritionLabel({ ingredients }: { ingredients: RecipeIngredient[] }) {
  const nutrition = calcRecipeNutrition(ingredients, 1, true);
  return <span>{nutrition.calories} kcal · P {nutrition.protein}g F {nutrition.fat}g C {nutrition.carbs}g / 1食</span>;
}

function RecipeForm({ foods, recipe, copy, onSaved, onCancel }: {
  foods: FoodMaster[];
  recipe?: Recipe;
  copy: boolean;
  onSaved: (recipe: Recipe) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(recipe ? `${recipe.name}${copy ? "（コピー）" : ""}` : "");
  const [note, setNote] = useState(recipe?.note ?? "");
  const [items, setItems] = useState(() => (recipe?.ingredients ?? []).map((item) => ({ ingredient: item, grams: String(item.grams) })));
  const [foodName, setFoodName] = useState("");
  const [amount, setAmount] = useState("100");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const validIngredients = items.every((item) => positiveRecipeAmount(item.grams) !== null)
    ? items.map((item) => ({ ...item.ingredient, grams: Number(item.grams) })) : null;
  const preview = validIngredients && NUTRIENT_KEYS.every((key) => Number.isFinite(calcRecipeNutrition(validIngredients)[key])) ? validIngredients : null;

  function addMaterial() {
    const grams = positiveRecipeAmount(amount);
    const food = foods.find((item) => item.name === foodName);
    if (!food) return setErrors((prev) => ({ ...prev, add: "材料を選択してください" }));
    if (grams === null) return setErrors((prev) => ({ ...prev, add: "使用量は0より大きい数値で入力してください" }));
    const ingredient = ingredientFromFood(food, grams);
    if (!ingredient) return setErrors((prev) => ({ ...prev, add: "食品のカロリー・PFCが未設定です。食品情報を確認してください" }));
    const existing = items.find((item) => item.ingredient.name === foodName);
    const existingGrams = existing ? positiveRecipeAmount(existing.grams) : 0;
    if (existingGrams === null || !Number.isFinite(existingGrams + grams)) return setErrors((prev) => ({ ...prev, add: "既存材料の使用量を確認してください" }));
    setItems((prev) => existing
      ? prev.map((item) => item.ingredient.name === foodName ? { ingredient, grams: String(existingGrams + grams) } : item)
      : [...prev, { ingredient, grams: String(grams) }]);
    setErrors({});
    setSaveError(null);
    setFoodName("");
    setAmount("100");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "料理名は必須です";
    if (items.length === 0) nextErrors.ingredients = "材料を1品以上追加してください";
    items.forEach((item, index) => {
      if (positiveRecipeAmount(item.grams) === null) nextErrors[`grams-${index}`] = "使用量は0より大きい数値で入力してください";
    });
    if (validIngredients && !preview) nextErrors.ingredients = "使用量が大きすぎます";
    setErrors(nextErrors);
    setSaveError(null);
    if (Object.keys(nextErrors).length || !preview) return;
    startTransition(async () => {
      try {
        const result = await saveRecipe({
          ...(recipe ? { [copy ? "sourceId" : "id"]: recipe.id, updatedAt: recipe.updated_at } : {}),
          name, note, ingredients: preview,
        });
        if (!result.ok) return setSaveError(result.error);
        onSaved(result.data);
      } catch {
        setSaveError("料理を保存できませんでした。入力内容を確認して再試行してください。");
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
      <fieldset disabled={pending} className="space-y-4">
        <legend className="mb-3 text-sm font-semibold">{recipe && !copy ? "料理を編集" : "料理を新規登録"}</legend>
        <p className="text-xs text-slate-500 dark:text-slate-400">材料は1食分（1人前）の量を入力してください。</p>
        <div>
          <label htmlFor="recipe-name" className="mb-1 block text-sm">料理名</label>
          <input id="recipe-name" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} aria-invalid={!!errors.name} aria-describedby={errors.name ? "recipe-name-error" : undefined} />
          {errors.name && <p id="recipe-name-error" role="alert" className="text-xs text-rose-600">{errors.name}</p>}
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
            <label className="min-w-0 text-xs">追加する材料
              <select value={foodName} onChange={(event) => setFoodName(event.target.value)} className={inputClass}>
                <option value="">食品を選択...</option>
                {foods.map((food) => <option key={food.name} value={food.name}>{food.name}</option>)}
              </select>
            </label>
            <label className="text-xs">使用量 (g)
              <input type="number" inputMode="decimal" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} />
            </label>
            <button type="button" onClick={addMaterial} className={buttonClass}>材料を追加</button>
          </div>
          {errors.add && <p role="alert" className="text-xs text-rose-600">{errors.add}</p>}
          {errors.ingredients && <p role="alert" className="text-xs text-rose-600">{errors.ingredients}</p>}
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={item.ingredient.name} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words text-sm">{item.ingredient.name}</span>
                  <label className="flex items-center gap-1 text-xs">
                    <span className="sr-only">{item.ingredient.name}の使用量</span>
                    <input type="number" inputMode="decimal" step="any" value={item.grams} aria-label={`${item.ingredient.name}の使用量`} aria-invalid={!!errors[`grams-${index}`]}
                      onChange={(event) => setItems((prev) => prev.map((row, i) => i === index ? { ...row, grams: event.target.value } : row))}
                      className={`${inputClass} !w-24`} />g
                  </label>
                  <button type="button" aria-label={`${item.ingredient.name}を材料から外す`} onClick={() => { setItems((prev) => prev.filter((_, i) => i !== index)); setErrors({}); }} className={buttonClass}>外す</button>
                </div>
                {errors[`grams-${index}`] && <p role="alert" className="mt-1 text-xs text-rose-600">{errors[`grams-${index}`]}</p>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <label htmlFor="recipe-note" className="mb-1 block text-sm">メモ（任意）</label>
          <textarea id="recipe-note" value={note} onChange={(event) => setNote(event.target.value)} className={inputClass} rows={2} />
        </div>
        <p className="text-sm font-medium" aria-live="polite">{preview ? <RecipeNutritionLabel ingredients={preview} /> : "使用量を確認してください"}</p>
        {saveError && <p role="alert" className="text-sm text-rose-600">{saveError}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={buttonClass}>キャンセル</button>
          <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{pending ? "保存中..." : "料理を保存"}</button>
        </div>
      </fieldset>
    </form>
  );
}

export function RecipeTable({ initialRecipes, foods }: { initialRecipes: Recipe[]; foods: FoodMaster[] }) {
  const { data: recipes = initialRecipes, error: fetchError, mutate } = useRecipeList(initialRecipes);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ recipe?: Recipe; copy: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = recipes.filter((recipe) => (showArchived || !recipe.is_archived) && recipe.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  function updateRecipe(recipe: Recipe) {
    void mutate((current) => [...(current ?? recipes).filter((item) => item.id !== recipe.id), recipe], { revalidate: false });
  }

  function archive(recipe: Recipe) {
    setError(null);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await setRecipeArchived(recipe.id, !recipe.is_archived, recipe.updated_at);
        if (!result.ok) return setError(result.error);
        updateRecipe(result.data);
        setMessage(recipe.is_archived ? "料理を再表示しました" : "料理を非表示にしました");
      } catch {
        setError("料理の表示設定を更新できませんでした。再試行してください。");
      }
    });
  }

  return (
    <section id="recipes" aria-labelledby="recipes-title" className="space-y-4 text-slate-700 dark:text-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div><h2 id="recipes-title" className="text-sm font-semibold">料理</h2><p className="text-xs text-slate-500">1食分の材料を保存して、料理名から記録</p></div>
        <button type="button" disabled={pending || !!editing} onClick={() => { setEditing({ copy: false }); setError(null); setMessage(""); }} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">新規料理</button>
      </div>
      {(error || fetchError) && <div role="alert" className="text-sm text-rose-600">{error ?? "料理の最新情報を取得できませんでした。"}<button type="button" onClick={() => { setError(null); void mutate(); }} className="ml-2 underline">一覧を更新</button></div>}
      {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
      {editing && <RecipeForm key={`${editing.recipe?.id ?? "new"}-${editing.copy}`} foods={foods} recipe={editing.recipe} copy={editing.copy}
        onCancel={() => setEditing(null)} onSaved={(recipe) => { updateRecipe(recipe); setEditing(null); setMessage("料理を保存しました"); }} />}
      <input type="search" aria-label="料理名で検索" placeholder="料理名で検索..." value={query} onChange={(event) => setQuery(event.target.value)} className={inputClass} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>登録 {recipes.filter((recipe) => !recipe.is_archived).length}件 · 非表示 {recipes.filter((recipe) => recipe.is_archived).length}件</span>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />非表示の料理を表示</label>
      </div>
      {visible.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">{recipes.length === 0 ? "料理が登録されていません" : "該当する料理がありません"}</p> : (
        <ul className="space-y-3">
          {visible.map((recipe) => (
            <li key={recipe.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <details>
                <summary className="cursor-pointer break-words text-sm font-semibold">{recipe.name}{recipe.is_archived && <span className="ml-2 text-xs text-slate-400">非表示</span>}</summary>
                <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">{recipe.ingredients.map((item) => <li key={item.name}>{item.name}：{item.grams}g</li>)}</ul>
                {recipe.note && <p className="mt-2 whitespace-pre-wrap break-words text-xs">{recipe.note}</p>}
              </details>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400"><RecipeNutritionLabel ingredients={recipe.ingredients} /> · 材料 {recipe.ingredients.length}品</p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" disabled={pending || !!editing} aria-label={`${recipe.name}を編集`} className={buttonClass} onClick={() => { setEditing({ recipe, copy: false }); setMessage(""); }}>編集</button>
                <button type="button" disabled={pending || !!editing} aria-label={`${recipe.name}を複製`} className={buttonClass} onClick={() => { setEditing({ recipe, copy: true }); setMessage(""); }}>複製</button>
                <button type="button" disabled={pending || !!editing} aria-label={`${recipe.name}を${recipe.is_archived ? "再表示" : "非表示"}`} className={buttonClass} onClick={() => archive(recipe)}>{recipe.is_archived ? "再表示" : "非表示"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
