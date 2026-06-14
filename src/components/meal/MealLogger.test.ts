import {
  buildMealItemInputs,
  buildNoteSaveValue,
  calcMealEntriesTotals,
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
  hadBowelMovementTouched: false,
  trainingTypeTouched: false,
  workModeTouched: false,
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

  it("cartEverHadItems=true でもカートが空なら保存対象なしとして false", () => {
    expect(computeHasContent({ ...base, cartEverHadItems: true })).toBe(false);
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

});

// ════════════════════════════════════════════════════════════════════════════
// computeHasDailyLogChanges
// ════════════════════════════════════════════════════════════════════════════

describe("computeHasDailyLogChanges", () => {
  // ── 何も変更なし ──

  it("何も変更なし → false", () => {
    expect(computeHasDailyLogChanges({ ...base })).toBe(false);
  });

  // ── daily_logs 変更あり ──

  it("weightTouched=true → true", () => {
    expect(computeHasDailyLogChanges({ ...base, weight: "70.0", weightTouched: true })).toBe(true);
  });

  it("cartItems に食品があっても daily_logs 変更ではないため false", () => {
    const item = { kind: "regular" as const, food: { id: "test-id", name: "chicken", calories: 165, protein: 31, fat: 3.6, carbs: 0, category: null, created_at: null }, grams: 100 };
    expect(computeHasDailyLogChanges({ ...base, cartItems: [item] })).toBe(false);
  });

  it("cartEverHadItems=true → false (明細削除は保存済み明細側で扱う)", () => {
    expect(computeHasDailyLogChanges({ ...base, cartEverHadItems: true })).toBe(false);
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

  // ── 複合ケース ──

  it("weightTouched=true + noteTouched=true → true", () => {
    expect(computeHasDailyLogChanges({
      ...base,
      weight: "70.0",
      weightTouched: true,
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

describe("buildMealItemInputs", () => {
  it("food_master 由来のカート食品を保存用明細へ変換する", () => {
    const item = {
      kind: "regular" as const,
      food: { id: "food-id", name: "chicken", calories: 165, protein: 31, fat: 3.6, carbs: 0, category: null, created_at: null },
      grams: 150,
    };

    expect(buildMealItemInputs([item])).toEqual([
      {
        source_type: "food_master",
        source_name: "chicken",
        food_name: "chicken",
        amount_g: 150,
        calories_kcal: 248,
        protein_g: 47,
        fat_g: 5,
        carbs_g: 0,
        calories_per_100g: 165,
        protein_per_100g: 31,
        fat_per_100g: 3.6,
        carbs_per_100g: 0,
      },
    ]);
  });

  it("一時食品は入力済み栄養値をそのまま保存用明細へ変換する", () => {
    const item = {
      kind: "temp" as const,
      food: {
        tempId: "temp-1",
        name: "外食メニュー",
        grams: 0,
        calories: 700,
        protein: 35,
        fat: 20,
        carbs: 80,
      },
    };

    expect(buildMealItemInputs([item])).toEqual([
      {
        source_type: "temp",
        source_name: "外食メニュー",
        food_name: "外食メニュー",
        amount_g: 0,
        calories_kcal: 700,
        protein_g: 35,
        fat_g: 20,
        carbs_g: 80,
      },
    ]);
  });
});

describe("calcMealEntriesTotals", () => {
  it("保存済み食事明細のカロリー/PFCと品数を合計する", () => {
    const entries = [
      {
        id: "entry-1",
        user_id: "user-1",
        log_date: "2026-06-14",
        meal_type: "meal_1",
        title: null,
        note: null,
        created_at: "2026-06-14T00:00:00Z",
        updated_at: "2026-06-14T00:00:00Z",
        items: [
          {
            id: "item-1",
            user_id: "user-1",
            meal_entry_id: "entry-1",
            item_order: 0,
            source_type: "food_master",
            source_name: "chicken",
            food_name: "chicken",
            amount_g: 100,
            calories_kcal: 165,
            protein_g: 31,
            fat_g: 4,
            carbs_g: 0,
            calories_per_100g: 165,
            protein_per_100g: 31,
            fat_per_100g: 4,
            carbs_per_100g: 0,
            created_at: "2026-06-14T00:00:00Z",
            updated_at: "2026-06-14T00:00:00Z",
          },
          {
            id: "item-2",
            user_id: "user-1",
            meal_entry_id: "entry-1",
            item_order: 1,
            source_type: "temp",
            source_name: "外食メニュー",
            food_name: "外食メニュー",
            amount_g: null,
            calories_kcal: 500,
            protein_g: 20,
            fat_g: 15,
            carbs_g: 60,
            calories_per_100g: null,
            protein_per_100g: null,
            fat_per_100g: null,
            carbs_per_100g: null,
            created_at: "2026-06-14T00:00:00Z",
            updated_at: "2026-06-14T00:00:00Z",
          },
        ],
      },
    ];

    expect(calcMealEntriesTotals(entries)).toEqual({
      calories: 665,
      protein: 51,
      fat: 19,
      carbs: 60,
      itemCount: 2,
    });
  });

  it("明細がない場合は0を返す", () => {
    expect(calcMealEntriesTotals(undefined)).toEqual({
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      itemCount: 0,
    });
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
