"use client";

import { useState, useMemo, useTransition } from "react";
import { Trash2, Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { FoodMaster } from "@/lib/supabase/types";

interface FoodTableProps {
  initialFoods: FoodMaster[];
}

type NewFood = {
  name: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  category: string;
};

const EMPTY_FOOD: NewFood = {
  name: "",
  calories: "",
  protein: "",
  fat: "",
  carbs: "",
  category: "",
};

export function FoodTable({ initialFoods }: FoodTableProps) {
  const [foods, setFoods] = useState<FoodMaster[]>(initialFoods);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("すべて");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewFood>(EMPTY_FOOD);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categories = useMemo(() => {
    const cats = Array.from(
      new Set(foods.map((f) => f.category).filter((c): c is string => !!c))
    ).sort();
    return ["すべて", ...cats];
  }, [foods]);

  const filtered = useMemo(() => {
    let result = foods;
    if (category !== "すべて") result = result.filter((f) => f.category === category);
    if (query) result = result.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));
    return result;
  }, [foods, query, category]);

  async function handleAdd() {
    if (!form.name.trim()) return setError("食品名は必須です");
    const payload: FoodMaster = {
      name: form.name.trim(),
      calories: parseFloat(form.calories) || 0,
      protein: parseFloat(form.protein) || 0,
      fat: parseFloat(form.fat) || 0,
      carbs: parseFloat(form.carbs) || 0,
      category: form.category.trim() || null,
    };

    const supabase = createClient();
    const { error: err } = await supabase.from("food_master").insert(payload as never);
    if (err) return setError(err.message);

    setFoods((prev) => [...prev, payload].sort((a, b) => a.name.localeCompare(b.name)));
    setForm(EMPTY_FOOD);
    setShowForm(false);
    setError(null);
  }

  function handleDelete(name: string) {
    startTransition(async () => {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("food_master")
        .delete()
        .eq("name", name as never);
      if (!err) setFoods((prev) => prev.filter((f) => f.name !== name));
    });
  }

  return (
    <div className="space-y-4">
      {/* ツールバー */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="食品名で検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setError(null); }}
          className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          <Plus size={15} />
          追加
        </button>
      </div>

      {/* カテゴリフィルター */}
      {categories.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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

      {/* 追加フォーム */}
      {showForm && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="mb-3 text-sm font-semibold text-gray-700">新規食品を追加 (100g あたり)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(["name", "calories", "protein", "fat", "carbs", "category"] as const).map((field) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  {{ name: "食品名", calories: "kcal", protein: "P (g)", fat: "F (g)", carbs: "C (g)", category: "カテゴリ" }[field]}
                </label>
                <input
                  type={field === "name" || field === "category" ? "text" : "number"}
                  step="0.1"
                  min="0"
                  value={form[field]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                />
              </div>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FOOD); setError(null); }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-sm hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleAdd}
              className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* テーブル */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">食品名</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">kcal</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">P (g)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">F (g)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">C (g)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">カテゴリ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-gray-400">
                    {query ? "該当なし" : "食品が登録されていません"}
                  </td>
                </tr>
              ) : (
                filtered.map((food) => (
                  <tr key={food.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{food.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{food.calories}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{food.protein}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{food.fat}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{food.carbs}</td>
                    <td className="px-4 py-2.5 text-gray-500">{food.category ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleDelete(food.name)}
                        disabled={isPending}
                        className="text-gray-300 hover:text-rose-500 disabled:opacity-40"
                        aria-label={`${food.name}を削除`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
          {filtered.length} 件 / 全 {foods.length} 件
            {category !== "すべて" && <span className="ml-1 text-blue-500">（{category}）</span>}
        </div>
      </div>
    </div>
  );
}
