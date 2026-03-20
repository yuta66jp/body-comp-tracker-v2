import { computeHasContent } from "./MealLogger";

const base = {
  weight: "" as string | null,
  weightTouched: false,
  cartItems: [] as Parameters<typeof computeHasContent>[0]["cartItems"],
  cartEverHadItems: false,
  note: "" as string | null,
  noteTouched: false,
  touchedTags: new Set<import("@/lib/utils/dayTags").DayTag>(),
  sleepHours: "" as string | null,
  sleepHoursTouched: false,
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

  it("hydrate で sleepHours が表示されているだけ（touched=false）の場合は false", () => {
    expect(computeHasContent({ ...base, sleepHours: "7.5", sleepHoursTouched: false })).toBe(false);
  });

  // ── 体重・食事・メモ（ユーザー操作あり） ──
  it("体重が入力されている（touched=true）場合は true", () => {
    expect(computeHasContent({ ...base, weight: "65.5", weightTouched: true })).toBe(true);
  });

  it("カートにアイテムがある場合は true", () => {
    const item = { food: { name: "chicken", calories: 165, protein: 31, fat: 3.6, carbs: 0, category: null }, grams: 100 };
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

  it("sleepHours が null（明示クリア）かつ touched=true のとき true", () => {
    expect(computeHasContent({ ...base, sleepHours: null, sleepHoursTouched: true })).toBe(true);
  });

  it("sleepHours が入力されている（touched=true）場合は true", () => {
    expect(computeHasContent({ ...base, sleepHours: "7.5", sleepHoursTouched: true })).toBe(true);
  });

  it("cartEverHadItems=true（カートを追加後に空にした）のとき true", () => {
    expect(computeHasContent({ ...base, cartEverHadItems: true })).toBe(true);
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
