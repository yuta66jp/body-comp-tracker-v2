"use client";

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import type { TempFoodItem } from "./Cart";

interface TempFoodFormProps {
  onAdd: (food: TempFoodItem) => void;
}

function generateTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const emptyForm = {
  name: "",
  grams: "",
  calories: "",
  protein: "",
  fat: "",
  carbs: "",
};

type FormField = keyof typeof emptyForm;

/** 数値フィールドのバリデーション: 空文字 NG、負数 NG、非数値 NG。小数は保持する。 */
function parseNonNegative(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function TempFoodForm({ onAdd }: TempFoodFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({});
  const [justAdded, setJustAdded] = useState(false);

  function setField(field: FormField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function validate(): TempFoodItem | null {
    const next: Partial<Record<FormField, string>> = {};

    if (form.name.trim() === "") {
      next.name = "食品名を入力してください";
    }
    const calories = parseNonNegative(form.calories);
    if (calories === null) next.calories = "0以上の数値を入力してください";

    const protein = parseNonNegative(form.protein);
    if (protein === null) next.protein = "0以上の数値を入力してください";

    const fat = parseNonNegative(form.fat);
    if (fat === null) next.fat = "0以上の数値を入力してください";

    const carbs = parseNonNegative(form.carbs);
    if (carbs === null) next.carbs = "0以上の数値を入力してください";

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return null;
    }

    const rawGrams = Number(form.grams);
    const grams =
      form.grams.trim() === "" || !Number.isFinite(rawGrams)
        ? 0
        : Math.max(0, Math.round(rawGrams));

    return {
      tempId: generateTempId(),
      name: form.name.trim(),
      grams,
      calories: calories!,
      protein: protein!,
      fat: fat!,
      carbs: carbs!,
    };
  }

  function handleSubmit() {
    const food = validate();
    if (!food) return;
    onAdd(food);
    setForm(emptyForm);
    setErrors({});
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400";
  const errorInputCls =
    "w-full rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-100 placeholder:text-slate-400";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
    >
      <p className="text-xs text-amber-700 font-medium">
        食品DBに登録しない一時食品。摂取量の栄養値を直接入力してください。
      </p>

      {/* 食品名 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">食品名 <span className="text-rose-500">*</span></label>
        <input
          type="text"
          placeholder="例: サラダチキン (コンビニ)"
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          className={errors.name ? errorInputCls : inputCls}
        />
        {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name}</p>}
      </div>

      {/* グラム数（任意） */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">グラム数（任意）</label>
        <input
          type="number"
          min={0}
          placeholder="200"
          value={form.grams}
          onChange={(e) => setField("grams", e.target.value)}
          className={inputCls}
        />
      </div>

      {/* 栄養値（摂取量そのもの） */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500">栄養値（この食品の摂取量全体） <span className="text-rose-500">*</span></p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">カロリー (kcal)</label>
            <input
              type="number"
              min={0}
              placeholder="350"
              value={form.calories}
              onChange={(e) => setField("calories", e.target.value)}
              className={errors.calories ? errorInputCls : inputCls}
            />
            {errors.calories && <p className="mt-1 text-xs text-rose-500">{errors.calories}</p>}
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">たんぱく質 (g)</label>
            <input
              type="number"
              min={0}
              placeholder="25"
              value={form.protein}
              onChange={(e) => setField("protein", e.target.value)}
              className={errors.protein ? errorInputCls : inputCls}
            />
            {errors.protein && <p className="mt-1 text-xs text-rose-500">{errors.protein}</p>}
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">脂質 (g)</label>
            <input
              type="number"
              min={0}
              placeholder="12"
              value={form.fat}
              onChange={(e) => setField("fat", e.target.value)}
              className={errors.fat ? errorInputCls : inputCls}
            />
            {errors.fat && <p className="mt-1 text-xs text-rose-500">{errors.fat}</p>}
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">炭水化物 (g)</label>
            <input
              type="number"
              min={0}
              placeholder="30"
              value={form.carbs}
              onChange={(e) => setField("carbs", e.target.value)}
              className={errors.carbs ? errorInputCls : inputCls}
            />
            {errors.carbs && <p className="mt-1 text-xs text-rose-500">{errors.carbs}</p>}
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={justAdded}
        className={`flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${
          justAdded
            ? "bg-green-500 cursor-default"
            : "bg-amber-500 hover:bg-amber-600"
        }`}
      >
        {justAdded ? (
          <><Check size={14} /> カートに追加しました</>
        ) : (
          <><Plus size={14} /> 一時食品として追加</>
        )}
      </button>
    </form>
  );
}
