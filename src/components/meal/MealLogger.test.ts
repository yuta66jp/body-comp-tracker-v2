import {
  buildNoteSaveValue,
  computeHasContent,
  computeHasDailyLogChanges,
  hasDailyLogForDate,
} from "./MealLogger";

const base = {
  weight: "" as string | null,
  weightTouched: false,
  cartItems: [] as Parameters<typeof computeHasContent>[0]["cartItems"],
  cartEverHadItems: false,
  note: "" as string | null,
  noteTouched: false,
  touchedTags: new Set<import("@/lib/utils/dayTags").DayTag>(),
  sleepSessionTouched: false,
  hadBowelMovementTouched: false,
  trainingTypeTouched: false,
  workModeTouched: false,
  lastMealEndTimeTouched: false,
} satisfies Parameters<typeof computeHasContent>[0];

describe("computeHasContent", () => {
  // ── 何も変更していない場合 ──
  it("何も入力・変更していない場合は false", () => {
    expect(computeHasContent({ ...base })).toBe(false);
  });

  // ── hydrate のみ（touched なし）の場合 ──
  it("hydrate で weight が表示されているだけ（touched=false）の場合は false", () => {
    expect(computeHasContent({ ...base, weight: "65.5", weightTouched: false })).toBe(false);
  });

  it("hydrate で note が表示されているだけ（touched=false）の場合は false", () => {
    expect(computeHasContent({ ...base, note: "調子良い", noteTouched: false })).toBe(false);
  });

  it("sleepSessionTouched=false のとき false（hydrate のみ）", () => {
    expect(computeHasContent({ ...base, sleepSessionTouched: false })).toBe(false);
  });

  // ── 体重・食事・メモ（ユーザー操作あり） ──
  it("体重が入力されている（touched=true）場合は true", () => {
    expect(computeHasContent({ ...base, weight: "65.5", weightTouched: true })).toBe(true);
  });

  it("カートにアイテムがある場合は true", () => {
    const item = { kind: "regular" as const, food: { id: "test-id", name: "chicken", calories: 165, protein: 31, fat: 3.6, carbs: 0, category: null, created_at: null }, grams: 100 };
    expect(computeHasContent({ ...base, cartItems: [item] })).toBe(true);
  });

  it("メモが入力されている（touched=true）場合は true", () => {
    expect(computeHasContent({ ...base, note: "調子良い", noteTouched: true })).toBe(true);
  });

  // ── 明示的クリア（null 状態） ──
  it("weight が null（明示クリア）かつ touched=true のとき true", () => {
    expect(computeHasContent({ ...base, weight: null, weightTouched: true })).toBe(true);
  });

  it("weight が null でも touched=false のとき false（hydrate 後の未操作クリア状態）", () => {
    // このケースは通常 UI では発生しないが、念のため検証
    expect(computeHasContent({ ...base, weight: null, weightTouched: false })).toBe(false);
  });

  it("note が null（明示クリア）かつ touched=true のとき true", () => {
    expect(computeHasContent({ ...base, note: null, noteTouched: true })).toBe(true);
  });

  it("cartEverHadItems=true（カートを追加後に空にした）のとき true", () => {
    expect(computeHasContent({ ...base, cartEverHadItems: true })).toBe(true);
  });

  // ── 睡眠セッション ──
  it("sleepSessionTouched=true（就寝/起床時刻を入力）のとき true", () => {
    expect(computeHasContent({ ...base, sleepSessionTouched: true })).toBe(true);
  });

  it("sleepSessionTouched=true（セッション削除操作）のとき true", () => {
    expect(computeHasContent({ ...base, sleepSessionTouched: true })).toBe(true);
  });

  // ── 特殊日タグ ──
  it("false -> true にトグルした場合は true", () => {
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_cheat_day"]);
    expect(computeHasContent({ ...base, touchedTags })).toBe(true);
  });

  it("true -> false に戻した場合も true (変更があるとみなす)", () => {
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_refeed_day"]);
    expect(computeHasContent({ ...base, touchedTags })).toBe(true);
  });

  it("複数タグを変更した場合は true", () => {
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_cheat_day", "is_eating_out"]);
    expect(computeHasContent({ ...base, touchedTags })).toBe(true);
  });

  it("touchedTags が空（未操作）の場合はタグ由来では true にならない", () => {
    expect(computeHasContent({ ...base, touchedTags: new Set() })).toBe(false);
  });

  // ── コンディション系 ──
  it("hadBowelMovementTouched が true（ボタン操作あり）の場合は true", () => {
    expect(computeHasContent({ ...base, hadBowelMovementTouched: true })).toBe(true);
  });

  it("hadBowelMovementTouched が false（未操作）の場合は false", () => {
    expect(computeHasContent({ ...base, hadBowelMovementTouched: false })).toBe(false);
  });

  it("trainingTypeTouched が true の場合は true", () => {
    expect(computeHasContent({ ...base, trainingTypeTouched: true })).toBe(true);
  });

  it("workModeTouched が true の場合は true", () => {
    expect(computeHasContent({ ...base, workModeTouched: true })).toBe(true);
  });

  // ── 複合ケース ──
  it("タグ変更のみの場合はタグ由来で true になる", () => {
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_eating_out"]);
    expect(computeHasContent({ ...base, touchedTags })).toBe(true);
  });

  it("タグ変更 + 体重入力（touched=true）の複合でも true", () => {
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_cheat_day"]);
    expect(computeHasContent({ ...base, weight: "64.0", weightTouched: true, touchedTags })).toBe(true);
  });

  it("weight null かつ cartEverHadItems=true の複合でも true", () => {
    expect(computeHasContent({ ...base, weight: null, weightTouched: true, cartEverHadItems: true })).toBe(true);
  });

  // ── hydrate 後に過去日タグを触った場合 ──
  it("hydrate で weight が表示されているがタグだけ変更した場合は true", () => {
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_cheat_day"]);
    expect(computeHasContent({ ...base, weight: "70.5", weightTouched: false, touchedTags })).toBe(true);
  });

  // ── 睡眠 + 他フィールドの複合 ──
  it("睡眠入力 + 体重入力の複合でも true", () => {
    expect(computeHasContent({ ...base, sleepSessionTouched: true, weight: "70.0", weightTouched: true })).toBe(true);
  });

  it("睡眠未操作 + 体重のみ操作 → 睡眠由来では true にならないが体重由来で true", () => {
    expect(computeHasContent({ ...base, sleepSessionTouched: false, weight: "70.0", weightTouched: true })).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// computeHasDailyLogChanges (#524 — 睡眠のみ変更時の "保存するデータがありません" 防止)
// ════════════════════════════════════════════════════════════════════════════

describe("computeHasDailyLogChanges", () => {
  // ── 睡眠のみ変更 → daily_logs 変更なし ──

  it("sleepSessionTouched=true のみ → false (sleep_sessions 側の変更。daily_logs には含めない)", () => {
    // これが #524 の核心: 睡眠だけ変更した場合に saveDailyLog を呼ばないようにする
    expect(computeHasDailyLogChanges({ ...base, sleepSessionTouched: true })).toBe(false);
  });

  it("sleepSessionTouched=true + sleepSessionPendingDelete → false", () => {
    expect(computeHasDailyLogChanges({ ...base, sleepSessionTouched: true })).toBe(false);
  });

  // ── 何も変更なし ──

  it("何も変更なし → false", () => {
    expect(computeHasDailyLogChanges({ ...base })).toBe(false);
  });

  // ── daily_logs 変更あり ──

  it("weightTouched=true → true", () => {
    expect(computeHasDailyLogChanges({ ...base, weight: "70.0", weightTouched: true })).toBe(true);
  });

  it("cartItems に食品あり → true", () => {
    const item = { kind: "regular" as const, food: { id: "test-id", name: "chicken", calories: 165, protein: 31, fat: 3.6, carbs: 0, category: null, created_at: null }, grams: 100 };
    expect(computeHasDailyLogChanges({ ...base, cartItems: [item] })).toBe(true);
  });

  it("cartEverHadItems=true → true (カートを追加後に空にした場合も null 送信が必要)", () => {
    expect(computeHasDailyLogChanges({ ...base, cartEverHadItems: true })).toBe(true);
  });

  it("noteTouched=true → true", () => {
    expect(computeHasDailyLogChanges({ ...base, note: "メモ", noteTouched: true })).toBe(true);
  });

  it("touchedTags に変更あり → true", () => {
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_cheat_day"]);
    expect(computeHasDailyLogChanges({ ...base, touchedTags })).toBe(true);
  });

  it("hadBowelMovementTouched=true → true", () => {
    expect(computeHasDailyLogChanges({ ...base, hadBowelMovementTouched: true })).toBe(true);
  });

  it("trainingTypeTouched=true → true", () => {
    expect(computeHasDailyLogChanges({ ...base, trainingTypeTouched: true })).toBe(true);
  });

  it("workModeTouched=true → true", () => {
    expect(computeHasDailyLogChanges({ ...base, workModeTouched: true })).toBe(true);
  });

  it("lastMealEndTimeTouched=true → true", () => {
    expect(computeHasDailyLogChanges({ ...base, lastMealEndTimeTouched: true })).toBe(true);
  });

  // ── 複合ケース ──

  it("sleepSessionTouched=true + weightTouched=true → true (daily_logs 変更あり)", () => {
    // 睡眠もあるが daily_logs 変更もあるので true
    expect(computeHasDailyLogChanges({
      ...base,
      sleepSessionTouched: true,
      weight: "70.0",
      weightTouched: true,
    })).toBe(true);
  });

  it("sleepSessionTouched=true + noteTouched=true → true", () => {
    expect(computeHasDailyLogChanges({
      ...base,
      sleepSessionTouched: true,
      note: "メモ",
      noteTouched: true,
    })).toBe(true);
  });
});

describe("buildNoteSaveValue", () => {
  it("未操作の場合は undefined を返して既存値を保持する", () => {
    expect(buildNoteSaveValue("既存メモ", false)).toBeUndefined();
    expect(buildNoteSaveValue("", false)).toBeUndefined();
  });

  it("入力値がある場合はその文字列を返す", () => {
    expect(buildNoteSaveValue("調子良い", true)).toBe("調子良い");
  });

  it("空文字にして保存する場合は null を返して既存メモを削除する", () => {
    expect(buildNoteSaveValue("", true)).toBeNull();
  });

  it("削除予定状態の場合は null を返す", () => {
    expect(buildNoteSaveValue(null, true)).toBeNull();
  });
});

describe("hasDailyLogForDate", () => {
  it("hydratedLog が対象日付なら true", () => {
    expect(hasDailyLogForDate(undefined, { log_date: "2026-04-10" }, undefined, false, "2026-04-10")).toBe(true);
  });

  it("logs が未ロードで hydratedLog もなければ null", () => {
    expect(hasDailyLogForDate(undefined, null, undefined, false, "2026-04-10")).toBeNull();
  });

  it("logs に対象日付があれば true", () => {
    expect(hasDailyLogForDate([{ log_date: "2026-04-10" }], null, undefined, false, "2026-04-10")).toBe(true);
  });

  it("日付指定 fetch の結果に対象日付があれば true", () => {
    expect(hasDailyLogForDate([], null, { log_date: "2026-04-10" }, false, "2026-04-10")).toBe(true);
  });

  it("日付指定 fetch 中なら null", () => {
    expect(hasDailyLogForDate([], null, undefined, true, "2026-04-10")).toBeNull();
  });

  it("logs がロード済みで対象日付がなければ false", () => {
    expect(hasDailyLogForDate([{ log_date: "2026-04-09" }], null, null, false, "2026-04-10")).toBe(false);
  });
});
