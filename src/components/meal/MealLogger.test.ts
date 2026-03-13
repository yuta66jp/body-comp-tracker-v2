import { computeHasContent } from "./MealLogger";

const base = {
  weight: "",
  cartItems: [],
  note: "",
  touchedTags: new Set<import("@/lib/utils/dayTags").DayTag>(),
  sleepHours: "",
  hadBowelMovement: null,
  trainingTypeTouched: false,
  workModeTouched: false,
} as const satisfies Parameters<typeof computeHasContent>[0];

describe("computeHasContent", () => {
  // ── 何も変更していない場合 ──
  it("何も入力・変更していない場合は false", () => {
    expect(computeHasContent({ ...base })).toBe(false);
  });

  // ── 体重・食事・メモ ──
  it("体重が入力されている場合は true", () => {
    expect(computeHasContent({ ...base, weight: "65.5" })).toBe(true);
  });

  it("カートにアイテムがある場合は true", () => {
    const item = { food: { name: "chicken", calories: 165, protein: 31, fat: 3.6, carbs: 0, category: null }, grams: 100 };
    expect(computeHasContent({ ...base, cartItems: [item] })).toBe(true);
  });

  it("メモが入力されている場合は true", () => {
    expect(computeHasContent({ ...base, note: "調子良い" })).toBe(true);
  });

  // ── 特殊日タグ ──
  it("false -> true にトグルした場合は true", () => {
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_cheat_day"]);
    expect(computeHasContent({ ...base, touchedTags })).toBe(true);
  });

  it("true -> false に戻した場合も true (変更があるとみなす)", () => {
    // タグを一度 ON にしてから OFF に戻した状態: touchedTags には残る
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_refeed_day"]);
    expect(computeHasContent({ ...base, touchedTags })).toBe(true);
  });

  it("複数タグを変更した場合は true", () => {
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_cheat_day", "is_eating_out"]);
    expect(computeHasContent({ ...base, touchedTags })).toBe(true);
  });

  it("touchedTags が空（未操作）の場合はタグ由来では true にならない", () => {
    // 他フィールドも未入力
    expect(computeHasContent({ ...base, touchedTags: new Set() })).toBe(false);
  });

  // ── コンディション系 ──
  it("睡眠時間が入力されている場合は true", () => {
    expect(computeHasContent({ ...base, sleepHours: "7.5" })).toBe(true);
  });

  it("便通が true に設定されている場合は true", () => {
    expect(computeHasContent({ ...base, hadBowelMovement: true })).toBe(true);
  });

  it("便通が false に設定されている場合も true（明示的選択）", () => {
    expect(computeHasContent({ ...base, hadBowelMovement: false })).toBe(true);
  });

  it("便通が null（未操作）の場合は false", () => {
    expect(computeHasContent({ ...base, hadBowelMovement: null })).toBe(false);
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

  it("タグ変更 + 体重入力の複合でも true", () => {
    const touchedTags = new Set<import("@/lib/utils/dayTags").DayTag>(["is_cheat_day"]);
    expect(computeHasContent({ ...base, weight: "64.0", touchedTags })).toBe(true);
  });
});
