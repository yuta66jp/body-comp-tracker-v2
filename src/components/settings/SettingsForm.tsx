"use client";

import { useState, useMemo } from "react";
import { Save, CheckCircle2, AlertCircle, Loader2, ChevronDown } from "lucide-react";
import { saveSettings } from "@/app/settings/actions";
import type { Setting } from "@/lib/supabase/types";
import { toJstDateStr, calcDaysLeft } from "@/lib/utils/date";
import type { MonthlyGoalOverride } from "@/lib/utils/monthlyGoalPlan";
import { MonthlyGoalPlanSection } from "@/components/settings/MonthlyGoalPlanSection";
import { resolveMonthlyPlanHistoryAnchor } from "@/lib/utils/monthlyPlanHistory";

interface SettingsFormProps {
  initialSettings: Setting[];
  currentWeight?: number | null;
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
  contest_date:      { label: "コンテスト日", type: "date" },
  goal_weight:       { label: "目標体重", unit: "kg", type: "number", placeholder: "58.5" },
  sex:               { label: "性別", type: "select", options: ["male", "female"], optionLabels: ["男性", "女性"] },
  height_cm:         { label: "身長", unit: "cm", type: "number", placeholder: "170" },
  age:               { label: "年齢", unit: "歳", type: "number", placeholder: "30" },
  activity_factor:   { label: "活動係数", unit: "1.2〜1.9", type: "number", placeholder: "1.55" },
};

const MACRO_TARGET_FIELDS: Record<string, FieldMeta> = {
  target_calories_kcal: { label: "目標カロリー", unit: "kcal", type: "number", placeholder: "2000" },
  target_protein_g:     { label: "目標タンパク質", unit: "g", type: "number", placeholder: "150" },
  target_fat_g:         { label: "目標脂質", unit: "g", type: "number", placeholder: "60" },
  target_carbs_g:       { label: "目標炭水化物", unit: "g", type: "number", placeholder: "200" },
};

// セクション別フィールドキー
const SEASON_FIELD_KEYS = ["current_season", "current_phase", "contest_date"];
const BODY_FIELD_KEYS = ["goal_weight", "sex", "height_cm", "age", "activity_factor"];
const MACRO_TARGET_KEYS = Object.keys(MACRO_TARGET_FIELDS);

/** PFC由来kcal = P×4 + F×9 + C×4 。いずれか未入力なら null */
function calcPfcDerivedKcal(values: Record<string, string>): number | null {
  const p = parseFloat(values["target_protein_g"] ?? "");
  const f = parseFloat(values["target_fat_g"] ?? "");
  const c = parseFloat(values["target_carbs_g"] ?? "");
  if (!Number.isFinite(p) || !Number.isFinite(f) || !Number.isFinite(c)) return null;
  return Math.round(p * 4 + f * 9 + c * 4);
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-700 dark:focus:ring-blue-900/40 dark:placeholder:text-slate-500";

// ─── アコーディオン セクション ────────────────────────────────────────────────

interface FormSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  border?: boolean;
}

function FormSection({ id, title, subtitle, isOpen, onToggle, children, border = true }: FormSectionProps) {
  const panelId = `settings-panel-${id}`;
  const headingId = `settings-heading-${id}`;
  return (
    <div className={border ? "mt-5 border-t border-slate-100 pt-5 dark:border-slate-700" : ""}>
      <div className="flex items-start justify-between">
        <div>
          <h2 id={headingId} className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={`${title}を${isOpen ? "閉じる" : "開く"}`}
          className="sm:hidden ml-3 flex-shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          <ChevronDown
            size={16}
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        className={`mt-4 ${!isOpen ? "hidden sm:block" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

// ─── フィールド描画ヘルパー ────────────────────────────────────────────────────

function FieldItem({
  meta,
  value,
  error,
  onChange,
}: {
  meta: FieldMeta;
  value: string;
  error?: string;
  onChange: (val: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {meta.label}
        {meta.unit && <span className="ml-1 normal-case font-normal text-slate-300 dark:text-slate-600">({meta.unit})</span>}
      </label>

      {meta.type === "select" ? (
        <div role="radiogroup" aria-label={meta.label} className="flex gap-2">
          {meta.options!.map((opt, i) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={value === opt}
              onClick={() => onChange(opt)}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                value === opt
                  ? opt === "Cut"
                    ? "border-blue-400 bg-blue-600 text-white shadow-sm dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                    : "border-emerald-400 bg-emerald-600 text-white shadow-sm dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:bg-slate-600"
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} ${error ? "border-rose-400 focus:border-rose-400 focus:ring-rose-100" : ""}`}
        />
      )}
      {error && (
        <p className="mt-1 text-xs text-rose-500">{error}</p>
      )}
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function SettingsForm({ initialSettings, currentWeight = null }: SettingsFormProps) {
  const initMap = Object.fromEntries(
    initialSettings.map((s) => [
      s.key,
      s.value_num !== null ? String(s.value_num) : (s.value_str ?? ""),
    ])
  );

  const [values, setValues] = useState<Record<string, string>>(initMap);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // アコーディオン開閉状態: デフォルトは "season" セクションのみ開く
  const [openSections, setOpenSections] = useState(() => new Set(["season"]));

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 月次目標計画の手動 override リスト。JSON 文字列で DB に保存される。
  const [monthlyPlanOverrides, setMonthlyPlanOverrides] = useState<MonthlyGoalOverride[]>(() => {
    const row = initialSettings.find((s) => s.key === "monthly_plan_overrides");
    if (!row?.value_str) return [];
    try {
      const parsed = JSON.parse(row.value_str);
      return Array.isArray(parsed) ? (parsed as MonthlyGoalOverride[]) : [];
    } catch {
      return [];
    }
  });

  // 今日の JST 日付 (月次計画の起点として利用)
  const today = useMemo(() => toJstDateStr(), []);

  // フェーズに応じた deadline 文言 (values はリアクティブなため切り替えが即反映される)
  const isBulk = values["current_phase"] === "Bulk";
  const deadlineLabel = isBulk ? "目標日" : "コンテスト日";

  // 終了状態判定: 内部保存キーは contest_date のまま、UI 上は deadline / 大会日 / 目標日として扱う
  // values["contest_date"] がリアクティブなため、フォーム編集で即時非表示になる
  const deadlineStr = values["contest_date"] ?? "";
  const daysLeft = deadlineStr ? calcDaysLeft(today, deadlineStr) : null;
  const isDeadlineEnded = daysLeft !== null && daysLeft < 0;
  const seasonSectionTitle = isBulk ? "シーズン・目標" : "シーズン・コンテスト";
  const resolvedMonthlyPlanHistory = useMemo(
    () =>
      resolveMonthlyPlanHistoryAnchor({
        explicitStartMonth: values["monthly_plan_start_month"] || null,
        explicitStartWeight: (() => {
          const parsed = parseFloat(values["monthly_plan_start_weight"] ?? "");
          return isFinite(parsed) ? parsed : null;
        })(),
        goalDeadlineDate: values["contest_date"] || null,
        overrides: monthlyPlanOverrides,
        currentWeight,
        today,
      }),
    [values, monthlyPlanOverrides, currentWeight, today]
  );

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

  /**
   * 保存ボタン押下時のハンドラ。
   * バリデーションと DB 保存は server action (saveSettings) が canonical source。
   * UI はエラー表示とステータス管理に専念する。
   */
  async function handleSave() {
    setStatus("saving");
    setStatusMessage("");
    setFieldErrors({});

    const result = await saveSettings({
      goal_weight:             values["goal_weight"] ?? "",
      activity_factor:         values["activity_factor"] ?? "",
      height_cm:               values["height_cm"] ?? "",
      age:                     values["age"] ?? "",
      target_calories_kcal:    values["target_calories_kcal"] ?? "",
      target_protein_g:        values["target_protein_g"] ?? "",
      target_fat_g:            values["target_fat_g"] ?? "",
      target_carbs_g:          values["target_carbs_g"] ?? "",
      current_season:          values["current_season"] ?? "",
      current_phase:           values["current_phase"] ?? "",
      sex:                     values["sex"] ?? "",
      contest_date:            values["contest_date"] ?? "",
      monthly_plan_start_month: resolvedMonthlyPlanHistory.startMonth ?? "",
      monthly_plan_start_weight: resolvedMonthlyPlanHistory.startWeight !== null
        ? String(resolvedMonthlyPlanHistory.startWeight)
        : "",
      monthly_plan_overrides:  monthlyPlanOverrides.length > 0
        ? JSON.stringify(monthlyPlanOverrides)
        : "",
    });

    if (!result.ok) {
      if (result.reason === "auth_required") {
        setFieldErrors({});
        setStatusMessage(result.error);
        setStatus("error");
        setTimeout(() => {
          setStatus("idle");
          setStatusMessage("");
        }, 3000);
        return;
      }

      // server action からのエラーを fieldErrors に展開する
      // フォーマット: "field: message, field: message"
      const newErrors: Record<string, string> = {};
      const errorParts = result.error
        .replace(/^入力値が不正です。/, "")
        .split(", ");
      for (const part of errorParts) {
        const colonIdx = part.indexOf(": ");
        if (colonIdx !== -1) {
          const field = part.slice(0, colonIdx).trim();
          const message = part.slice(colonIdx + 2).trim();
          newErrors[field] = message;
        }
      }
      if (Object.keys(newErrors).length > 0) {
        setFieldErrors(newErrors);
      }
      setStatusMessage("保存に失敗しました");
      setStatus("error");
      setTimeout(() => {
        setStatus("idle");
        setStatusMessage("");
      }, 3000);
    } else {
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  // 移行ガイドのリスト項目: Cut 終了時と Bulk 終了時で内容を分ける
  const transitionGuideItems = isBulk
    ? [
        "目標日を更新",
        "目標体重を更新",
        "必要に応じてシーズン名・フェーズを変更",
        "月次計画のオーバーライドをリセット",
      ]
    : [
        "フェーズを Bulk に変更",
        "目標日（増量終了日）を設定",
        "目標体重を増量目標に更新",
        "シーズン名を更新",
        "月次計画のオーバーライドをリセット",
      ];

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">

      {/* ── フェーズ移行ガイド (deadline 終了時のみ表示) ──
          表示条件: daysLeft < 0 (deadline 超過)。deadline を更新するとリアクティブに消える。
          Cut 終了: フェーズ移行ガイド / Bulk 終了: 目標更新ガイド */}
      {isDeadlineEnded && (
        <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50 px-5 py-4 dark:border-amber-700/50 dark:bg-amber-900/30">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {isBulk ? "目標更新ガイド" : "フェーズ移行ガイド"}
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {isBulk
              ? "増量期間終了後のため、次の目標設定を案内します。"
              : "大会終了後のため、次フェーズへの移行準備を案内します。"}
          </p>
          <ul className="mt-3 space-y-1.5">
            {transitionGuideItems.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400 dark:bg-amber-500" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── セクション 1: シーズン・コンテスト (デフォルト展開) ── */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{seasonSectionTitle}</h2>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{deadlineLabel}・シーズン名・フェーズを設定します</p>
          </div>
          <button
            type="button"
            onClick={() => toggleSection("season")}
            aria-expanded={openSections.has("season")}
            aria-controls="settings-panel-season"
            aria-label={`${seasonSectionTitle}を${openSections.has("season") ? "閉じる" : "開く"}`}
            className="sm:hidden ml-3 flex-shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          >
            <ChevronDown
              size={16}
              className={`transition-transform duration-200 ${openSections.has("season") ? "rotate-180" : ""}`}
            />
          </button>
        </div>
        <div
          id="settings-panel-season"
          role="region"
          className={`mt-4 ${!openSections.has("season") ? "hidden sm:block" : ""}`}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {SEASON_FIELD_KEYS.map((key) => (
              <FieldItem
                key={key}

                meta={
                  key === "contest_date"
                    ? { ...FIELDS[key]!, label: deadlineLabel }
                    : FIELDS[key]!
                }
                value={values[key] ?? ""}
                error={fieldErrors[key]}
                onChange={(val) => set(key, val)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── セクション 2: 目標・身体情報 ── */}
      <FormSection
        id="body"
        title="目標・身体情報"
        subtitle="目標体重・性別・身長・年齢・活動係数"
        isOpen={openSections.has("body")}
        onToggle={() => toggleSection("body")}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BODY_FIELD_KEYS.map((key) => (
            <FieldItem
              key={key}
              meta={FIELDS[key]!}
              value={values[key] ?? ""}
              error={fieldErrors[key]}
              onChange={(val) => set(key, val)}
            />
          ))}
        </div>
      </FormSection>

      {/* ── セクション 3: 目標マクロ ── */}
      <FormSection
        id="macro"
        title="目標マクロ"
        subtitle="Macro 画面の差分表示に使用します"
        isOpen={openSections.has("macro")}
        onToggle={() => toggleSection("macro")}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {MACRO_TARGET_KEYS.map((key) => (
            <FieldItem
              key={key}
              meta={MACRO_TARGET_FIELDS[key]!}
              value={values[key] ?? ""}
              error={fieldErrors[key]}
              onChange={(val) => set(key, val)}
            />
          ))}
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
      </FormSection>

      {/* ── セクション 4: 月次目標計画 ── */}
      <FormSection
        id="plan"
        title="月次目標計画"
        subtitle={`${deadlineLabel}・目標体重をもとに月末目標体重を自動配分します`}
        isOpen={openSections.has("plan")}
        onToggle={() => toggleSection("plan")}
      >
        <MonthlyGoalPlanSection
          goalWeight={(() => { const v = parseFloat(values["goal_weight"] ?? ""); return isFinite(v) ? v : null; })()}
          contestDate={values["contest_date"] || null}
          phase={values["current_phase"] ?? "Cut"}
          currentWeight={currentWeight}
          today={today}
          planStartMonth={resolvedMonthlyPlanHistory.startMonth}
          planStartWeight={resolvedMonthlyPlanHistory.startWeight}
          overrides={monthlyPlanOverrides}
          onOverridesChange={setMonthlyPlanOverrides}
        />
      </FormSection>

      {/* ── 保存エリア ──
          モバイル: fixed で bottom nav の上に浮かせる
          sm+    : static でフォーム末尾にインライン表示
      */}
      <div
        className="fixed left-0 right-0 z-40 flex items-center justify-between gap-3 border-t border-slate-100 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm sm:static sm:mt-6 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none dark:border-slate-700 dark:bg-slate-900/95"
        style={{ bottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* ステータス表示 */}
        <div className="flex items-center gap-1.5 text-xs font-medium sm:mr-3">
          {status === "error" && (
            <span className="flex items-center gap-1.5 text-rose-500">
              <AlertCircle size={13} /> {statusMessage || "保存に失敗しました"}
            </span>
          )}
          {status === "saved" && (
            <span className="flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 size={13} /> 保存しました
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={status === "saving"}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:opacity-40 dark:bg-blue-800 dark:hover:bg-blue-700"
        >
          {status === "saving"
            ? <><Loader2 size={14} className="animate-spin" /> 保存中...</>
            : <><Save size={14} /> 保存</>}
        </button>
      </div>
    </div>
  );
}
