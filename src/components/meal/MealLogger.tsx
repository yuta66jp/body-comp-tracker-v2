"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Loader2, PenLine, X, Undo2, ChevronDown } from "lucide-react";
import { Toast } from "@/components/ui/Toast";
import { saveDailyLog } from "@/app/actions/saveDailyLog";
import { addMealEntry } from "@/app/actions/mealEntries";
import { FoodPicker } from "./FoodPicker";
import { Cart, calcCartTotals } from "./Cart";
import type { CartItem, TempFoodItem } from "./Cart";
import { SavedMeals } from "./SavedMeals";
import { MEAL_TYPE_LABELS, MEAL_TYPES } from "@/lib/domain/meals";
import type { SaveMealItemInput } from "@/lib/domain/mealEntryPayload";
import type { FoodMaster, DailyLog, MealEntryWithItems, MealType } from "@/lib/supabase/types";
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
import { useDailyLogByDate, useDailyLogs } from "@/lib/hooks/useDailyLogs";
import { useMealEntriesByDate } from "@/lib/hooks/useMealEntries";
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
  cartEverHadItems: boolean;      // hydrate 上書き防止用: カートに一度でもアイテムが追加されたか
  note: string | null;            // null = 明示的クリア予定
  noteTouched: boolean;           // ユーザーが note を操作したか
  touchedTags: Set<DayTag>;
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
    input.noteTouched ||
    input.touchedTags.size > 0 ||
    input.hadBowelMovementTouched || // touched なら null 送信も含め有効化
    input.trainingTypeTouched ||
    input.workModeTouched
  );
}

/**
 * daily_logs 側に保存すべき変更があるかを判定する。
 */
export function computeHasDailyLogChanges(input: HasContentInput): boolean {
  return (
    input.weightTouched ||
    input.noteTouched ||
    input.touchedTags.size > 0 ||
    input.hadBowelMovementTouched ||
    input.trainingTypeTouched ||
    input.workModeTouched
  );
}

function calcFoodNutrient(
  food: FoodMaster,
  grams: number,
  key: keyof Pick<FoodMaster, "calories" | "protein" | "fat" | "carbs">
): number {
  return Math.round(((food[key] ?? 0) * grams) / 100);
}

export function buildMealItemInputs(cartItems: CartItem[]): SaveMealItemInput[] {
  return cartItems.map((item) => {
    if (item.kind === "regular") {
      return {
        source_type: "food_master",
        source_name: item.food.name,
        food_name: item.food.name,
        amount_g: item.grams,
        calories_kcal: calcFoodNutrient(item.food, item.grams, "calories"),
        protein_g: calcFoodNutrient(item.food, item.grams, "protein"),
        fat_g: calcFoodNutrient(item.food, item.grams, "fat"),
        carbs_g: calcFoodNutrient(item.food, item.grams, "carbs"),
        calories_per_100g: item.food.calories,
        protein_per_100g: item.food.protein,
        fat_per_100g: item.food.fat,
        carbs_per_100g: item.food.carbs,
      };
    }

    return {
      source_type: "temp",
      source_name: item.food.name,
      food_name: item.food.name,
      amount_g: item.food.grams,
      calories_kcal: item.food.calories,
      protein_g: item.food.protein,
      fat_g: item.food.fat,
      carbs_g: item.food.carbs,
    };
  });
}

export function hasDailyLogForDate(
  logs: Pick<DailyLog, "log_date">[] | undefined,
  hydratedLog: Pick<DailyLog, "log_date"> | null,
  fetchedLog: Pick<DailyLog, "log_date"> | null | undefined,
  isFetchingByDate: boolean,
  date: string
): boolean | null {
  if (hydratedLog?.log_date === date) return true;
  if (logs?.some((log) => log.log_date === date)) return true;
  if (fetchedLog?.log_date === date) return true;
  if (logs === undefined || isFetchingByDate) return null;
  return false;
}

function formIsPristine(input: HasContentInput): boolean {
  return !computeHasContent(input) && !input.cartEverHadItems;
}

/**
 * MealLogger の note 入力状態を saveDailyLog の 3 状態へ変換する。
 *
 * undefined — 未操作なので既存値を保持
 * null      — ユーザーが空にした、または削除予定にしたので明示クリア
 * string    — 入力値で上書き
 */
export function buildNoteSaveValue(
  note: string | null,
  noteTouched: boolean
): string | null | undefined {
  if (!noteTouched) return undefined;
  if (note === null || note === "") return null;
  return note;
}

export type NutritionTotals = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  itemCount: number;
};

const emptyNutritionTotals = (): NutritionTotals => ({
  calories: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
  itemCount: 0,
});

export function calcMealEntriesTotals(entries: MealEntryWithItems[] | undefined): NutritionTotals {
  return (entries ?? []).reduce<NutritionTotals>((entryAcc, entry) => {
    return entry.items.reduce<NutritionTotals>(
      (itemAcc, item) => ({
        calories: itemAcc.calories + (item.calories_kcal ?? 0),
        protein: itemAcc.protein + (item.protein_g ?? 0),
        fat: itemAcc.fat + (item.fat_g ?? 0),
        carbs: itemAcc.carbs + (item.carbs_g ?? 0),
        itemCount: itemAcc.itemCount + 1,
      }),
      entryAcc
    );
  }, emptyNutritionTotals());
}

function calcDailyLogTotals(log: DailyLog | null): NutritionTotals {
  if (!log) return emptyNutritionTotals();
  return {
    calories: log.calories ?? 0,
    protein: log.protein ?? 0,
    fat: log.fat ?? 0,
    carbs: log.carbs ?? 0,
    itemCount: 0,
  };
}

function addNutritionTotals(left: NutritionTotals, right: NutritionTotals): NutritionTotals {
  return {
    calories: left.calories + right.calories,
    protein: left.protein + right.protein,
    fat: left.fat + right.fat,
    carbs: left.carbs + right.carbs,
    itemCount: left.itemCount + right.itemCount,
  };
}

function cartTotalsToNutrition(cartItems: CartItem[]): NutritionTotals {
  const totals = calcCartTotals(cartItems);
  return {
    ...totals,
    itemCount: cartItems.length,
  };
}

function formatNutritionValue(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

interface MealLoggerProps {
  sidebar?: boolean; // サイドバーモード: 常時展開・縦レイアウト
  /** サイドバーモード時のみ有効。false にすると内部ヘッダー行を非表示にする */
  showHeader?: boolean;
  /**
   * 保存成功時に呼び出されるコールバック。
   * modal / bottom sheet コンテナが setOpen(false) を渡すことで
   * 保存成功後に自動クローズする。
   * 省略時は従来通り（フォームリセットのみ・閉じない）。
   */
  onSaveSuccess?: () => void;
}

export function MealLogger({ sidebar = false, showHeader = true, onSaveSuccess }: MealLoggerProps) {
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
  // カートに一度でもアイテムが追加されたか（SWR hydrate で入力中状態を上書きしないためのフラグ）
  const [cartEverHadItems, setCartEverHadItems] = useState(false);
  const [tags, setTags] = useState<ReturnType<typeof emptyTagState>>(emptyTagState);
  // 明示的にトグルされたタグのみ追跡する（未操作タグは undefined として送り既存値を保持）
  const [touchedTags, setTouchedTags] = useState<Set<DayTag>>(new Set());
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

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

  // MEAL アコーディオンの開閉状態（null = 初期表示・日付変更後・保存後は全て閉じる）
  const [activeMealType, setActiveMealType] = useState<MealType | null>(null);

  const cachedDailyLog = useMemo(
    () => logs?.find((l) => l.log_date === date) ?? null,
    [logs, date]
  );
  const shouldFetchDailyLogByDate = date !== "" && logs !== undefined && cachedDailyLog === null;
  const {
    data: fetchedDailyLog,
    isLoading: isDailyLogByDateLoading,
  } = useDailyLogByDate(date, shouldFetchDailyLogByDate);
  const {
    data: mealEntries,
    isLoading: isMealEntriesLoading,
    mutate: mutateMealEntries,
  } = useMealEntriesByDate(date, date !== "");

  /**
   * 日付変更時にフォームを hydrate または空リセットする。
   * hydrate = 既存値の「初期表示」であり、touched フラグは立てない。
   * つまり hydrate 後に Save しても、ユーザーが操作していないフィールドは
   * payload に含まれず、partial update の安全性を維持する。
   */
  function applyHydratedValues(existingLog: DailyLog | null) {
    setHydratedLog(existingLog);

    // touched フラグをすべてリセット（hydrate は「未編集」として扱う）
    setWeightTouched(false);
    setNoteTouched(false);
    setHadBowelMovementTouched(false);
    setTrainingTypeTouched(false);
    setWorkModeTouched(false);
    setTouchedTags(new Set());

    // カートは「これから追加する食事」なので日付変更時にリセット
    setCartItems([]);
    setCartEverHadItems(false);
    setActiveMealType(null);

    if (existingLog) {
      // 既存値をフォームへ表示（touched は立てない）
      setWeight(existingLog.weight !== null ? String(existingLog.weight) : "");
      setNote(existingLog.note ?? "");
      setHadBowelMovement(existingLog.had_bowel_movement ?? null);
      setTrainingType((existingLog.training_type as TrainingType) ?? null);
      setWorkMode((existingLog.work_mode as WorkMode) ?? null);
      setTags({
        is_cheat_day:   existingLog.is_cheat_day   ?? false,
        is_refeed_day:  existingLog.is_refeed_day  ?? false,
        is_eating_out:  existingLog.is_eating_out  ?? false,
        is_travel_day:  existingLog.is_travel_day  ?? false,
        is_tanning_day: existingLog.is_tanning_day ?? false,
        is_posing_day:  existingLog.is_posing_day  ?? false,
      });
    } else {
      // 新規日付: 空フォームにリセット
      setWeight("");
      setNote("");
      setHadBowelMovement(null);
      setTrainingType(null);
      setWorkMode(null);
      setTags(emptyTagState());
    }
  }

  function hydrateForm(newDate: string) {
    const existingLog = logs?.find((l) => l.log_date === newDate) ?? null;
    applyHydratedValues(existingLog);
  }

  function handleDateChange(newDate: string) {
    setDate(newDate);
    hydrateForm(newDate);
  }

  // SWR 初回ロード完了後に選択中日付の既存値を自動 prefill する (#555)
  //
  // マウント直後は logs が undefined（SWR 未解決）のため空フォームで表示される。
  // logs が揃ったタイミングで hydrateForm を呼び出し、当日ログを初期表示に反映する。
  //
  // 実行条件:
  //   1. logs が resolved（undefined → 配列）になった初回のみ
  //   2. フォームが pristine（ユーザーが何も操作していない）であること
  //      → SWR 解決前にユーザーが入力を始めていた場合は上書きしない
  //
  // initialHydrateDone で「1回のみ」を保証し、以降の SWR 再検証や
  // 保存後 mutate では再実行しない。
  const initialHydrateDone = useRef(false);
  useEffect(() => {
    if (initialHydrateDone.current) return;
    if (logs === undefined) return;
    // SWR が解決した時点で一度だけ実行する（pristine チェックの有無に関わらず）
    initialHydrateDone.current = true;
    // touched フラグが1つでも立っていたらユーザーが既に操作済みとみなして skip
    if (
      weightTouched || noteTouched ||
      hadBowelMovementTouched || trainingTypeTouched || workModeTouched ||
      touchedTags.size > 0 || cartEverHadItems
    ) return;
    hydrateForm(date);
    // touched 系フラグ・hydrateForm・date は deps から意図的に除外する。
    // touched 系: logs 変化時のスナップショットとして読むだけで、
    //   deps に含めるとユーザー操作ごとに再実行されてしまう。
    // hydrateForm: 毎レンダーで新しい関数参照になるため deps に含めると無限ループになる。
    // date: 初回ロード時点の selectedDate で固定するため除外。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs]);

  useEffect(() => {
    if (!shouldFetchDailyLogByDate) return;
    if (isDailyLogByDateLoading) return;
    if (shouldFetchDailyLogByDate && fetchedDailyLog === undefined) return;
    if (!formIsPristine({
      weight, weightTouched, cartItems, cartEverHadItems,
      note, noteTouched, touchedTags,
      hadBowelMovementTouched, trainingTypeTouched, workModeTouched,
    })) return;

    applyHydratedValues(cachedDailyLog ?? fetchedDailyLog ?? null);
    // 日付指定 fetch が後から返ったときだけ、未操作フォームへ反映する。
    // SWR 再検証で再実行されても、未操作フォームなら最新の補完値へ同期してよい。
    // touched 系を deps に含めるとユーザー操作ごとに再評価されるため、スナップショットとして読む。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shouldFetchDailyLogByDate,
    isDailyLogByDateLoading,
    fetchedDailyLog,
    cachedDailyLog,
  ]);

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
          const existingItem = next[existing]!;
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

  function toggleMealAccordion(type: MealType) {
    setCartItems([]);
    setCartEverHadItems(false);
    setActiveMealType((prev) => (prev === type ? null : type));
  }

  async function handleSave() {
    // 二重送信ガード: saving 中は呼び出し元（ボタン以外の経路含む）からの再起動を防ぐ
    if (status === "saving") return;

    setStatus("saving");

    try {
      const hasDailyLogChanges = computeHasDailyLogChanges({
        weight, weightTouched, cartItems, cartEverHadItems,
        note, noteTouched, touchedTags,
        hadBowelMovementTouched, trainingTypeTouched, workModeTouched,
      });
      const mealItemsToSave = buildMealItemInputs(cartItems);

      if (hasDailyLogChanges) {
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
          note:     buildNoteSaveValue(note, noteTouched),
          ...tagPayload,
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
          return;
        }
      }

      if (mealItemsToSave.length > 0) {
        if (!activeMealType) {
          setErrorMessage("追加先のMEALを開いてから保存してください");
          setStatus("error");
          setTimeout(() => { setStatus("idle"); setErrorMessage(""); }, 5000);
          return;
        }

        const result = await addMealEntry({
          log_date: date,
          meal_type: activeMealType,
          items: mealItemsToSave,
        });

        if (!result.ok) {
          console.error("[MealLogger] meal save error:", result.message);
          setErrorMessage(result.message);
          setStatus("error");
          setTimeout(() => { setStatus("idle"); setErrorMessage(""); }, 5000);
          return;
        }
      }

      // ── 保存成功 ──
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
      setHadBowelMovement(null);
      setHadBowelMovementTouched(false);
      setTrainingType(null);
      setTrainingTypeTouched(false);
      setWorkMode(null);
      setWorkModeTouched(false);
      setActiveMealType(null);
      // SWR キャッシュを更新して次回 hydrate に最新ログを反映させる
      void mutateLogs();
      void mutateMealEntries();
      setTimeout(() => setStatus("idle"), 2000);
      // 保存成功コールバック: Toast が少し見えてから modal / sheet を閉じる
      if (onSaveSuccess) setTimeout(onSaveSuccess, 800);
    } catch (e) {
      // 予期しない例外のフォールバック。
      // これがないと status が "saving" のまま固まり、保存ボタンが永久に押せなくなる。
      console.error("[MealLogger] unexpected error:", e);
      setErrorMessage("予期しないエラーが発生しました");
      setStatus("error");
      setTimeout(() => { setStatus("idle"); setErrorMessage(""); }, 5000);
    }
  }

  const hasContent = computeHasContent({
    weight, weightTouched, cartItems, cartEverHadItems,
    note, noteTouched, touchedTags,
    hadBowelMovementTouched, trainingTypeTouched, workModeTouched,
  });

  const mealEntriesByType = useMemo(() => {
    const map = new Map<MealType, MealEntryWithItems[]>();
    for (const type of MEAL_TYPES) {
      map.set(type, (mealEntries ?? []).filter((entry) => entry.meal_type === type));
    }
    return map;
  }, [mealEntries]);

  const savedDailyTotals = useMemo(() => calcMealEntriesTotals(mealEntries), [mealEntries]);
  const cartTotals = useMemo(() => cartTotalsToNutrition(cartItems), [cartItems]);
  const legacyDailyTotals = calcDailyLogTotals(hydratedLog);
  const dailyTotalsBase = savedDailyTotals.itemCount > 0 ? savedDailyTotals : legacyDailyTotals;
  const displayedDailyTotals = cartItems.length > 0
    ? addNutritionTotals(dailyTotalsBase, cartTotals)
    : dailyTotalsBase;
  const isLegacyDailyTotals =
    savedDailyTotals.itemCount === 0 &&
    hydratedLog !== null &&
    (hydratedLog.calories !== null ||
      hydratedLog.protein !== null ||
      hydratedLog.fat !== null ||
      hydratedLog.carbs !== null);
  const includesDraftCartTotals = cartItems.length > 0;

  const inputCls =
    "w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:border-blue-500 dark:focus:ring-blue-900/40";
  // date/time input 専用: iOS Chrome/Safari の type="date"/"time" は native widget の最小幅が
  // CSS width:100% を上書きする。appearance-none で native スタイルをリセットし
  // CSS が幅を完全制御できるようにする（ピッカー機能自体は維持される）
  const dateTimeInputCls = `${inputCls} block max-w-full box-border appearance-none`;
  // 明示的クリア状態（null）のときの入力欄スタイル（pr-8 不要 — オーバーレイボタンは外に出す）
  const inputClearedCls =
    "w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-400 placeholder:text-rose-300 outline-none opacity-75 cursor-default dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-400 dark:placeholder:text-rose-700/70";

  const chipCls = (active: boolean) =>
    `rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
      active
        ? "border-blue-400 bg-blue-600 text-white"
        : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-600"
    }`;

  const content = (
    <div className={sidebar ? "flex flex-col gap-4 min-w-0 overflow-hidden" : "border-t border-slate-100 px-5 pb-5 pt-4"}>
      {/* 日付・体重・メモ */}
      <div className={`grid gap-3 min-w-0 ${sidebar ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
        <div className="min-w-0">
          <label htmlFor="meal-log-date" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">日付</label>
          <input id="meal-log-date" type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} className={dateTimeInputCls} style={{ width: "100%", minWidth: "0" }} />
          {/* 既存ログあり / 新規入力 バッジ */}
          {hydratedLog ? (
            <p className="mt-1 text-xs font-medium text-amber-600">既存ログあり — 差分のみ編集できます</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">新規入力</p>
          )}
          {/* 日付が入力済みのときにクリアボタンを表示 */}
          {date !== "" && (
            <button
              type="button"
              onClick={() => handleDateChange("")}
              className="mt-1 text-[10px] text-slate-400 underline hover:text-rose-400 transition-colors"
            >
              日付をクリア
            </button>
          )}
        </div>
        <div>
          <label htmlFor="meal-log-weight" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">体重 (kg)</label>
          <div className="relative">
            {weight === null ? (
              <input type="number" disabled placeholder="削除予定" className={inputClearedCls} />
            ) : (
              <input id="meal-log-weight" type="number" inputMode="decimal" step="0.1" min="0" placeholder="70.5" value={weight}
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
          <label htmlFor="meal-log-note" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">メモ</label>
          <div className="relative">
            {note === null ? (
              <input type="text" disabled placeholder="削除予定" className={inputClearedCls} />
            ) : (
              <input id="meal-log-note" type="text" placeholder="任意" value={note}
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

      {/* 特殊日タグ (is_cheat_day / is_refeed_day / is_eating_out / is_travel_day) */}
      <div className="min-w-0">
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
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-600"
              }`}
            >
              {DAY_TAG_LABELS[tag]}
            </button>
          ))}
        </div>
      </div>

      {/* コンディション */}
      <div className="min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">コンディション</p>
        <div className={`grid gap-3 min-w-0 ${sidebar ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
          {/* 便通 */}
          <div className="sm:col-span-2">
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

      {/* 1日のカロリー/PFCサマリー */}
      <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">1日のサマリー</p>
          {(isLegacyDailyTotals || includesDraftCartTotals) && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:bg-slate-900 dark:text-slate-500">
              {includesDraftCartTotals ? "入力中含む" : "既存マクロ"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">カロリー</p>
            <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">
              {formatNutritionValue(displayedDailyTotals.calories)}
              <span className="ml-1 text-xs font-medium text-slate-400">kcal</span>
            </p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">P</p>
            <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">
              {formatNutritionValue(displayedDailyTotals.protein)}
              <span className="ml-1 text-xs font-medium text-slate-400">g</span>
            </p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">F</p>
            <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">
              {formatNutritionValue(displayedDailyTotals.fat)}
              <span className="ml-1 text-xs font-medium text-slate-400">g</span>
            </p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">C</p>
            <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">
              {formatNutritionValue(displayedDailyTotals.carbs)}
              <span className="ml-1 text-xs font-medium text-slate-400">g</span>
            </p>
          </div>
        </div>
      </div>

      {/* MEAL 1〜4 / Other アコーディオン */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">食事</p>
        {MEAL_TYPES.map((type) => {
          const entriesForType = mealEntriesByType.get(type) ?? [];
          const savedMealTotals = calcMealEntriesTotals(entriesForType);
          const isActive = activeMealType === type;
          const isMealEntriesPending = isMealEntriesLoading && mealEntries === undefined;
          const displayedMealTotals = isActive && cartItems.length > 0
            ? addNutritionTotals(savedMealTotals, cartTotals)
            : savedMealTotals;

          return (
            <div key={type} className="overflow-hidden rounded-xl border border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => toggleMealAccordion(type)}
                aria-expanded={isActive}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {MEAL_TYPE_LABELS[type]}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {isMealEntriesPending
                      ? "読み込み中..."
                      : displayedMealTotals.itemCount > 0
                      ? `${displayedMealTotals.itemCount}品 / ${formatNutritionValue(displayedMealTotals.calories)} kcal`
                      : "食品なし"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                  <span className="hidden sm:inline">
                    P {formatNutritionValue(displayedMealTotals.protein)}g / F {formatNutritionValue(displayedMealTotals.fat)}g / C {formatNutritionValue(displayedMealTotals.carbs)}g
                  </span>
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${isActive ? "rotate-180" : ""}`}
                  />
                </span>
              </button>

              {isActive && (
                <div className="flex flex-col gap-3 border-t border-slate-100 px-3 py-3 dark:border-slate-700">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">食品追加</p>
                    <FoodPicker onAdd={addFood} onAddSet={addFromMenu} onAddTemp={addTempFood} />
                  </div>
                  {cartItems.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">カート</p>
                      <Cart items={cartItems} onChange={setCartItems} />
                    </div>
                  )}
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">保存済み</p>
                    <SavedMeals
                      entries={mealEntries === undefined ? undefined : entriesForType}
                      isLoading={isMealEntriesLoading}
                      onChanged={() => {
                        void mutateMealEntries();
                        void mutateLogs();
                      }}
                    />
                  </div>
                  <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    <span className="font-semibold">MEAL小計:</span>{" "}
                    {formatNutritionValue(displayedMealTotals.calories)} kcal / P {formatNutritionValue(displayedMealTotals.protein)}g F {formatNutritionValue(displayedMealTotals.fat)}g C {formatNutritionValue(displayedMealTotals.carbs)}g
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 保存ボタン */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleSave}
          disabled={status === "saving" || !hasContent || !date}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:opacity-40"
        >
          {status === "saving"
            ? <><Loader2 size={14} className="animate-spin" /> 保存中...</>
            : <>保存</>}
        </button>
      </div>

      {/* Toast 通知（fixed 配置・保存成功/失敗） */}
      <Toast
        type={status === "error" ? "error" : "success"}
        message={status === "error" ? (errorMessage || "保存に失敗しました") : "保存しました"}
        visible={status === "saved" || status === "error"}
      />
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
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50">
          <PenLine size={15} className="text-blue-600" />
        </div>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">食事ログを入力</span>
      </div>
      {content}
    </div>
  );
}
