"use client";

import { Trash2 } from "lucide-react";
import type { FoodMaster } from "@/lib/supabase/types";

export interface CartItem {
  food: FoodMaster;
  grams: number;
}

interface CartProps {
  items: CartItem[];
  onChange: (items: CartItem[]) => void;
}

function calcNutrient(food: FoodMaster, grams: number, key: keyof Pick<FoodMaster, "calories" | "protein" | "fat" | "carbs">) {
  return Math.round((food[key] * grams) / 100);
}

export function calcCartTotals(items: CartItem[]) {
  return items.reduce(
    (acc, { food, grams }) => ({
      calories: acc.calories + calcNutrient(food, grams, "calories"),
      protein: acc.protein + calcNutrient(food, grams, "protein"),
      fat: acc.fat + calcNutrient(food, grams, "fat"),
      carbs: acc.carbs + calcNutrient(food, grams, "carbs"),
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
}

export function Cart({ items, onChange }: CartProps) {
  const totals = calcCartTotals(items);

  function updateGrams(index: number, value: string) {
    const grams = Math.max(0, Number(value) || 0);
    const next = items.map((item, i) => (i === index ? { ...item, grams } : item));
    onChange(next);
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  if (items.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        食品を追加してください
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={`${item.food.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{item.food.name}</p>
              <p className="text-xs text-gray-400">
                {calcNutrient(item.food, item.grams, "calories")} kcal &nbsp;|&nbsp;
                P {calcNutrient(item.food, item.grams, "protein")}g&nbsp;
                F {calcNutrient(item.food, item.grams, "fat")}g&nbsp;
                C {calcNutrient(item.food, item.grams, "carbs")}g
              </p>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={9999}
                value={item.grams}
                onChange={(e) => updateGrams(i, e.target.value)}
                className="w-16 rounded border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-blue-400"
              />
              <span className="text-xs text-gray-400">g</span>
            </div>
            <button
              onClick={() => remove(i)}
              className="ml-1 text-gray-300 hover:text-rose-500"
              aria-label="削除"
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>

      {/* 合計行 */}
      <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm">
        <div className="flex items-center justify-between font-semibold text-gray-700">
          <span>合計</span>
          <span className="text-base">{totals.calories.toLocaleString()} kcal</span>
        </div>
        <div className="mt-1 flex gap-4 text-xs text-gray-500">
          <span>P <b>{totals.protein}</b>g</span>
          <span>F <b>{totals.fat}</b>g</span>
          <span>C <b>{totals.carbs}</b>g</span>
        </div>
      </div>
    </div>
  );
}
