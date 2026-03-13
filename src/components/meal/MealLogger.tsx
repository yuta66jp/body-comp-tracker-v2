"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, PenLine } from "lucide-react";
import { saveDailyLog } from "@/app/actions/saveDailyLog";
import { FoodPicker } from "./FoodPicker";
import { Cart, calcCartTotals } from "./Cart";
import type { CartItem } from "./Cart";
import type { FoodMaster } from "@/lib/supabase/types";
import { toJstDateStr } from "@/lib/utils/date";
import {
  type DayTag,
  DAY_TAGS,
  DAY_TAG_LABELS,
  DAY_TAG_ACTIVE_COLORS,
  emptyTagState,
} from "@/lib/utils/dayTags";
import {
  TRAINING_TYPES,
  TRAINING_TYPE_LABELS,
  WORK_MODES,
  WORK_MODE_LABELS,
  type TrainingType,
  type WorkMode,
} from "@/lib/utils/trainingType";

type SaveStatus = "idle" | "saving" | "saved" | "error";

function todayStr() {
  return toJstDateStr();
}

/** hasContent 判定のための純粋関数（テスト容易性のために抽出） */
export interface HasContentInput {
  weight: string;
  cartItems: CartItem[];
  note: string;
  touchedTags: Set<DayTag>;
  sleepHours: string;
  hadBowelMovement: boolean | null;
  trainingTypeTouched: boolean;
  workModeTouched: boolean;
}

export function computeHasContent(input: HasContentInput): boolean {
  return (
    input.weight !== "" ||
    input.cartItems.length > 0 ||
    input.note !== "" ||
    input.touchedTags.size > 0 ||
    input.sleepHours !== "" ||
    input.hadBowelMovement !== null ||
    input.trainingTypeTouched ||
    input.workModeTouched
  );
}

interface MealLoggerProps {
  sidebar?: boolean; // サイドバーモード: 常時展開・縦レイアウト
}

export function MealLogger({ sidebar = false }: MealLoggerProps) {
  // ── 既存フィールド ──
  const [date, setDate] = useState(todayStr);
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [tags, setTags] = useState<ReturnType<typeof emptyTagState>>(emptyTagState);
  // 明示的にトグルされたタグのみ追跡する（未操作タグは undefined として送り既存値を保持）
  const [touchedTags, setTouchedTags] = useState<Set<DayTag>>(new Set());
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // ── Phase 2.5 新規フィールド ──
  const [sleepHours, setSleepHours] = useState("");
  // had_bowel_movement: null=未操作(undefined送信), true/false=明示的選択
  const [hadBowelMovement, setHadBowelMovement] = useState<boolean | null>(null);
  // training_type: null=未選択, Touched=true で null 送信(明示クリア)も可
  const [trainingType, setTrainingType] = useState<TrainingType | null>(null);
  const [trainingTypeTouched, setTrainingTypeTouched] = useState(false);
  // work_mode: 同上
  const [workMode, setWorkMode] = useState<WorkMode | null>(null);
  const [workModeTouched, setWorkModeTouched] = useState(false);

  function toggleTag(tag: DayTag) {
    setTags((prev) => ({ ...prev, [tag]: !(prev as Record<DayTag, boolean>)[tag] }));
    setTouchedTags((prev) => new Set([...prev, tag]));
  }

  function selectTrainingType(type: TrainingType) {
    setTrainingTypeTouched(true);
    setTrainingType((prev) => (prev === type ? null : type)); // 同じものを再クリック → null
  }

  function selectWorkMode(mode: WorkMode) {
    setWorkModeTouched(true);
    setWorkMode((prev) => (prev === mode ? null : mode));
  }

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

    // 明示的にトグルされたタグのみペイロードに含める
    const tagPayload: Partial<Record<DayTag, boolean>> = {};
    for (const tag of touchedTags) {
      tagPayload[tag] = tags[tag as keyof typeof tags] ?? false;
    }

    const result = await saveDailyLog({
      log_date: date,
      // 未入力項目は undefined → 既存値を保持（null は「明示的クリア」専用）
      weight:   weight !== ""          ? parseFloat(weight) : undefined,
      calories: cartItems.length > 0   ? totals.calories    : undefined,
      protein:  cartItems.length > 0   ? totals.protein     : undefined,
      fat:      cartItems.length > 0   ? totals.fat         : undefined,
      carbs:    cartItems.length > 0   ? totals.carbs       : undefined,
      note:     note !== ""            ? note               : undefined,
      ...tagPayload,
      // Phase 2.5 新規フィールド
      sleep_hours:        sleepHours !== "" ? parseFloat(sleepHours) : undefined,
      had_bowel_movement: hadBowelMovement !== null ? hadBowelMovement : undefined,
      training_type:      trainingTypeTouched ? trainingType : undefined,
      work_mode:          workModeTouched     ? workMode     : undefined,
    });

    if (!result.ok) {
      console.error("[MealLogger] save error:", result.message);
      setErrorMessage(result.message);
      setStatus("error");
      setTimeout(() => { setStatus("idle"); setErrorMessage(""); }, 5000);
    } else {
      setStatus("saved");
      // フォームをリセット
      setCartItems([]);
      setNote("");
      setWeight("");
      setTags(emptyTagState());
      setTouchedTags(new Set());
      setSleepHours("");
      setHadBowelMovement(null);
      setTrainingType(null);
      setTrainingTypeTouched(false);
      setWorkMode(null);
      setWorkModeTouched(false);
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const hasContent = computeHasContent({
    weight, cartItems, note, touchedTags,
    sleepHours, hadBowelMovement, trainingTypeTouched, workModeTouched,
  });

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400";

  const chipCls = (active: boolean) =>
    `rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
      active
        ? "border-blue-400 bg-blue-600 text-white"
        : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100"
    }`;

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

      {/* 特殊日タグ (is_cheat_day / is_refeed_day / is_eating_out) */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">特殊日</p>
        <div className="grid grid-cols-3 gap-2">
          {DAY_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                tags[tag as keyof typeof tags]
                  ? DAY_TAG_ACTIVE_COLORS[tag]
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100"
              }`}
            >
              {DAY_TAG_LABELS[tag]}
            </button>
          ))}
        </div>
      </div>

      {/* コンディション */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">コンディション</p>
        <div className={`grid gap-3 ${sidebar ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
          {/* 睡眠時間 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">睡眠時間 (h)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="24"
              placeholder="7.5"
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              className={inputCls}
            />
          </div>
          {/* 便通 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">便通</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHadBowelMovement((prev) => (prev === true ? null : true))}
                className={chipCls(hadBowelMovement === true)}
              >
                あり
              </button>
              <button
                type="button"
                onClick={() => setHadBowelMovement((prev) => (prev === false ? null : false))}
                className={chipCls(hadBowelMovement === false)}
              >
                なし
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* トレーニング部位 */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">トレーニング部位</p>
        <div className="flex flex-wrap gap-2">
          {TRAINING_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => selectTrainingType(type)}
              className={chipCls(trainingType === type)}
            >
              {TRAINING_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* 仕事モード */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">仕事モード</p>
        <div className="flex flex-wrap gap-2">
          {WORK_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => selectWorkMode(mode)}
              className={chipCls(workMode === mode)}
            >
              {WORK_MODE_LABELS[mode]}
            </button>
          ))}
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
          <span className="flex items-center gap-1.5 text-xs font-medium text-rose-500 max-w-xs text-right">
            <AlertCircle size={14} className="shrink-0" />
            {errorMessage || "保存に失敗しました"}
          </span>
        )}
        {status === "saved" && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <CheckCircle2 size={14} /> 保存しました
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={status === "saving" || !hasContent}
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
