"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, PenLine, X, Undo2 } from "lucide-react";
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
  weight: string | null;          // null = 明示的クリア予定
  cartItems: CartItem[];
  cartEverHadItems: boolean;      // カートに一度でもアイテムが追加されたか
  note: string | null;            // null = 明示的クリア予定
  touchedTags: Set<DayTag>;
  sleepHours: string | null;      // null = 明示的クリア予定
  hadBowelMovementTouched: boolean; // ボタンを一度でも操作したか
  trainingTypeTouched: boolean;
  workModeTouched: boolean;
}

export function computeHasContent(input: HasContentInput): boolean {
  return (
    // null !== "" → true なので、明示的クリア状態も「保存すべき内容あり」として扱う
    input.weight !== "" ||
    input.cartItems.length > 0 ||
    input.cartEverHadItems ||       // カートを空にした場合も null 送信のため有効化
    input.note !== "" ||
    input.touchedTags.size > 0 ||
    input.sleepHours !== "" ||
    input.hadBowelMovementTouched || // touched なら null 送信も含め有効化
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
  // string | null: "" = 未入力, "70.5" = 入力値, null = 明示的クリア予定（null 送信）
  const [weight, setWeight] = useState<string | null>("");
  const [note, setNote] = useState<string | null>("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  // カートに一度でもアイテムが追加されたか（空カートでも null 送信させるためのフラグ）
  const [cartEverHadItems, setCartEverHadItems] = useState(false);
  const [tags, setTags] = useState<ReturnType<typeof emptyTagState>>(emptyTagState);
  // 明示的にトグルされたタグのみ追跡する（未操作タグは undefined として送り既存値を保持）
  const [touchedTags, setTouchedTags] = useState<Set<DayTag>>(new Set());
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // ── Phase 2.5 新規フィールド ──
  // string | null: "" = 未入力, "7.5" = 入力値, null = 明示的クリア予定
  const [sleepHours, setSleepHours] = useState<string | null>("");
  // had_bowel_movement: null=未記録（未選択）, true=便通あり, false=便通なし
  // hadBowelMovementTouched=true のとき: null→null 送信（明示クリア=未記録），true/false→値送信
  // hadBowelMovementTouched=false のとき: undefined 送信（既存値を保持）
  const [hadBowelMovement, setHadBowelMovement] = useState<boolean | null>(null);
  const [hadBowelMovementTouched, setHadBowelMovementTouched] = useState(false);
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
    setCartEverHadItems(true);
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
    setCartEverHadItems(true);
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
      // null = 明示的クリア（null 送信）/ "" = 未入力（undefined 送信、既存値保持）
      weight:   weight === null   ? null   : (weight   !== "" ? parseFloat(weight)   : undefined),
      // カートに一度でも追加後に空にした → null 送信（マクロをクリア）
      calories: cartItems.length > 0 ? totals.calories : (cartEverHadItems ? null : undefined),
      protein:  cartItems.length > 0 ? totals.protein  : (cartEverHadItems ? null : undefined),
      fat:      cartItems.length > 0 ? totals.fat      : (cartEverHadItems ? null : undefined),
      carbs:    cartItems.length > 0 ? totals.carbs    : (cartEverHadItems ? null : undefined),
      note:     note === null     ? null   : (note     !== "" ? note                 : undefined),
      ...tagPayload,
      // Phase 2.5 新規フィールド
      sleep_hours:        sleepHours === null ? null : (sleepHours !== "" ? parseFloat(sleepHours) : undefined),
      // ルール: touched=true → hadBowelMovement の値をそのまま送信
      //           null  = 明示クリア（未記録に戻す）
      //           true  = 便通あり
      //           false = 便通なし
      //         touched=false → undefined（既存値を保持）
      had_bowel_movement: hadBowelMovementTouched ? hadBowelMovement : undefined,
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
      setCartEverHadItems(false);
      setNote("");
      setWeight("");
      setTags(emptyTagState());
      setTouchedTags(new Set());
      setSleepHours("");
      setHadBowelMovement(null);
      setHadBowelMovementTouched(false);
      setTrainingType(null);
      setTrainingTypeTouched(false);
      setWorkMode(null);
      setWorkModeTouched(false);
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const hasContent = computeHasContent({
    weight, cartItems, cartEverHadItems, note, touchedTags,
    sleepHours, hadBowelMovementTouched, trainingTypeTouched, workModeTouched,
  });

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400";
  // 明示的クリア状態（null）のときの入力欄スタイル
  const inputClearedCls =
    "w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-400 placeholder:text-rose-300 outline-none opacity-75 cursor-default";

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
          <div className="relative">
            {weight === null ? (
              <input type="number" disabled placeholder="削除予定" className={`${inputClearedCls} pr-8`} />
            ) : (
              <input type="number" step="0.1" min="0" placeholder="70.5" value={weight}
                onChange={(e) => setWeight(e.target.value)} className={`${inputCls} ${weight !== "" ? "pr-8" : ""}`} />
            )}
            {weight !== "" && weight !== null && (
              <button type="button" onClick={() => setWeight(null)} title="null 保存（クリア）"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-400 transition-colors">
                <X size={13} />
              </button>
            )}
            {weight === null && (
              <button type="button" onClick={() => setWeight("")} title="クリアを取り消す"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rose-400 hover:text-slate-500 transition-colors">
                <Undo2 size={13} />
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">メモ</label>
          <div className="relative">
            {note === null ? (
              <input type="text" disabled placeholder="削除予定" className={`${inputClearedCls} pr-8`} />
            ) : (
              <input type="text" placeholder="任意" value={note}
                onChange={(e) => setNote(e.target.value)} className={`${inputCls} ${note !== "" ? "pr-8" : ""}`} />
            )}
            {note !== "" && note !== null && (
              <button type="button" onClick={() => setNote(null)} title="null 保存（クリア）"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-400 transition-colors">
                <X size={13} />
              </button>
            )}
            {note === null && (
              <button type="button" onClick={() => setNote("")} title="クリアを取り消す"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rose-400 hover:text-slate-500 transition-colors">
                <Undo2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 特殊日タグ (is_cheat_day / is_refeed_day / is_eating_out / is_travel_day) */}
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
            <div className="relative">
              {sleepHours === null ? (
                <input type="number" disabled placeholder="削除予定" className={`${inputClearedCls} pr-8`} />
              ) : (
                <input type="number" step="0.5" min="0" max="24" placeholder="7.5"
                  value={sleepHours}
                  onChange={(e) => setSleepHours(e.target.value)}
                  className={`${inputCls} ${sleepHours !== "" ? "pr-8" : ""}`} />
              )}
              {sleepHours !== "" && sleepHours !== null && (
                <button type="button" onClick={() => setSleepHours(null)} title="null 保存（クリア）"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-400 transition-colors">
                  <X size={13} />
                </button>
              )}
              {sleepHours === null && (
                <button type="button" onClick={() => setSleepHours("")} title="クリアを取り消す"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rose-400 hover:text-slate-500 transition-colors">
                  <Undo2 size={13} />
                </button>
              )}
            </div>
          </div>
          {/* 便通 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">便通</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setHadBowelMovementTouched(true);
                  setHadBowelMovement((prev) => (prev === true ? null : true));
                }}
                className={chipCls(hadBowelMovement === true)}
              >
                あり
              </button>
              <button
                type="button"
                onClick={() => {
                  setHadBowelMovementTouched(true);
                  setHadBowelMovement((prev) => (prev === false ? null : false));
                }}
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
