"use client";

import { useState, useMemo } from "react";
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
  options?: string[];       // type === "select" のみ
  optionLabels?: string[];  // options の表示ラベル（省略時は options をそのまま使用）
  placeholder?: string;
}

const FIELDS: Record<string, FieldMeta> = {
  current_season:    { label: "現在のシーズン", type: "text", placeholder: "2026_TokyoNovice" },
  current_phase:     { label: "現在のフェーズ", type: "select", options: ["Cut", "Bulk"] },
  sex:               { label: "性別", type: "select", options: ["male", "female"], optionLabels: ["男性", "女性"] },
  goal_weight:       { label: "目標体重", unit: "kg", type: "number", placeholder: "58.5" },
  monthly_target:    { label: "月次目標体重", unit: "kg", type: "number", placeholder: "62.0" },
  contest_date:      { label: "コンテスト日", type: "date" },
  activity_factor:   { label: "活動係数", unit: "1.2〜1.9", type: "number", placeholder: "1.55" },
  height_cm:         { label: "身長", unit: "cm", type: "number", placeholder: "170" },
  age:               { label: "年齢", unit: "歳", type: "number", placeholder: "30" },
};

const MACRO_TARGET_FIELDS: Record<string, FieldMeta> = {
  target_calories_kcal: { label: "目標カロリー", unit: "kcal", type: "number", placeholder: "2000" },
  target_protein_g:     { label: "目標タンパク質", unit: "g", type: "number", placeholder: "150" },
  target_fat_g:         { label: "目標脂質", unit: "g", type: "number", placeholder: "60" },
  target_carbs_g:       { label: "目標炭水化物", unit: "g", type: "number", placeholder: "200" },
};

const FIELD_KEYS = Object.keys(FIELDS);
const MACRO_TARGET_KEYS = Object.keys(MACRO_TARGET_FIELDS);
const ALL_FIELD_KEYS = [...FIELD_KEYS, ...MACRO_TARGET_KEYS];

/** PFC由来kcal = P×4 + F×9 + C×4 。いずれか未入力なら null */
function calcPfcDerivedKcal(values: Record<string, string>): number | null {
  const p = parseFloat(values["target_protein_g"] ?? "");
  const f = parseFloat(values["target_fat_g"] ?? "");
  const c = parseFloat(values["target_carbs_g"] ?? "");
  if (!Number.isFinite(p) || !Number.isFinite(f) || !Number.isFinite(c)) return null;
  return Math.round(p * 4 + f * 9 + c * 4);
}

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

  /** PFC由来kcal と target_calories_kcal の差分（絶対値 > 100 kcal で警告）*/
  const pfcConsistencyWarning = useMemo((): string | null => {
    const targetCal = parseFloat(values["target_calories_kcal"] ?? "");
    const pfcKcal = calcPfcDerivedKcal(values);
    if (!Number.isFinite(targetCal) || pfcKcal === null) return null;
    const gap = Math.abs(targetCal - pfcKcal);
    if (gap <= 100) return null;
    return `目標カロリー (${Math.round(targetCal)} kcal) と PFC由来kcal (${pfcKcal} kcal) の差が ${Math.round(gap)} kcal あります。どちらを正として管理するか確認してください。`;
  }, [values]);

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
    checkRange("target_calories_kcal", 500, 6000, "目標カロリー");
    checkRange("target_protein_g", 0, 500, "目標タンパク質");
    checkRange("target_fat_g", 0, 300, "目標脂質");
    checkRange("target_carbs_g", 0, 800, "目標炭水化物");

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

    const allMeta = { ...FIELDS, ...MACRO_TARGET_FIELDS };
    const upserts = ALL_FIELD_KEYS.map((key) => {
      const meta = allMeta[key];
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
                  {meta.options!.map((opt, i) => (
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
                      {meta.optionLabels?.[i] ?? opt}
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

      {/* 目標マクロ設定 */}
      <div className="mt-6 border-t border-slate-100 pt-6">
        <h2 className="mb-1.5 text-sm font-semibold text-slate-700">目標マクロ</h2>
        <p className="mb-4 text-xs text-slate-400">Macro 画面の差分表示に使用します。</p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {MACRO_TARGET_KEYS.map((key) => {
            const meta = MACRO_TARGET_FIELDS[key];
            return (
              <div key={key}>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {meta.label}
                  {meta.unit && <span className="ml-1 normal-case font-normal text-slate-300">({meta.unit})</span>}
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder={meta.placeholder}
                  value={values[key] ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                  className={`${inputCls} ${fieldErrors[key] ? "border-rose-400 focus:border-rose-400 focus:ring-rose-100" : ""}`}
                />
                {fieldErrors[key] && (
                  <p className="mt-1 text-xs text-rose-500">{fieldErrors[key]}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* PFC由来kcal 参考表示 + 整合性警告 */}
        {calcPfcDerivedKcal(values) !== null && (
          <p className="mt-2 text-xs text-slate-400">
            PFC由来kcal: <span className="font-medium text-slate-600">{calcPfcDerivedKcal(values)} kcal</span>
          </p>
        )}
        {pfcConsistencyWarning && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {pfcConsistencyWarning}
          </p>
        )}
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
