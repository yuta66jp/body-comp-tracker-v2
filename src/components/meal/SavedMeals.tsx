"use client";

import { useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { deleteMealItem, updateMealItem } from "@/app/actions/mealEntries";
import type { MealEntryWithItems, MealItem } from "@/lib/supabase/types";

type EditState = {
  amount_g: string;
  calories_kcal: string;
  protein_g: string;
  fat_g: string;
  carbs_g: string;
};

interface SavedMealsProps {
  entries: MealEntryWithItems[] | undefined;
  isLoading: boolean;
  onChanged: () => void;
}

function formatValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function toEditState(item: MealItem): EditState {
  return {
    amount_g: formatValue(item.amount_g),
    calories_kcal: formatValue(item.calories_kcal),
    protein_g: formatValue(item.protein_g),
    fat_g: formatValue(item.fat_g),
    carbs_g: formatValue(item.carbs_g),
  };
}

function parseNullableNonNegative(raw: string): number | null | typeof Number.NaN {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
  return parsed;
}

export function SavedMeals({ entries, isLoading, onChanged }: SavedMealsProps) {
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const visibleItems = useMemo(
    () => (entries ?? []).flatMap((entry) => entry.items),
    [entries]
  );

  function getEdit(item: MealItem): EditState {
    return edits[item.id] ?? toEditState(item);
  }

  function setEditField(item: MealItem, field: keyof EditState, value: string) {
    const current = edits[item.id] ?? toEditState(item);
    const next: EditState = { ...current, [field]: value };

    if (
      field === "amount_g"
      && item.calories_per_100g !== null
      && item.protein_per_100g !== null
      && item.fat_per_100g !== null
      && item.carbs_per_100g !== null
    ) {
      const grams = Number(value);
      if (Number.isFinite(grams) && grams >= 0) {
        next.calories_kcal = String(Math.round((item.calories_per_100g * grams) / 100));
        next.protein_g = String(Math.round((item.protein_per_100g * grams) / 100));
        next.fat_g = String(Math.round((item.fat_per_100g * grams) / 100));
        next.carbs_g = String(Math.round((item.carbs_per_100g * grams) / 100));
      }
    }

    setEdits((prev) => ({
      ...prev,
      [item.id]: next,
    }));
  }

  async function handleUpdate(item: MealItem) {
    const edit = getEdit(item);
    const parsed = {
      amount_g: parseNullableNonNegative(edit.amount_g),
      calories_kcal: parseNullableNonNegative(edit.calories_kcal),
      protein_g: parseNullableNonNegative(edit.protein_g),
      fat_g: parseNullableNonNegative(edit.fat_g),
      carbs_g: parseNullableNonNegative(edit.carbs_g),
    };

    if (Object.values(parsed).some((value) => Number.isNaN(value))) {
      setErrorMessage("食事明細の数値は0以上で入力してください");
      return;
    }

    setBusyItemId(item.id);
    setErrorMessage("");
    const result = await updateMealItem({ id: item.id, ...parsed });
    setBusyItemId(null);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setEdits((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    onChanged();
  }

  async function handleDelete(item: MealItem) {
    setBusyItemId(item.id);
    setErrorMessage("");
    const result = await deleteMealItem(item.id);
    setBusyItemId(null);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setEdits((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    onChanged();
  }

  const inputCls =
    "w-full min-w-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-right text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

  if (isLoading && entries === undefined) {
    return <p className="py-2 text-sm text-slate-400">保存済みの食事を読み込み中...</p>;
  }

  if (visibleItems.length === 0) {
    return <p className="py-2 text-sm text-slate-400">食品なし</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-300">
          {errorMessage}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {visibleItems.map((item) => {
          const edit = getEdit(item);
          const busy = busyItemId === item.id;
          return (
            <li key={item.id} className="rounded-lg border border-slate-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.food_name}</p>
                  <p className="text-xs text-slate-400">
                    {item.source_type === "legacy_total" ? "既存記録" : item.source_name ?? item.source_type}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleUpdate(item)}
                    disabled={busy}
                    aria-label={`${item.food_name}を更新`}
                    title="明細を更新"
                    className="rounded-md p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
                  >
                    <Save size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={busy}
                    aria-label={`${item.food_name}を削除`}
                    title="明細を削除"
                    className="rounded-md p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-900/30 dark:hover:text-rose-300"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] text-slate-400">g</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={edit.amount_g}
                    onChange={(e) => setEditField(item, "amount_g", e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] text-slate-400">kcal</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={edit.calories_kcal}
                    onChange={(e) => setEditField(item, "calories_kcal", e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] text-slate-400">P</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={edit.protein_g}
                    onChange={(e) => setEditField(item, "protein_g", e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] text-slate-400">F</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={edit.fat_g}
                    onChange={(e) => setEditField(item, "fat_g", e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] text-slate-400">C</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={edit.carbs_g}
                    onChange={(e) => setEditField(item, "carbs_g", e.target.value)}
                    className={inputCls}
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
