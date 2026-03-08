"use client";

import { useState } from "react";
import { Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Setting } from "@/lib/supabase/types";

interface SettingsFormProps {
  initialSettings: Setting[];
}

type FieldType = "number" | "text" | "date" | "select";

interface FieldMeta {
  label: string;
  unit?: string;
  type: FieldType;
  options?: string[];   // type === "select" のみ
  placeholder?: string;
}

const FIELDS: Record<string, FieldMeta> = {
  current_phase:     { label: "現在のフェーズ", type: "select", options: ["Cut", "Bulk"] },
  goal_weight:       { label: "目標体重", unit: "kg", type: "number", placeholder: "58.5" },
  monthly_target:    { label: "月次目標体重", unit: "kg", type: "number", placeholder: "62.0" },
  contest_date:      { label: "コンテスト日", type: "date" },
  activity_factor:   { label: "活動係数", unit: "1.2〜1.9", type: "number", placeholder: "1.55" },
  height_cm:         { label: "身長", unit: "cm", type: "number", placeholder: "170" },
  age:               { label: "年齢", unit: "歳", type: "number", placeholder: "30" },
  protein_target_g:  { label: "タンパク質目標", unit: "g/日", type: "number", placeholder: "180" },
};

const FIELD_KEYS = Object.keys(FIELDS);

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400";

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const initMap = Object.fromEntries(
    initialSettings.map((s) => [
      s.key,
      s.value_num !== null ? String(s.value_num) : (s.value_str ?? ""),
    ])
  );

  const [values, setValues] = useState<Record<string, string>>(initMap);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function set(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    setStatus("saving");
    const supabase = createClient();

    const upserts = FIELD_KEYS.map((key) => {
      const meta = FIELDS[key];
      const raw = values[key] ?? "";
      const isNumeric = meta.type === "number";
      return {
        key,
        value_num: isNumeric && raw !== "" ? parseFloat(raw) : null,
        value_str: !isNumeric && raw !== "" ? raw : null,
      };
    });

    const { error } = await supabase.from("settings").upsert(upserts as never);
    if (error) {
      console.error("settings upsert error:", error.message);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    } else {
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-sm font-semibold text-slate-700">基本設定</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FIELD_KEYS.map((key) => {
          const meta = FIELDS[key];
          return (
            <div key={key}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                {meta.label}
                {meta.unit && <span className="ml-1 normal-case font-normal text-slate-300">({meta.unit})</span>}
              </label>

              {meta.type === "select" ? (
                <div className="flex gap-2">
                  {meta.options!.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => set(key, opt)}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                        values[key] === opt
                          ? opt === "Cut"
                            ? "border-blue-400 bg-blue-600 text-white shadow-sm"
                            : "border-emerald-400 bg-emerald-600 text-white shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type={meta.type === "date" ? "date" : "number"}
                  step="any"
                  placeholder={meta.placeholder}
                  value={values[key] ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                  className={inputCls}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
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
          disabled={status === "saving"}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:opacity-40"
        >
          {status === "saving"
            ? <><Loader2 size={14} className="animate-spin" /> 保存中...</>
            : <><Save size={14} /> 保存</>}
        </button>
      </div>
    </div>
  );
}
