"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, PenLine, X, Undo2 } from "lucide-react";
import { saveDailyLog } from "@/app/actions/saveDailyLog";
import { FoodPicker } from "./FoodPicker";
import { Cart, calcCartTotals } from "./Cart";
import type { CartItem, TempFoodItem } from "./Cart";
import type { FoodMaster, DailyLog } from "@/lib/supabase/types";
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
import { useDailyLogs } from "@/lib/hooks/useDailyLogs";
import { parseStrictNumber } from "@/lib/utils/parseNumber";

type SaveStatus = "idle" | "saving" | "saved" | "error";

function todayStr() {
  return toJstDateStr();
}

/** hasContent 判定のための純粋関数（テスト容易性のために抽出） */
export interface HasContentInput {
  weight: string | null;          // null = 明示的クリア予定
  weightTouched: boolean;         // ユーザーが weight を操作したか（hydrate のみでは false）
  cartItems: CartItem[];
  cartEverHadItems: boolean;      // カートに一度でもアイテムが追加されたか
  note: string | null;            // null = 明示的クリア予定
  noteTouched: boolean;           // ユーザーが note を操作したか
  touchedTags: Set<DayTag>;
  sleepHours: string | null;      // null = 明示的クリア予定
  sleepHoursTouched: boolean;     // ユーザーが sleepHours を操作したか
  hadBowelMovementTouched: boolean; // ボタンを一度でも操作したか
  trainingTypeTouched: boolean;
  workModeTouched: boolean;
}

export function computeHasContent(input: HasContentInput): boolean {
  return (
    // touched フラグで「ユーザーが操作した」ことを判定する。
    // hydrate のみの場合は touched=false のため hasContent=false になり、
    // 保存ボタンが有効にならず、不要な更新も送信されない。
    input.weightTouched ||
    input.cartItems.length > 0 ||
    input.cartEverHadItems ||       // カートを空にした場合も null 送信のため有効化
    input.noteTouched ||
    input.touchedTags.size > 0 ||
    input.sleepHoursTouched ||
    input.hadBowelMovementTouched || // touched なら null 送信も含め有効化
    input.trainingTypeTouched ||
    input.workModeTouched
  );
}

interface MealLoggerProps {
  sidebar?: boolean; // サイドバーモード: 常時展開・縦レイアウト
  /** サイドバーモード時のみ有効。false にすると内部ヘッダー行を非表示にする */
  showHeader?: boolean;
}

export function MealLogger({ sidebar = false, showHeader = true }: MealLoggerProps) {
  // 既存ログ（SWR キャッシュ。日付変更時の hydrate に使用）
  const { data: logs, mutate: mutateLogs } = useDailyLogs();

  // hydrate 元のログ（null = 新規入力）
  const [hydratedLog, setHydratedLog] = useState<DailyLog | null>(null);

  // ── 既存フィールド ──
  const [date, setDate] = useState(todayStr);
  // string | null: "" = 未入力, "70.5" = 入力値, null = 明示的クリア予定（null 送信）
  const [weight, setWeight] = useState<string | null>("");
  // weightTouched=true → ユーザーが weight を操作した（hydrate のみでは false）
  const [weightTouched, setWeightTouched] = useState(false);
  const [note, setNote] = useState<string | null>("");
  const [noteTouched, setNoteTouched] = useState(false);
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
  const [sleepHoursTouched, setSleepHoursTouched] = useState(false);
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

  /**
   * 日付変更時にフォームを hydrate または空リセットする。
   * hydrate = 既存値の「初期表示」であり、touched フラグは立てない。
   * つまり hydrate 後に Save しても、ユーザーが操作していないフィールドは
   * payload に含まれず、partial update の安全性を維持する。
   */
  function hydrateForm(newDate: string) {
    const existingLog = logs?.find((l) => l.log_date === newDate) ?? null;
    setHydratedLog(existingLog);

    // touched フラグをすべてリセット（hydrate は「未編集」として扱う）
    setWeightTouched(false);
    setNoteTouched(false);
    setSleepHoursTouched(false);
    setHadBowelMovementTouched(false);
    setTrainingTypeTouched(false);
    setWorkModeTouched(false);
    setTouchedTags(new Set());

    // カートはマクロ値から復元不可のためリセット
    setCartItems([]);
    setCartEverHadItems(false);

    if (existingLog) {
      // 既存値をフォームへ表示（touched は立てない）
      setWeight(existingLog.weight !== null ? String(existingLog.weight) : "");
      setNote(existingLog.note ?? "");
      setSleepHours(existingLog.sleep_hours !== null ? String(existingLog.sleep_hours) : "");
      setHadBowelMovement(existingLog.had_bowel_movement ?? null);
      setTrainingType((existingLog.training_type as TrainingType) ?? null);
      setWorkMode((existingLog.work_mode as WorkMode) ?? null);
      setTags({
        is_cheat_day:  existingLog.is_cheat_day  ?? false,
        is_refeed_day: existingLog.is_refeed_day ?? false,
        is_eating_out: existingLog.is_eating_out ?? false,
        is_travel_day: existingLog.is_travel_day ?? false,
      });
    } else {
      // 新規日付: 空フォームにリセット
      setWeight("");
      setNote("");
      setSleepHours("");
      setHadBowelMovement(null);
      setTrainingType(null);
      setWorkMode(null);
      setTags(emptyTagState());
    }
  }

  function handleDateChange(newDate: string) {
    setDate(newDate);
    hydrateForm(newDate);
  }

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
      const existing = prev.findIndex(
        (item) => item.kind === "regular" && item.food.name === food.name
      );
      if (existing >= 0) {
        return prev.map((item, i) => {
          if (i === existing && item.kind === "regular") {
            return { ...item, grams: item.grams + 100 };
          }
          return item;
        });
      }
      return [...prev, { kind: "regular" as const, food, grams: 100 }];
    });
  }

  function addFromMenu(items: CartItem[]) {
    setCartEverHadItems(true);
    setCartItems((prev) => {
      const next = [...prev];
      for (const item of items) {
        if (item.kind !== "regular") continue;
        const existing = next.findIndex(
          (c) => c.kind === "regular" && c.food.name === item.food.name
        );
        if (existing >= 0) {
          const existingItem = next[existing];
          if (existingItem.kind === "regular") {
            next[existing] = { ...existingItem, grams: existingItem.grams + item.grams };
          }
        } else {
          next.push(item);
        }
      }
      return next;
    });
  }

  function addTempFood(food: TempFoodItem) {
    setCartEverHadItems(true);
    setCartItems((prev) => [...prev, { kind: "temp" as const, food }]);
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
      // touched=true かつユーザーが操作した場合のみ送信。
      // touched=false (hydrate のみ) は undefined → 既存値を保持。
      weight:   weightTouched
        ? (weight === null   ? null   : parseStrictNumber(weight)   ?? undefined)
        : undefined,
      // カートに一度でも追加後に空にした → null 送信（マクロをクリア）
      calories: cartItems.length > 0 ? totals.calories : (cartEverHadItems ? null : undefined),
      protein:  cartItems.length > 0 ? totals.protein  : (cartEverHadItems ? null : undefined),
      fat:      cartItems.length > 0 ? totals.fat      : (cartEverHadItems ? null : undefined),
      carbs:    cartItems.length > 0 ? totals.carbs    : (cartEverHadItems ? null : undefined),
      note:     noteTouched
        ? (note === null     ? null   : (note     !== "" ? note                 : undefined))
        : undefined,
      ...tagPayload,
      // Phase 2.5 新規フィールド
      sleep_hours: sleepHoursTouched
        ? (sleepHours === null ? null : parseStrictNumber(sleepHours) ?? undefined)
        : undefined,
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
      // フォームをリセット（保存後は空フォームに戻す）
      setHydratedLog(null);
      setCartItems([]);
      setCartEverHadItems(false);
      setWeight("");
      setWeightTouched(false);
      setNote("");
      setNoteTouched(false);
      setTags(emptyTagState());
      setTouchedTags(new Set());
      setSleepHours("");
      setSleepHoursTouched(false);
      setHadBowelMovement(null);
      setHadBowelMovementTouched(false);
      setTrainingType(null);
      setTrainingTypeTouched(false);
      setWorkMode(null);
      setWorkModeTouched(false);
      // SWR キャッシュを更新して次回 hydrate に最新ログを反映させる
      void mutateLogs();
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const hasContent = computeHasContent({
    weight, weightTouched, cartItems, cartEverHadItems,
    note, noteTouched, touchedTags,
    sleepHours, sleepHoursTouched,
    hadBowelMovementTouched, trainingTypeTouched, workModeTouched,
  });

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400";
  // 明示的クリア状態（null）のときの入力欄スタイル（pr-8 不要 — オーバーレイボタンは外に出す）
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
          <input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} className={inputCls} />
          {/* 既存ログあり / 新規入力 バッジ */}
          {hydratedLog ? (
            <p className="mt-1 text-xs font-medium text-amber-600">既存ログあり — 差分のみ編集できます</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">新規入力</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">体重 (kg)</label>
          <div className="relative">
            {weight === null ? (
              <input type="number" disabled placeholder="削除予定" className={inputClearedCls} />
            ) : (
              <input type="number" step="0.1" min="0" placeholder="70.5" value={weight}
                onChange={(e) => { setWeight(e.target.value); setWeightTouched(true); }}
                className={`${inputCls} ${weight !== "" ? "pr-8" : ""}`} />
            )}
            {weight !== "" && weight !== null && (
              <button type="button"
                onClick={() => { setWeight(null); setWeightTouched(true); }}
                aria-label="体重を削除予定にする"
                title="保存時にこの値を削除する"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-rose-400 transition-colors">
                <X size={15} />
              </button>
            )}
          </div>
          {weight === null && (
            <p className="mt-1 flex items-center gap-1 text-xs text-rose-500">
              <Undo2 size={11} className="shrink-0" />
              <span>
                {hydratedLog?.weight !== null && hydratedLog?.weight !== undefined
                  ? `保存すると体重 (${hydratedLog.weight} kg) を削除します。`
                  : "保存時に体重を空欄で送信します。"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setWeight(hydratedLog?.weight !== null && hydratedLog?.weight !== undefined
                    ? String(hydratedLog.weight)
                    : "");
                  setWeightTouched(false);
                }}
                className="underline font-medium"
              >
                元に戻す
              </button>
            </p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">メモ</label>
          <div className="relative">
            {note === null ? (
              <input type="text" disabled placeholder="削除予定" className={inputClearedCls} />
            ) : (
              <input type="text" placeholder="任意" value={note}
                onChange={(e) => { setNote(e.target.value); setNoteTouched(true); }}
                className={`${inputCls} ${note !== "" ? "pr-8" : ""}`} />
            )}
            {note !== "" && note !== null && (
              <button type="button"
                onClick={() => { setNote(null); setNoteTouched(true); }}
                aria-label="メモを削除予定にする"
                title="保存時にこの値を削除する"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-rose-400 transition-colors">
                <X size={15} />
              </button>
            )}
          </div>
          {note === null && (
            <p className="mt-1 flex items-center gap-1 text-xs text-rose-500">
              <Undo2 size={11} className="shrink-0" />
              <span>
                {hydratedLog?.note
                  ? "保存するとメモを削除します。"
                  : "保存時にメモを空欄で送信します。"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setNote(hydratedLog?.note ?? "");
                  setNoteTouched(false);
                }}
                className="underline font-medium"
              >
                元に戻す
              </button>
            </p>
          )}
        </div>
      </div>

      {/* 既存ログのマクロ表示（カートで復元不可なため参照用に表示） */}
      {hydratedLog && (hydratedLog.calories !== null || hydratedLog.protein !== null) && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span className="font-semibold">記録済みマクロ:</span>{" "}
          {hydratedLog.calories !== null && <span>{hydratedLog.calories} kcal</span>}
          {hydratedLog.protein  !== null && <span> / P {hydratedLog.protein}g</span>}
          {hydratedLog.fat      !== null && <span> / F {hydratedLog.fat}g</span>}
          {hydratedLog.carbs    !== null && <span> / C {hydratedLog.carbs}g</span>}
          <span className="ml-1 text-amber-600">（更新する場合はカートから追加）</span>
        </div>
      )}

      {/* 特殊日タグ (is_cheat_day / is_refeed_day / is_eating_out / is_travel_day) */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">特殊日</p>
        <div className="grid grid-cols-3 gap-2">
          {DAY_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={!!tags[tag as keyof typeof tags]}
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
                <input type="number" disabled placeholder="削除予定" className={inputClearedCls} />
              ) : (
                <input type="number" step="0.5" min="0" max="24" placeholder="7.5"
                  value={sleepHours}
                  onChange={(e) => { setSleepHours(e.target.value); setSleepHoursTouched(true); }}
                  className={`${inputCls} ${sleepHours !== "" ? "pr-8" : ""}`} />
              )}
              {sleepHours !== "" && sleepHours !== null && (
                <button type="button"
                  onClick={() => { setSleepHours(null); setSleepHoursTouched(true); }}
                  aria-label="睡眠時間を削除予定にする"
                  title="保存時にこの値を削除する"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-rose-400 transition-colors">
                  <X size={15} />
                </button>
              )}
            </div>
            {sleepHours === null && (
              <p className="mt-1 flex items-center gap-1 text-xs text-rose-500">
                <Undo2 size={11} className="shrink-0" />
                <span>
                  {hydratedLog?.sleep_hours !== null && hydratedLog?.sleep_hours !== undefined
                    ? `保存すると睡眠時間 (${hydratedLog.sleep_hours} h) を削除します。`
                    : "保存時に睡眠時間を空欄で送信します。"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSleepHours(hydratedLog?.sleep_hours !== null && hydratedLog?.sleep_hours !== undefined
                      ? String(hydratedLog.sleep_hours)
                      : "");
                    setSleepHoursTouched(false);
                  }}
                  className="underline font-medium"
                >
                  元に戻す
                </button>
              </p>
            )}
          </div>
          {/* 便通 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">便通</label>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={hadBowelMovement === true}
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
                aria-pressed={hadBowelMovement === false}
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
              aria-pressed={trainingType === type}
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
              aria-pressed={workMode === mode}
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
        <FoodPicker onAdd={addFood} onAddSet={addFromMenu} onAddTemp={addTempFood} />
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
        {showHeader && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50">
              <PenLine size={15} className="text-blue-600" />
            </div>
            <span className="text-sm font-semibold text-slate-700">食事ログ</span>
          </div>
        )}
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
