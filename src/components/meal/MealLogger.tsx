"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Loader2, PenLine, X, Undo2, ChevronDown, Plus } from "lucide-react";
import { Toast } from "@/components/ui/Toast";
import { saveDailyLog } from "@/app/actions/saveDailyLog";
import { saveSleepSession, deleteSleepSession } from "@/app/actions/saveSleepSession";
import { FoodPicker } from "./FoodPicker";
import { Cart, calcCartTotals } from "./Cart";
import type { CartItem, TempFoodItem } from "./Cart";
import type { FoodMaster, DailyLog, SleepSession } from "@/lib/supabase/types";
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
import { useSleepSessionByDate, useSleepSessions } from "@/lib/hooks/useSleepSessions";
import { parseStrictNumber } from "@/lib/utils/parseNumber";
import { buildSleepSessionDatetimes, calcSleepDurationHours, extractJstHHMM } from "@/lib/utils/sleepSession";

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
  sleepSessionTouched: boolean;  // 就寝/起床時刻を変更またはセッションを削除操作したか
  hadBowelMovementTouched: boolean; // ボタンを一度でも操作したか
  trainingTypeTouched: boolean;
  workModeTouched: boolean;
  lastMealEndTimeTouched: boolean;
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
    input.sleepSessionTouched ||   // 就寝/起床入力 or セッション削除操作
    input.hadBowelMovementTouched || // touched なら null 送信も含め有効化
    input.trainingTypeTouched ||
    input.workModeTouched ||
    input.lastMealEndTimeTouched
  );
}

/**
 * daily_logs 側に保存すべき変更があるかを判定する。
 *
 * sleepSessionTouched は sleep_sessions への変更を示し daily_logs とは独立しているため、
 * この関数では含めない。handleSave で saveDailyLog を呼ぶ前に必ずチェックし、
 * 睡眠のみ変更された場合に「保存するデータがありません」エラーを防ぐ。
 */
export function computeHasDailyLogChanges(input: HasContentInput): boolean {
  return (
    input.weightTouched ||
    input.cartItems.length > 0 ||
    input.cartEverHadItems ||
    input.noteTouched ||
    input.touchedTags.size > 0 ||
    input.hadBowelMovementTouched ||
    input.trainingTypeTouched ||
    input.workModeTouched ||
    input.lastMealEndTimeTouched
    // sleepSessionTouched は sleep_sessions 側の変更。daily_logs には含めない。
  );
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
  return !computeHasContent(input);
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
  // 睡眠セッション（SWR キャッシュ。sleep_sessions が source of truth）
  const { data: sleepSessions, mutate: mutateSleepSessions } = useSleepSessions();

  // hydrate 元のログ（null = 新規入力）
  const [hydratedLog, setHydratedLog] = useState<DailyLog | null>(null);
  // hydrate 元の睡眠セッション（null = このwake_dateに睡眠記録なし）
  const [hydratedSleepSession, setHydratedSleepSession] = useState<SleepSession | null>(null);

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
  // 睡眠セッション (sleep_sessions が source of truth)
  // sleepBedTime: "" = 未入力, "HH:MM" = 就寝時刻
  // sleepWakeTime: "" = 未入力, "HH:MM" = 起床時刻
  // sleepSessionTouched: true のとき保存ボタンが有効化（入力 or 削除操作）
  // sleepSessionPendingDelete: true のとき削除予定状態
  const [sleepBedTime, setSleepBedTime] = useState("");
  const [sleepWakeTime, setSleepWakeTime] = useState("");
  const [sleepSessionTouched, setSleepSessionTouched] = useState(false);
  const [sleepSessionPendingDelete, setSleepSessionPendingDelete] = useState(false);
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

  // ── #435 追加: 食事タイミング ──
  // "" = 未入力, "HH:MM" = 入力値。null は使わない（time input はクリアで "" になる）
  const [lastMealEndTime, setLastMealEndTime] = useState("");
  const [lastMealEndTimeTouched, setLastMealEndTimeTouched] = useState(false);

  // 食品を追加セクションの開閉状態（初期: 非表示）
  const [foodPickerOpen, setFoodPickerOpen] = useState(false);

  const cachedDailyLog = useMemo(
    () => logs?.find((l) => l.log_date === date) ?? null,
    [logs, date]
  );
  const shouldFetchDailyLogByDate = date !== "" && logs !== undefined && cachedDailyLog === null;
  const {
    data: fetchedDailyLog,
    isLoading: isDailyLogByDateLoading,
  } = useDailyLogByDate(date, shouldFetchDailyLogByDate);

  const cachedSleepSession = useMemo(
    () => sleepSessions?.find((s) => s.wake_date === date) ?? null,
    [sleepSessions, date]
  );
  const shouldFetchSleepSessionByDate = date !== "" && sleepSessions !== undefined && cachedSleepSession === null;
  const {
    data: fetchedSleepSession,
    isLoading: isSleepSessionByDateLoading,
  } = useSleepSessionByDate(date, shouldFetchSleepSessionByDate);

  /**
   * 日付変更時にフォームを hydrate または空リセットする。
   * hydrate = 既存値の「初期表示」であり、touched フラグは立てない。
   * つまり hydrate 後に Save しても、ユーザーが操作していないフィールドは
   * payload に含まれず、partial update の安全性を維持する。
   */
  function applyHydratedValues(
    existingLog: DailyLog | null,
    existingSleep: SleepSession | null
  ) {
    setHydratedLog(existingLog);
    setHydratedSleepSession(existingSleep);

    // touched フラグをすべてリセット（hydrate は「未編集」として扱う）
    setWeightTouched(false);
    setNoteTouched(false);
    setSleepSessionTouched(false);
    setSleepSessionPendingDelete(false);
    setHadBowelMovementTouched(false);
    setTrainingTypeTouched(false);
    setWorkModeTouched(false);
    setLastMealEndTimeTouched(false);
    setTouchedTags(new Set());

    // カートはマクロ値から復元不可のためリセット
    setCartItems([]);
    setCartEverHadItems(false);

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
      // TIME 型は "HH:MM:SS" で返るため、input[type=time] 用に "HH:MM" に切り出す
      setLastMealEndTime(existingLog.last_meal_end_time?.slice(0, 5) ?? "");
    } else {
      // 新規日付: 空フォームにリセット
      setWeight("");
      setNote("");
      setHadBowelMovement(null);
      setTrainingType(null);
      setWorkMode(null);
      setTags(emptyTagState());
      setLastMealEndTime("");
    }

    // 睡眠セッション: TIMESTAMPTZ (UTC) から JST の "HH:MM" を復元
    // Supabase は TIMESTAMPTZ を UTC 形式（例: "2026-04-07T14:30:00+00:00"）で返すため、
    // slice(11, 16) は UTC 時刻を切り出してしまう。extractJstHHMM() で JST に変換する。
    if (existingSleep) {
      setSleepBedTime(extractJstHHMM(existingSleep.bed_at) ?? "");
      setSleepWakeTime(extractJstHHMM(existingSleep.wake_at) ?? "");
    } else {
      setSleepBedTime("");
      setSleepWakeTime("");
    }
  }

  function hydrateForm(newDate: string) {
    const existingLog = logs?.find((l) => l.log_date === newDate) ?? null;
    // 睡眠セッション: sleep_sessions が source of truth
    const existingSleep = sleepSessions?.find((s) => s.wake_date === newDate) ?? null;
    applyHydratedValues(existingLog, existingSleep);
  }

  function handleDateChange(newDate: string) {
    setDate(newDate);
    hydrateForm(newDate);
  }

  // SWR 初回ロード完了後に選択中日付の既存値を自動 prefill する (#555)
  //
  // マウント直後は logs / sleepSessions が undefined（SWR 未解決）のため
  // 空フォームで表示される。両方が揃ったタイミングで hydrateForm を呼び出し
  // 当日ログや睡眠セッションを初期表示に反映する。
  //
  // 実行条件:
  //   1. logs / sleepSessions が両方 resolved（undefined → 配列）になった初回のみ
  //   2. フォームが pristine（ユーザーが何も操作していない）であること
  //      → SWR 解決前にユーザーが入力を始めていた場合は上書きしない
  //
  // initialHydrateDone で「1回のみ」を保証し、以降の SWR 再検証や
  // 保存後 mutate では再実行しない。
  const initialHydrateDone = useRef(false);
  useEffect(() => {
    if (initialHydrateDone.current) return;
    if (logs === undefined || sleepSessions === undefined) return;
    // SWR が解決した時点で一度だけ実行する（pristine チェックの有無に関わらず）
    initialHydrateDone.current = true;
    // touched フラグが1つでも立っていたらユーザーが既に操作済みとみなして skip
    if (
      weightTouched || noteTouched || sleepSessionTouched ||
      hadBowelMovementTouched || trainingTypeTouched || workModeTouched ||
      lastMealEndTimeTouched || touchedTags.size > 0 || cartEverHadItems
    ) return;
    hydrateForm(date);
    // touched 系フラグ・hydrateForm・date は deps から意図的に除外する。
    // touched 系: logs/sleepSessions 変化時のスナップショットとして読むだけで、
    //   deps に含めるとユーザー操作ごとに再実行されてしまう。
    // hydrateForm: 毎レンダーで新しい関数参照になるため deps に含めると無限ループになる。
    // date: 初回ロード時点の selectedDate で固定するため除外。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, sleepSessions]);

  useEffect(() => {
    if (!shouldFetchDailyLogByDate && !shouldFetchSleepSessionByDate) return;
    if (isDailyLogByDateLoading || isSleepSessionByDateLoading) return;
    if (shouldFetchDailyLogByDate && fetchedDailyLog === undefined) return;
    if (shouldFetchSleepSessionByDate && fetchedSleepSession === undefined) return;
    if (!formIsPristine({
      weight, weightTouched, cartItems, cartEverHadItems,
      note, noteTouched, touchedTags,
      sleepSessionTouched,
      hadBowelMovementTouched, trainingTypeTouched, workModeTouched,
      lastMealEndTimeTouched,
    })) return;

    applyHydratedValues(
      cachedDailyLog ?? fetchedDailyLog ?? null,
      cachedSleepSession ?? fetchedSleepSession ?? null
    );
    // 日付指定 fetch が後から返ったときだけ、未操作フォームへ反映する。
    // SWR 再検証で再実行されても、未操作フォームなら最新の補完値へ同期してよい。
    // touched 系を deps に含めるとユーザー操作ごとに再評価されるため、スナップショットとして読む。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shouldFetchDailyLogByDate,
    shouldFetchSleepSessionByDate,
    isDailyLogByDateLoading,
    isSleepSessionByDateLoading,
    fetchedDailyLog,
    fetchedSleepSession,
    cachedDailyLog,
    cachedSleepSession,
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

  async function handleSave() {
    // 二重送信ガード: saving 中は呼び出し元（ボタン以外の経路含む）からの再起動を防ぐ
    if (status === "saving") return;

    setStatus("saving");

    // daily_logs 保存済みフラグ。
    // sleep_sessions 保存が失敗した場合に partial save（日次ログは保存済み/睡眠は未保存）を
    // ユーザーへ正確に伝えるために使用する (#544)。
    let dailyLogSaved = false;

    try {
      // ── 睡眠入力の事前妥当性チェック ──
      // saveDailyLog より先に実行する (#528)。
      // 片側だけ入力されたまま saveDailyLog まで進むと、daily_logs が保存された後に
      // エラーが返る回帰が生じるため、何も保存する前にここでガードする。
      if (
        sleepSessionTouched &&
        !sleepSessionPendingDelete &&
        (sleepBedTime || sleepWakeTime) &&
        !(sleepBedTime && sleepWakeTime)
      ) {
        setErrorMessage("就寝時刻と起床時刻はセットで入力してください。");
        setStatus("error");
        setTimeout(() => { setStatus("idle"); setErrorMessage(""); }, 5000);
        return;
      }

      // ── daily_logs 保存（変更がある場合のみ）──
      // sleep_sessions より先に保存する (#528)。
      //
      // 【保存順序の重要性】
      // DB トリガー (trg_sync_sleep_hours) は sleep_sessions の INSERT/UPDATE 後に
      // `UPDATE daily_logs SET sleep_hours=... WHERE log_date=wake_date` を実行する。
      // 新規日付の場合、saveSleepSession を先に呼ぶとトリガーが発火した時点で
      // daily_logs 行がまだ存在せず、UPDATE が 0 行で終わって sleep_hours が null のまま残る。
      // daily_logs を先に作成してから saveSleepSession を呼ぶことで、
      // トリガーが正しく sleep_hours を書き込める。
      //
      // 既存 daily_logs 行がある日付の睡眠だけ変更では daily_logs 更新は不要。
      // 新規日付では sleep_sessions トリガーの更新先がないため、睡眠だけ保存は後続で弾く。
      const hasDailyLogChanges = computeHasDailyLogChanges({
        weight, weightTouched, cartItems, cartEverHadItems,
        note, noteTouched, touchedTags,
        sleepSessionTouched, // 渡すが computeHasDailyLogChanges 内では無視される
        hadBowelMovementTouched, trainingTypeTouched, workModeTouched,
        lastMealEndTimeTouched,
      });

      const existingDailyLog = hasDailyLogForDate(
        logs,
        hydratedLog,
        fetchedDailyLog,
        isDailyLogByDateLoading,
        date
      );
      if (
        sleepSessionTouched &&
        !sleepSessionPendingDelete &&
        !hasDailyLogChanges &&
        existingDailyLog !== true &&
        sleepBedTime &&
        sleepWakeTime
      ) {
        const message = existingDailyLog === null
          ? "既存ログを確認中です。少し待ってからもう一度保存してください。"
          : "新しい日付で睡眠記録を保存するには、体重も入力してください。";
        setErrorMessage(message);
        setStatus("error");
        setTimeout(() => { setStatus("idle"); setErrorMessage(""); }, 5000);
        return;
      }

      if (hasDailyLogChanges) {
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
          // 時刻: touched かつ非空 → 値保存、touched かつ空 → null（明示クリア）、未操作 → undefined
          last_meal_end_time: lastMealEndTimeTouched ? (lastMealEndTime !== "" ? lastMealEndTime : null) : undefined,
        });

        if (!result.ok) {
          console.error("[MealLogger] save error:", result.message);
          setErrorMessage(result.message);
          setStatus("error");
          setTimeout(() => { setStatus("idle"); setErrorMessage(""); }, 5000);
          return;
        }
        // saveDailyLog 成功。以降の sleep 保存失敗時に partial save を検知するために記録する (#544)。
        dailyLogSaved = true;
      }

      // ── 睡眠セッション保存（sleep_sessions が source of truth）──
      // daily_logs より後に保存する (#528)。
      // DB トリガー (trg_sync_sleep_hours) が daily_logs.sleep_hours を更新するとき、
      // daily_logs 行が既に存在している必要がある。
      // 既存日はどちらの順序でも動作するが、新規日でも正しく動作するよう
      // daily_logs を先に保存する順序を維持すること。
      if (sleepSessionTouched) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[MealLogger] sleep save attempt:", {
            date, sleepBedTime, sleepWakeTime,
            sleepSessionPendingDelete,
            hasHydratedSession: hydratedSleepSession !== null,
          });
        }

        let sleepResult: { ok: boolean; message?: string };
        try {
          if (sleepSessionPendingDelete && hydratedSleepSession) {
            // セッション削除
            sleepResult = await deleteSleepSession(date);
          } else if (sleepBedTime && sleepWakeTime) {
            // セッション保存（新規 or 上書き）
            sleepResult = await saveSleepSession({
              wake_date: date,
              bed_time:  sleepBedTime,
              wake_time: sleepWakeTime,
            });
          } else {
            // 両方空 (操作なし) → スキップ
            // 片側入力は tryブロック冒頭の事前チェックで弾いているため、ここには到達しない。
            sleepResult = { ok: true };
          }
        } catch (sleepError) {
          // Server Action 境界の想定外例外（ネットワーク障害など）のフォールバック。
          // saveSleepSession.ts 側の try/catch で通常は捕捉されるが、
          // 万一 throw が伝播した場合でも generic catch に落とさずここで止める (#544)。
          console.error("[MealLogger] sleep session action threw:", sleepError);
          sleepResult = { ok: false, message: "睡眠記録の保存に失敗しました" };
        }

        if (!sleepResult.ok) {
          // partial save（日次ログは保存済み / 睡眠記録は未保存）のとき、
          // ユーザーに実態を伝えるメッセージを優先する (#544)。
          const sleepErrorMsg = dailyLogSaved
            ? "日次ログは保存されましたが、睡眠記録の保存に失敗しました。再度睡眠時刻を入力して保存できます。"
            : (sleepResult.message ?? "睡眠記録の保存に失敗しました");
          console.error("[MealLogger] sleep save failed:", { dailyLogSaved, message: sleepResult.message });
          setErrorMessage(sleepErrorMsg);
          setStatus("error");
          setTimeout(() => { setStatus("idle"); setErrorMessage(""); }, 5000);
          return;
        }
      }

      // ── 保存成功 ──
      setStatus("saved");
      // フォームをリセット（保存後は空フォームに戻す）
      setHydratedLog(null);
      setHydratedSleepSession(null);
      setCartItems([]);
      setCartEverHadItems(false);
      setWeight("");
      setWeightTouched(false);
      setNote("");
      setNoteTouched(false);
      setTags(emptyTagState());
      setTouchedTags(new Set());
      setSleepBedTime("");
      setSleepWakeTime("");
      setSleepSessionTouched(false);
      setSleepSessionPendingDelete(false);
      setHadBowelMovement(null);
      setHadBowelMovementTouched(false);
      setTrainingType(null);
      setTrainingTypeTouched(false);
      setWorkMode(null);
      setWorkModeTouched(false);
      setLastMealEndTime("");
      setLastMealEndTimeTouched(false);
      // SWR キャッシュを更新して次回 hydrate に最新ログを反映させる
      void mutateLogs();
      void mutateSleepSessions();
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
    sleepSessionTouched,
    hadBowelMovementTouched, trainingTypeTouched, workModeTouched,
    lastMealEndTimeTouched,
  });

  // 就寝・起床時刻から推定睡眠時間をリアルタイム計算（入力フィードバック用）
  const sleepDurationHours = useMemo(() => {
    if (!sleepBedTime || !sleepWakeTime) return null;
    const dt = buildSleepSessionDatetimes(date, sleepBedTime, sleepWakeTime);
    if (!dt) return null;
    return calcSleepDurationHours(dt.bedAt, dt.wakeAt);
  }, [date, sleepBedTime, sleepWakeTime]);

  // 就寝・起床どちらか片方だけ入力されている（不完全な状態）
  const sleepInputIsPartial =
    sleepSessionTouched &&
    !sleepSessionPendingDelete &&
    (!!sleepBedTime !== !!sleepWakeTime);

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

      {/* 既存ログのマクロ表示（カートで復元不可なため参照用に表示） */}
      {hydratedLog && (hydratedLog.calories !== null || hydratedLog.protein !== null) && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-400">
          <span className="font-semibold">記録済みマクロ:</span>{" "}
          <div>
            {hydratedLog.calories !== null && <span>{hydratedLog.calories} kcal</span>}
            {hydratedLog.protein  !== null && <span> / P {hydratedLog.protein}g</span>}
            {hydratedLog.fat      !== null && <span> / F {hydratedLog.fat}g</span>}
            {hydratedLog.carbs    !== null && <span> / C {hydratedLog.carbs}g</span>}
          </div>
          <div className="mt-0.5 text-amber-600">（更新する場合はカートから追加）</div>
        </div>
      )}

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
          {/* 睡眠セクション（就寝時刻 + 起床時刻 + 推定時間）*/}
          <div className="sm:col-span-2 min-w-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
            <p className="mb-0.5 text-xs font-medium text-slate-500">睡眠</p>
            {sleepSessionPendingDelete ? (
              /* 削除予定状態 */
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-700/50 dark:bg-rose-900/20">
                <p className="flex flex-wrap items-center gap-1 text-xs text-rose-500">
                  <Undo2 size={11} className="shrink-0" />
                  <span>
                    {hydratedSleepSession
                      ? `保存すると睡眠記録（就寝 ${extractJstHHMM(hydratedSleepSession.bed_at) ?? "?"} / 起床 ${extractJstHHMM(hydratedSleepSession.wake_at) ?? "?"}）を削除します。`
                      : "保存すると睡眠記録を削除します。"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSleepSessionPendingDelete(false);
                      setSleepSessionTouched(false);
                      if (hydratedSleepSession) {
                        setSleepBedTime(extractJstHHMM(hydratedSleepSession.bed_at) ?? "");
                        setSleepWakeTime(extractJstHHMM(hydratedSleepSession.wake_at) ?? "");
                      } else {
                        setSleepBedTime("");
                        setSleepWakeTime("");
                      }
                    }}
                    className="underline font-medium"
                  >
                    元に戻す
                  </button>
                </p>
              </div>
            ) : (
              /* 通常入力状態 */
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-1 gap-2">
                  <div className="min-w-0 w-full max-w-full overflow-hidden">
                    <label htmlFor="meal-log-sleep-bed-time" className="mb-1 block text-[10px] text-slate-400">就寝時刻（昨夜〜深夜）</label>
                    <input
                      id="meal-log-sleep-bed-time"
                      type="time"
                      value={sleepBedTime}
                      onChange={(e) => { setSleepBedTime(e.target.value); setSleepSessionTouched(true); }}
                      className={dateTimeInputCls}
                      style={{ width: "100%", minWidth: "0" }}
                    />
                    {sleepBedTime !== "" && (
                      <button
                        type="button"
                        onClick={() => { setSleepBedTime(""); setSleepSessionTouched(true); }}
                        className="mt-1 text-[10px] text-slate-400 underline hover:text-rose-400 transition-colors"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                  <div className="min-w-0 w-full max-w-full overflow-hidden">
                    <label htmlFor="meal-log-sleep-wake-time" className="mb-1 block text-[10px] text-slate-400">起床時刻（今朝）</label>
                    <input
                      id="meal-log-sleep-wake-time"
                      type="time"
                      value={sleepWakeTime}
                      onChange={(e) => { setSleepWakeTime(e.target.value); setSleepSessionTouched(true); }}
                      className={dateTimeInputCls}
                      style={{ width: "100%", minWidth: "0" }}
                    />
                    {sleepWakeTime !== "" && (
                      <button
                        type="button"
                        onClick={() => { setSleepWakeTime(""); setSleepSessionTouched(true); }}
                        className="mt-1 text-[10px] text-slate-400 underline hover:text-rose-400 transition-colors"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                </div>
                {/* 片方だけ入力時の警告 */}
                {sleepInputIsPartial && (
                  <p className="text-[10px] text-amber-500 dark:text-amber-400">
                    就寝時刻と起床時刻はセットで入力してください。
                  </p>
                )}
                {/* 推定睡眠時間（入力フィードバック） */}
                {sleepDurationHours !== null && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    推定睡眠時間: <span className="font-semibold">{sleepDurationHours} 時間</span>
                  </p>
                )}
                {/* 既存セッションがある場合は削除ボタンを表示 */}
                {hydratedSleepSession && !sleepSessionTouched && (
                  <button
                    type="button"
                    onClick={() => { setSleepSessionPendingDelete(true); setSleepSessionTouched(true); }}
                    className="self-start text-[10px] text-slate-400 underline hover:text-rose-400 transition-colors"
                  >
                    記録を削除
                  </button>
                )}
              </div>
            )}
          </div>
          {/* 最終食事終了時刻 */}
          <div className="sm:col-span-2 min-w-0">
            <label htmlFor="meal-log-last-meal-end-time" className="mb-1.5 block text-xs font-medium text-slate-500">最終食事終了</label>
            <input
              id="meal-log-last-meal-end-time"
              type="time"
              value={lastMealEndTime}
              onChange={(e) => { setLastMealEndTime(e.target.value); setLastMealEndTimeTouched(true); }}
              className={dateTimeInputCls}
              style={{ width: "100%", minWidth: "0" }}
            />
            {lastMealEndTime !== "" && (
              <button
                type="button"
                onClick={() => { setLastMealEndTime(""); setLastMealEndTimeTouched(true); }}
                className="mt-1 text-[10px] text-slate-400 underline hover:text-rose-400 transition-colors"
              >
                クリア
              </button>
            )}
          </div>
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

      {/* 食品を追加（開閉式） */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setFoodPickerOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-700/60"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Plus size={13} />
            食品を追加
            {cartItems.length > 0 && !foodPickerOpen && (
              <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                {cartItems.length}品
              </span>
            )}
          </span>
          <ChevronDown
            size={15}
            className={`text-slate-400 transition-transform duration-200 dark:text-slate-500 ${foodPickerOpen ? "rotate-180" : ""}`}
          />
        </button>

        {foodPickerOpen && (
          <div className="flex flex-col gap-3">
            <FoodPicker onAdd={addFood} onAddSet={addFromMenu} onAddTemp={addTempFood} />
            {cartItems.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">カート</p>
                <Cart items={cartItems} onChange={setCartItems} />
              </div>
            )}
          </div>
        )}

        {/* カート（閉じているときも品数があれば表示） */}
        {!foodPickerOpen && cartItems.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">カート</p>
            <Cart items={cartItems} onChange={setCartItems} />
          </div>
        )}
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
