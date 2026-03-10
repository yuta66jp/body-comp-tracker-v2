"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, PenLine } from "lucide-react";
import { saveDailyLog } from "@/app/actions/saveDailyLog";
import { FoodPicker } from "./FoodPicker";
import { Cart, calcCartTotals } from "./Cart";
import type { CartItem } from "./Cart";
import type { FoodMaster } from "@/lib/supabase/types";
import { toJstDateStr } from "@/lib/utils/date";

type SaveStatus = "idle" | "saving" | "saved" | "error";

function todayStr() {
  return toJstDateStr();
}

interface MealLoggerProps {
  sidebar?: boolean; // サイドバーモード: 常時展開・縦レイアウト
}

export function MealLogger({ sidebar = false }: MealLoggerProps) {
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

    const result = await saveDailyLog({
      log_date: date,
      weight: weight !== "" ? parseFloat(weight) : null,
      calories: cartItems.length > 0 ? totals.calories : null,
      protein: cartItems.length > 0 ? totals.protein : null,
      fat: cartItems.length > 0 ? totals.fat : null,
      carbs: cartItems.length > 0 ? totals.carbs : null,
      note: note || null,
    });

    if (!result.ok) {
      console.error("save error:", result.message);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    } else {
      setStatus("saved");
      setCartItems([]);
      setNote("");
      setWeight("");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400";

  const content = (
    <div className={sidebar ? "flex flex-col gap-4" : "border-t border-slate-100 px-5 pb-5 pt-4"}>
      {/* 日付・体重・メモ */}
      <div className={`grid gap-3 ${sidebar ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
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

      {/* 食品検索 */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">食品を追加</p>
        <FoodPicker onAdd={addFood} onAddSet={addFromMenu} />
      </div>

      {/* カート */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">カート</p>
        <Cart items={cartItems} onChange={setCartItems} />
      </div>

      {/* 保存ボタン */}
      <div className="flex items-center justify-end gap-3">
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
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:opacity-40"
        >
          {status === "saving"
            ? <><Loader2 size={14} className="animate-spin" /> 保存中...</>
            : <>保存</>}
        </button>
      </div>
    </div>
  );

  // サイドバーモード: 折りたたみなし
  if (sidebar) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50">
            <PenLine size={15} className="text-blue-600" />
          </div>
          <span className="text-sm font-semibold text-slate-700">食事ログ</span>
        </div>
        {content}
      </div>
    );
  }

  // 通常モード（使用箇所なし・後方互換のため残す）
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50">
          <PenLine size={15} className="text-blue-600" />
        </div>
        <span className="text-sm font-semibold text-slate-700">食事ログを入力</span>
      </div>
      {content}
    </div>
  );
}
