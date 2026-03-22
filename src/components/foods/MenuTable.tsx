"use client";

import { useState, useMemo, useTransition } from "react";
import { Plus, Trash2, Save, ChevronDown, ChevronUp, X } from "lucide-react";
import type { FoodMaster, RecipeItem } from "@/lib/supabase/types";
import type { MenuEntry } from "@/lib/hooks/useMenuList";
import { insertMenu, updateMenu, deleteMenu } from "@/app/actions/foods";

interface MenuTableProps {
  initialMenus: MenuEntry[];
  foods: FoodMaster[];
}

interface EditingMenu {
  originalName: string | null; // null = 新規
  name: string;
  items: RecipeItem[];
}

function calcRecipeKcal(items: RecipeItem[], foodMap: Map<string, FoodMaster>) {
  return items.reduce((sum, ri) => {
    const f = foodMap.get(ri.name);
    return sum + (f ? Math.round(((f.calories ?? 0) * ri.amount) / 100) : 0);
  }, 0);
}

export function MenuTable({ initialMenus, foods }: MenuTableProps) {
  const [menus, setMenus] = useState<MenuEntry[]>(initialMenus);
  const [editing, setEditing] = useState<EditingMenu | null>(null);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [addFood, setAddFood] = useState("");
  const [addAmount, setAddAmount] = useState("100");
  const [addCategory, setAddCategory] = useState("すべて");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const foodMap = useMemo(() => new Map(foods.map((f) => [f.name, f])), [foods]);

  const foodCategories = useMemo(() => {
    const cats = Array.from(
      new Set(foods.map((f) => f.category).filter((c): c is string => !!c))
    ).sort();
    return ["すべて", ...cats];
  }, [foods]);

  const filteredFoodsForAdd = useMemo(() =>
    addCategory === "すべて" ? foods : foods.filter((f) => f.category === addCategory),
    [foods, addCategory]
  );

  function startNew() {
    setEditing({ originalName: null, name: "", items: [] });
    setSaveError(null);
    setSaveSuccess(false);
  }

  function startEdit(menu: MenuEntry) {
    setEditing({ originalName: menu.name, name: menu.name, items: [...menu.recipe] });
    setSaveError(null);
    setSaveSuccess(false);
  }

  function addItemToEditing() {
    if (!editing || !addFood) return;
    if (!foodMap.has(addFood)) return;
    const amount = Math.max(1, parseInt(addAmount) || 100);
    const exists = editing.items.findIndex((i) => i.name === addFood);
    if (exists >= 0) {
      setEditing({
        ...editing,
        items: editing.items.map((i, idx) =>
          idx === exists ? { ...i, amount: i.amount + amount } : i
        ),
      });
    } else {
      setEditing({ ...editing, items: [...editing.items, { name: addFood, amount }] });
    }
    setAddFood("");
    setAddAmount("100");
  }

  function removeItemFromEditing(idx: number) {
    if (!editing) return;
    setEditing({ ...editing, items: editing.items.filter((_, i) => i !== idx) });
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.name.trim()) return setSaveError("セット名は必須です");
    if (editing.items.length === 0) return setSaveError("1品以上追加してください");

    setIsSaving(true);
    setSaveError(null);

    const nextName = editing.name.trim();
    const payload = { name: nextName, recipe: editing.items };

    const { error } = editing.originalName === null
      ? await insertMenu(payload)
      : await updateMenu(editing.originalName, payload);

    setIsSaving(false);
    if (error) return setSaveError(error);

    setMenus((prev) => {
      const filtered = prev.filter((m) => m.name !== editing.originalName && m.name !== payload.name);
      return [...filtered, { name: payload.name, recipe: editing.items }].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    });
    setSaveSuccess(true);
    // 成功メッセージを表示してから閉じる
    setTimeout(() => {
      setEditing(null);
      setSaveError(null);
      setSaveSuccess(false);
    }, 1200);
  }

  function handleDelete(name: string) {
    startTransition(async () => {
      const { error } = await deleteMenu(name);
      if (!error) setMenus((prev) => prev.filter((m) => m.name !== name));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">セットメニュー</h2>
          <p className="text-xs text-slate-400">複数食品をまとめてログ登録</p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          <Plus size={15} />
          新規セット
        </button>
      </div>

      {/* 編集フォーム */}
      {editing && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="セット名（例: 鶏飯セット）"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          {/* 食品追加行 */}
          {/* カテゴリフィルター */}
          {foodCategories.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {foodCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setAddCategory(cat); setAddFood(""); }}
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    addCategory === cat
                      ? "bg-amber-500 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <select
              value={addFood}
              onChange={(e) => setAddFood(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm outline-none focus:border-amber-400"
            >
              <option value="">食品を選択...</option>
              {filteredFoodsForAdd.map((f) => (
                <option key={f.name} value={f.name}>{f.name}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={9999}
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-2 text-right text-sm outline-none focus:border-amber-400"
            />
            <span className="self-center text-xs text-gray-400">g</span>
            <button
              onClick={addItemToEditing}
              disabled={!addFood}
              className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-40"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* レシピ一覧（カロリー降順で表示）*/}
          {editing.items.length > 0 && (
            <ul className="rounded-lg border border-gray-100 bg-white divide-y divide-gray-50">
              {[...editing.items]
                .sort((a, b) => {
                  const fa = foodMap.get(a.name);
                  const fb = foodMap.get(b.name);
                  const ka = fa ? Math.round(((fa.calories ?? 0) * a.amount) / 100) : 0;
                  const kb = fb ? Math.round(((fb.calories ?? 0) * b.amount) / 100) : 0;
                  return kb - ka;
                })
                .map((ri) => {
                  const food = foodMap.get(ri.name);
                  const kcal = food ? Math.round(((food.calories ?? 0) * ri.amount) / 100) : 0;
                  // 削除は元の items 配列のインデックスで行う
                  const originalIdx = editing.items.findIndex((i) => i.name === ri.name);
                  return (
                    <li key={ri.name} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-gray-800">{ri.name}</span>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>{ri.amount}g</span>
                        <span className="text-gray-600 font-medium">{kcal} kcal</span>
                        <button onClick={() => removeItemFromEditing(originalIdx)} className="text-gray-300 hover:text-rose-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              <li className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
                計 {calcRecipeKcal(editing.items, foodMap)} kcal
              </li>
            </ul>
          )}

          {saveError && <p className="text-xs text-rose-500">{saveError}</p>}

          <div className="flex items-center justify-end gap-3">
            {saveSuccess && (
              <p className="text-xs font-medium text-emerald-600">✓ セットを保存しました</p>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || saveSuccess}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save size={14} />
              {isSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}

      {/* ── メニュー一覧 ── */}
      {menus.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
          セットメニューが登録されていません
        </p>
      ) : (
        <>
          {/* モバイル: カードリスト (md 未満) */}
          <div className="md:hidden space-y-2">
            {menus.map((menu) => {
              const kcal = calcRecipeKcal(menu.recipe, foodMap);
              const isOpen = expandedMenu === menu.name;
              return (
                <div key={menu.name} className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                  {/* カードヘッダー */}
                  <div className="flex items-start gap-2 px-4 py-3">
                    <button
                      onClick={() => setExpandedMenu(isOpen ? null : menu.name)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-sm font-semibold text-slate-800">{menu.name}</div>
                      <div className="mt-0.5 flex items-baseline gap-1.5 text-xs text-slate-400">
                        <span>{menu.recipe.length} 品</span>
                        <span className="text-slate-300">·</span>
                        <span className="tabular-nums text-base font-bold text-slate-700">{kcal}</span>
                        <span>kcal</span>
                        {isOpen
                          ? <ChevronUp size={13} className="ml-1 text-slate-400" />
                          : <ChevronDown size={13} className="ml-1 text-slate-400" />}
                      </div>
                    </button>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        onClick={() => startEdit(menu)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-500 hover:bg-blue-50"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(menu.name)}
                        disabled={isPending}
                        className="p-2 -mr-1 text-slate-300 hover:text-rose-500 disabled:opacity-40"
                        aria-label={`${menu.name}を削除`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {/* 展開: 食材リスト */}
                  {isOpen && (
                    <div className="border-t border-slate-50 bg-slate-50 px-4 py-3 space-y-1.5">
                      {menu.recipe.map((ri, i) => {
                        const food = foodMap.get(ri.name);
                        const itemKcal = food ? Math.round(((food.calories ?? 0) * ri.amount) / 100) : 0;
                        return (
                          <div key={i} className="flex justify-between text-xs text-slate-600">
                            <span>{ri.name}</span>
                            <span className="tabular-nums text-slate-400">{ri.amount}g · {itemKcal} kcal</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* デスクトップ: リスト (md+) */}
          <ul className="hidden md:block rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
            {menus.map((menu) => {
              const kcal = calcRecipeKcal(menu.recipe, foodMap);
              const isOpen = expandedMenu === menu.name;
              return (
                <li key={menu.name}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      onClick={() => setExpandedMenu(isOpen ? null : menu.name)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      {isOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                      <span className="text-sm font-medium text-gray-800">{menu.name}</span>
                      <span className="text-xs text-gray-400">{menu.recipe.length} 品 / {kcal} kcal</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(menu)}
                        className="rounded px-2 py-1 text-xs text-blue-500 hover:bg-blue-50"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(menu.name)}
                        disabled={isPending}
                        className="text-gray-300 hover:text-rose-500 disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <ul className="border-t border-gray-50 bg-gray-50 px-6 py-2 space-y-1">
                      {menu.recipe.map((ri, i) => {
                        const food = foodMap.get(ri.name);
                        const itemKcal = food ? Math.round(((food.calories ?? 0) * ri.amount) / 100) : 0;
                        return (
                          <li key={i} className="flex justify-between text-xs text-gray-600">
                            <span>{ri.name}</span>
                            <span>{ri.amount}g — {itemKcal} kcal</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
