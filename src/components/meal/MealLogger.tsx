"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Loader2, PenLine } from "lucide-react";
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
  const router = useRouter();
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
      setWeight("");
      router.refresh(); // Server Component のキャッシュを再フェッチ
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const totals = calcCartTotals(cartItems);

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400";

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* ヘッダー */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50">
            <PenLine size={15} className="text-blue-600" />
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-700">食事ログを入力</span>
            {!open && cartItems.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {cartItems.length} 品 · {totals.calories} kcal
              </span>
            )}
          </div>
        </div>
        {open
          ? <ChevronUp size={16} className="text-slate-400" />
          : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">日付</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">体重 (kg)</label>
              <input type="number" step="0.1" min="0" placeholder="70.5" value={weight}
                onChange={(e) => setWeight(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">メモ</label>
              <input type="text" placeholder="任意" value={note}
                onChange={(e) => setNote(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">食品を追加</p>
              <FoodPicker onAdd={addFood} onAddSet={addFromMenu} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">カート</p>
              <Cart items={cartItems} onChange={setCartItems} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3">
            {status === "error" && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-rose-500">
                <AlertCircle size={14} /> 保存に失敗しました
              </span>
            )}
            {status === "saved" && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 size={14} /> 保存しました
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={status === "saving" || (weight === "" && cartItems.length === 0)}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:opacity-40"
            >
              {status === "saving"
                ? <><Loader2 size={14} className="animate-spin" /> 保存中...</>
                : <>保存</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
