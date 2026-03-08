"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FoodPicker } from "./FoodPicker";
import { Cart, calcCartTotals } from "./Cart";
import type { CartItem } from "./Cart";
import type { FoodMaster } from "@/lib/supabase/types";


type SaveStatus = "idle" | "saving" | "saved" | "error";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function MealLogger() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayStr);
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [status, setStatus] = useState<SaveStatus>("idle");

  function addFood(food: FoodMaster) {
    setCartItems((prev) => {
      const existing = prev.findIndex((item) => item.food.name === food.name);
      if (existing >= 0) {
        return prev.map((item, i) =>
          i === existing ? { ...item, grams: item.grams + 100 } : item
        );
      }
      return [...prev, { food, grams: 100 }];
    });
  }

  function addFromMenu(items: CartItem[]) {
    setCartItems((prev) => {
      const next = [...prev];
      for (const item of items) {
        const existing = next.findIndex((c) => c.food.name === item.food.name);
        if (existing >= 0) {
          next[existing] = { ...next[existing], grams: next[existing].grams + item.grams };
        } else {
          next.push(item);
        }
      }
      return next;
    });
  }

  async function handleSave() {
    setStatus("saving");
    const totals = calcCartTotals(cartItems);
    const supabase = createClient();

    const { error } = await supabase.from("daily_logs").upsert({
      log_date: date,
      weight: weight !== "" ? parseFloat(weight) : null,
      calories: cartItems.length > 0 ? totals.calories : null,
      protein: cartItems.length > 0 ? totals.protein : null,
      fat: cartItems.length > 0 ? totals.fat : null,
      carbs: cartItems.length > 0 ? totals.carbs : null,
      note: note || null,
    } as never);

    if (error) {
      console.error("upsert error:", error.message);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    } else {
      setStatus("saved");
      setCartItems([]);
      setNote("");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const totals = calcCartTotals(cartItems);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      {/* ヘッダー (折りたたみトグル) */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <span className="text-base font-semibold text-gray-700">食事ログを入力</span>
          {!open && cartItems.length > 0 && (
            <span className="ml-2 text-sm text-blue-500">
              {cartItems.length} 品 / {totals.calories} kcal
            </span>
          )}
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* 日付 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">日付</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
            {/* 体重 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">体重 (kg)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="例: 70.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
            {/* メモ */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">メモ</label>
              <input
                type="text"
                placeholder="任意"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 食品検索 */}
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500">食品を追加</p>
              <FoodPicker onAdd={addFood} onAddSet={addFromMenu} />
            </div>
            {/* カート */}
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500">カート</p>
              <Cart items={cartItems} onChange={setCartItems} />
            </div>
          </div>

          {/* 保存ボタン */}
          <div className="mt-4 flex items-center justify-end gap-3">
            {status === "error" && (
              <p className="text-sm text-rose-500">保存に失敗しました</p>
            )}
            {status === "saved" && (
              <p className="text-sm text-emerald-600">保存しました</p>
            )}
            <button
              onClick={handleSave}
              disabled={status === "saving" || (weight === "" && cartItems.length === 0)}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-40"
            >
              <Save size={15} />
              {status === "saving" ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
