"use client";

import { useState } from "react";
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
  return Math.round(((food[key] ?? 0) * grams) / 100);
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

/**
 * 編集完了（blur）時に grams 文字列を正規化して確定値を返す。
 *
 * - 空文字・空白のみ・NaN・不正文字列 → fallback（編集前の値に戻す）
 * - 負数 → 0 にクランプ
 * - 有効な数値 → そのまま使用（小数も許容）
 *
 * @param raw     input から受け取った文字列
 * @param fallback 不正値の場合に使う元の grams 値
 */
export function normalizeGrams(raw: string, fallback: number): number {
  if (raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

export function Cart({ items, onChange }: CartProps) {
  const totals = calcCartTotals(items);

  // 編集中の grams を string で一時保持する（food.name → string）。
  // キーに index ではなく food.name（cart 内で一意）を使うことで、
  // 行削除後の index ずれによる対応崩れを防ぐ。
  // onChange では文字列のまま保持し、blur 時に正規化して親へ反映する。
  // これにより「全消し → 再入力」時に 0 に潰されず、自然に打ち直せる。
  const [editingGrams, setEditingGrams] = useState<Record<string, string>>({});

  function handleGramsChange(foodName: string, value: string) {
    setEditingGrams((prev) => ({ ...prev, [foodName]: value }));
  }

  function handleGramsBlur(index: number, foodName: string) {
    const raw = editingGrams[foodName];
    if (raw === undefined) return; // 未編集ならスキップ

    const grams = normalizeGrams(raw, items[index].grams);
    const next = items.map((item, i) => (i === index ? { ...item, grams } : item));
    onChange(next);

    setEditingGrams((prev) => {
      const updated = { ...prev };
      delete updated[foodName];
      return updated;
    });
  }

  function remove(index: number) {
    const foodName = items[index].food.name;
    setEditingGrams((prev) => {
      const updated = { ...prev };
      delete updated[foodName];
      return updated;
    });
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
                value={item.food.name in editingGrams ? editingGrams[item.food.name] : item.grams}
                onChange={(e) => handleGramsChange(item.food.name, e.target.value)}
                onBlur={() => handleGramsBlur(i, item.food.name)}
                className="w-16 rounded border border-gray-200 px-2 py-2.5 text-right text-sm outline-none focus:border-blue-400"
              />
              <span className="text-xs text-gray-400">g</span>
            </div>
            <button
              onClick={() => remove(i)}
              className="ml-1 p-2 text-gray-300 hover:text-rose-500"
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
