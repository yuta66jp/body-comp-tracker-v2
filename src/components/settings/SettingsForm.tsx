"use client";

import { useState } from "react";
import { Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Setting } from "@/lib/supabase/types";
import { normalizeSettingField } from "./normalizeSettingField";

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
  current_season:    { label: "現在のシーズン", type: "text", placeholder: "2026_TokyoNovice" },
  current_phase:     { label: "現在のフェーズ", type: "select", options: ["Cut", "Bulk"] },
  goal_weight:       { label: "目標体重", unit: "kg", type: "number", placeholder: "58.5" },
  monthly_target:    { label: "月次目標体重", unit: "kg", type: "number", placeholder: "62.0" },
  contest_date:      { label: "コンテスト日", type: "date" },
  activity_factor:   { label: "活動係数", unit: "1.2〜1.9", type: "number", placeholder: "1.55" },
  height_cm:         { label: "身長", unit: "cm", type: "number", placeholder: "170" },
  age:               { label: "年齢", unit: "歳", type: "number", placeholder: "30" },
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function set(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
    // 入力変更時に対象フィールドのエラーをクリア
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** 各フィールドの範囲バリデーションを行い、エラーがあれば fieldErrors にセットして false を返す。 */
  function validate(): boolean {
    const errors: Record<string, string> = {};

    function checkRange(key: string, min: number, max: number, label: string) {
      const raw = values[key] ?? "";
      if (raw === "") return; // 空欄は未設定扱いでスキップ
      const v = parseFloat(raw);
      if (isNaN(v) || v < min || v > max) {
        errors[key] = `${label} は ${min}〜${max} の範囲で入力してください`;
      }
    }

    checkRange("height_cm", 100, 250, "身長");
    checkRange("age", 1, 120, "年齢");
    checkRange("activity_factor", 1.2, 2.5, "活動係数");
    checkRange("goal_weight", 20, 200, "目標体重");
    checkRange("monthly_target", 20, 200, "月次目標体重");

    // current_phase は "Cut" / "Bulk" のみ許容
    const phase = values["current_phase"] ?? "";
    if (phase !== "" && !["Cut", "Bulk"].includes(phase)) {
      errors["current_phase"] = 'フェーズは "Cut" または "Bulk" を選択してください';
    }

    // contest_date は YYYY-MM-DD 形式のみ許容
    const contestDate = values["contest_date"] ?? "";
    if (contestDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(contestDate)) {
      errors["contest_date"] = "日付は YYYY-MM-DD 形式で入力してください";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setStatus("saving");
    const supabase = createClient();

    const upserts = FIELD_KEYS.map((key) => {
      const meta = FIELDS[key];
      const raw = values[key] ?? "";
      const isNumeric = meta.type === "number";
      const isDate = meta.type === "date";

      // text / select フィールド: 前後空白を除去
      const normalizedStr = (!isNumeric && !isDate) ? raw.trim() : raw;
      // number フィールド: parseFloat して有限数でなければ null
      const parsedNum = isNumeric && raw.trim() !== "" ? parseFloat(raw.trim()) : NaN;
      const numValue = isNumeric ? (Number.isFinite(parsedNum) ? parsedNum : null) : null;
      // date フィールド: YYYY-MM-DD 形式のみ保存（それ以外は null）
      const dateValue = isDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;

      return {
        key,
        value_num: numValue,
        value_str: isNumeric ? null : (isDate ? dateValue : (normalizedStr !== "" ? normalizedStr : null)),
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
                  type={meta.type}
                  step={meta.type === "number" ? "any" : undefined}
                  placeholder={meta.placeholder}
                  value={values[key] ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                  className={`${inputCls} ${fieldErrors[key] ? "border-rose-400 focus:border-rose-400 focus:ring-rose-100" : ""}`}
                />
              )}
              {fieldErrors[key] && (
                <p className="mt-1 text-xs text-rose-500">{fieldErrors[key]}</p>
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
