"use client";

import { useState, useMemo, useTransition } from "react";
import { Trash2, Plus, Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { FoodMaster, TablesInsert } from "@/lib/supabase/types";
import { parseStrictNumber } from "@/lib/utils/parseNumber";
import { insertFood, deleteFood } from "@/app/actions/foods";

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

type SortKey = "name" | "calories" | "protein" | "fat" | "carbs";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} className="inline ml-1 text-slate-300" />;
  return sortDir === "asc"
    ? <ChevronUp size={12} className="inline ml-1 text-blue-500" />
    : <ChevronDown size={12} className="inline ml-1 text-blue-500" />;
}

export function FoodTable({ initialFoods }: FoodTableProps) {
  const [foods, setFoods] = useState<FoodMaster[]>(initialFoods);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("すべて");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewFood>(EMPTY_FOOD);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  /** true のとき新規カテゴリ名をテキスト入力、false のとき既存から選択 */
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [visibleCount, setVisibleCount] = useState(15);

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

    return [...result].sort((a, b) => {
      const aVal = sortKey === "name" ? a.name : a[sortKey];
      const bVal = sortKey === "name" ? b.name : b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [foods, query, category, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc"); // 数値列は大きい順をデフォルトに
    }
  }

  function closeForm() {
    setShowForm(false);
    setForm(EMPTY_FOOD);
    setError(null);
    setIsSaving(false);
    setSaveSuccess(false);
    setNewCategoryMode(false);
  }

  async function handleAdd() {
    if (!form.name.trim()) return setError("食品名は必須です");

    // calories / protein / fat / carbs は必須。空文字や NaN はエラー
    const numFields = ["calories", "protein", "fat", "carbs"] as const;
    const labelMap: Record<string, string> = {
      calories: "kcal",
      protein: "P (g)",
      fat: "F (g)",
      carbs: "C (g)",
    };
    const parsedNums: Record<string, number> = {};
    for (const field of numFields) {
      const v = parseStrictNumber(form[field], { min: 0 });
      if (v === null) {
        return setError(
          form[field].trim() === ""
            ? `${labelMap[field]} は必須です`
            : `${labelMap[field]} には 0 以上の数値を入力してください`
        );
      }
      parsedNums[field] = v;
    }

    setIsSaving(true);
    setError(null);

    const payload: TablesInsert<"food_master"> = {
      name: form.name.trim(),
      calories: parsedNums["calories"]!,
      protein: parsedNums["protein"]!,
      fat: parsedNums["fat"]!,
      carbs: parsedNums["carbs"]!,
      category: form.category.trim() || null,
    };
    const { error: err } = await insertFood(payload);

    setIsSaving(false);
    if (err) return setError(err);

    // 成功パス: リストを更新し、成功を表示してから1.2秒後に閉じる
    setFoods((prev) => [...prev, payload as FoodMaster].sort((a, b) => a.name.localeCompare(b.name)));
    setSaveSuccess(true);
    setTimeout(() => {
      setShowForm(false);
      setForm(EMPTY_FOOD);
      setError(null);
      setIsSaving(false);
      setSaveSuccess(false);
      setNewCategoryMode(false);
    }, 1200);
  }

  function handleDelete(name: string) {
    startTransition(async () => {
      const { error: err } = await deleteFood(name);
      if (!err) setFoods((prev) => prev.filter((f) => f.name !== name));
    });
  }

  const thCls = (key: SortKey) =>
    `px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 cursor-pointer select-none hover:text-slate-700 transition-colors ${
      key === "name" ? "text-left" : "text-right"
    }`;

  const visibleFoods = filtered.slice(0, visibleCount);

  return (
    <div className="flex flex-col gap-4">
      {/* ── 検索（mobile: 最上位 / desktop: 2番目）── */}
      <div className="relative order-1 md:order-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
        <input
          type="text"
          placeholder="食品名で検索..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setVisibleCount(15); }}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* ── セクションヘッダー（mobile: 2番目 / desktop: 最上位）── */}
      <div className="flex items-center justify-between order-2 md:order-1">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">食品マスタ</h2>
          <p className="text-xs text-slate-400">100g あたりの栄養値</p>
        </div>
        <button
          onClick={() => {
            if (showForm) { closeForm(); } else { setShowForm(true); setError(null); }
          }}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={15} />
          追加
        </button>
      </div>

      {/* ── カテゴリフィルター ── */}
      {categories.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 order-3">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setVisibleCount(15); }}
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

      {/* ── 追加フォーム ── */}
      {showForm && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 order-4">
          <p className="mb-3 text-sm font-semibold text-slate-700">新規食品を追加 (100g あたり)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(["name", "calories", "protein", "fat", "carbs"] as const).map((field) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {{ name: "食品名", calories: "kcal", protein: "P (g)", fat: "F (g)", carbs: "C (g)" }[field]}
                </label>
                <input
                  type={field === "name" ? "text" : "number"}
                  step="0.1"
                  min="0"
                  value={form[field]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                />
              </div>
            ))}

            {/* カテゴリ（既存から選択 or 新規入力） */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">カテゴリ</label>
              {!newCategoryMode ? (
                <select
                  value={form.category}
                  onChange={(e) => {
                    if (e.target.value === "__NEW__") {
                      setNewCategoryMode(true);
                      setForm((prev) => ({ ...prev, category: "" }));
                    } else {
                      setForm((prev) => ({ ...prev, category: e.target.value }));
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                >
                  <option value="">なし</option>
                  {categories.filter((c) => c !== "すべて").map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__NEW__">＋ 新規カテゴリ...</option>
                </select>
              ) : (
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="新しいカテゴリ名"
                    value={form.category}
                    autoFocus
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => { setNewCategoryMode(false); setForm((prev) => ({ ...prev, category: "" })); }}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                    title="既存から選択に戻る"
                  >
                    戻る
                  </button>
                </div>
              )}
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
          <div className="mt-3 flex items-center justify-end gap-2">
            {saveSuccess && (
              <p className="text-xs font-medium text-emerald-600">✓ 保存しました</p>
            )}
            <button
              onClick={closeForm}
              className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm hover:bg-slate-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleAdd}
              disabled={isSaving || saveSuccess}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}

      {/* ── 食品リスト ── */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden order-5">

        {/* モバイル: カードリスト (md 未満) */}
        <div className="md:hidden divide-y divide-slate-50">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              {query || category !== "すべて" ? "該当なし" : "食品が登録されていません"}
            </p>
          ) : (
            visibleFoods.map((food) => (
              <div key={food.name} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  {/* 食品名 + カテゴリバッジ */}
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-sm font-medium text-slate-800">{food.name}</span>
                    {food.category && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {food.category}
                      </span>
                    )}
                  </div>
                  {/* kcal */}
                  <div className="mt-0.5 flex items-baseline gap-1">
                    <span className="tabular-nums text-base font-bold text-slate-700">{food.calories}</span>
                    <span className="text-xs text-slate-400">kcal</span>
                  </div>
                  {/* PFC */}
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>P <span className="font-medium text-slate-700 tabular-nums">{food.protein}g</span></span>
                    <span>F <span className="font-medium text-slate-700 tabular-nums">{food.fat}g</span></span>
                    <span>C <span className="font-medium text-slate-700 tabular-nums">{food.carbs}g</span></span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(food.name)}
                  disabled={isPending}
                  className="flex-shrink-0 p-2 -mr-1 text-slate-300 hover:text-rose-500 disabled:opacity-40"
                  aria-label={`${food.name}を削除`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* デスクトップ: テーブル (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className={thCls("name")} onClick={() => handleSort("name")}>
                  食品名 <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls("calories")} onClick={() => handleSort("calories")}>
                  kcal <SortIcon col="calories" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls("protein")} onClick={() => handleSort("protein")}>
                  P (g) <SortIcon col="protein" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls("fat")} onClick={() => handleSort("fat")}>
                  F (g) <SortIcon col="fat" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thCls("carbs")} onClick={() => handleSort("carbs")}>
                  C (g) <SortIcon col="carbs" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  カテゴリ
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                    {query || category !== "すべて" ? "該当なし" : "食品が登録されていません"}
                  </td>
                </tr>
              ) : (
                visibleFoods.map((food) => (
                  <tr key={food.name} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{food.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{food.calories}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{food.protein}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{food.fat}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{food.carbs}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{food.category ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleDelete(food.name)}
                        disabled={isPending}
                        className="text-slate-300 hover:text-rose-500 disabled:opacity-40"
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

        {/* さらに表示ボタン（mobile / desktop 共通） */}
        {visibleCount < filtered.length && (
          <div className="border-t border-slate-100 px-4 py-2 text-center">
            <button
              onClick={() => setVisibleCount((c) => c + 15)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              さらに表示（残り {filtered.length - visibleCount} 件）
            </button>
          </div>
        )}

        {/* 件数フッター（mobile / desktop 共通） */}
        <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
          {filtered.length} 件中 {Math.min(visibleCount, filtered.length)} 件を表示
          {category !== "すべて" && <span className="ml-1 text-blue-500">（{category}）</span>}
        </div>
      </div>
    </div>
  );
}
