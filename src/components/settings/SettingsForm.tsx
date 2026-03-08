"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Setting } from "@/lib/supabase/types";

interface SettingsFormProps {
  initialSettings: Setting[];
}

const SETTING_LABELS: Record<string, { label: string; unit?: string; type: "number" | "text" }> = {
  goal_weight: { label: "目標体重", unit: "kg", type: "number" },
  contest_date: { label: "コンテスト日 (YYYY-MM-DD)", type: "text" },
  activity_factor: { label: "活動係数 (1.2〜1.9)", type: "number" },
  height_cm: { label: "身長", unit: "cm", type: "number" },
  age: { label: "年齢", unit: "歳", type: "number" },
  protein_target_g: { label: "タンパク質目標", unit: "g/日", type: "number" },
};

const DEFAULT_KEYS = Object.keys(SETTING_LABELS);

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const initMap = Object.fromEntries(
    initialSettings.map((s) => [s.key, s.value_num !== null ? String(s.value_num) : (s.value_str ?? "")])
  );

  const [values, setValues] = useState<Record<string, string>>(initMap);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSave() {
    setStatus("saving");
    const supabase = createClient();

    const upserts = DEFAULT_KEYS.map((key) => {
      const meta = SETTING_LABELS[key];
      const raw = values[key] ?? "";
      return {
        key,
        value_num: meta.type === "number" && raw !== "" ? parseFloat(raw) : null,
        value_str: meta.type === "text" && raw !== "" ? raw : null,
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
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-base font-semibold text-gray-700">基本設定</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {DEFAULT_KEYS.map((key) => {
          const meta = SETTING_LABELS[key];
          return (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                {meta.label}
                {meta.unit && <span className="ml-1 text-gray-400">({meta.unit})</span>}
              </label>
              <input
                type={meta.type}
                step="any"
                value={values[key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        {status === "error" && <p className="text-sm text-rose-500">保存に失敗しました</p>}
        {status === "saved" && <p className="text-sm text-emerald-600">保存しました</p>}
        <button
          onClick={handleSave}
          disabled={status === "saving"}
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-40"
        >
          <Save size={15} />
          {status === "saving" ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
