/**
 * saveDailyLog — 部分更新ロジックのユニットテスト
 *
 * テスト対象: buildUpdatePayload (純粋関数)
 *
 * フィールドの意味:
 *   undefined  → 「今回更新しない」= ペイロードに含めない
 *   null       → 「明示的クリア」  = ペイロードに含める
 *   値あり     → 「上書き」        = ペイロードに含める
 */

import { buildUpdatePayload } from "../saveDailyLog";

// ── buildUpdatePayload ────────────────────────────────────────────────────────

describe("buildUpdatePayload — undefined/null/値の区別", () => {
  // ケース1: undefined フィールドはペイロードに含めない
  test("undefined フィールドはペイロードに含まれない", () => {
    const payload = buildUpdatePayload({ weight: 70.5 });
    expect(payload).toEqual({ weight: 70.5 });
    expect("calories" in payload).toBe(false);
    expect("protein" in payload).toBe(false);
    expect("fat" in payload).toBe(false);
    expect("carbs" in payload).toBe(false);
    expect("note" in payload).toBe(false);
    expect("is_cheat_day" in payload).toBe(false);
  });

  // ケース2: null は「明示的クリア」としてペイロードに含まれる
  test("null はペイロードに含まれる（明示的クリア）", () => {
    const payload = buildUpdatePayload({ weight: null, note: null });
    expect(payload).toEqual({ weight: null, note: null });
    expect("weight" in payload).toBe(true);
    expect("note" in payload).toBe(true);
  });

  // ケース3: undefined と null は区別される
  test("undefined と null は別物として扱われる", () => {
    const withNull      = buildUpdatePayload({ weight: null });
    const withUndefined = buildUpdatePayload({});
    expect("weight" in withNull).toBe(true);   // null → 含む
    expect("weight" in withUndefined).toBe(false); // undefined → 含まない
  });

  // ケース4: false のタグも明示的な値として含まれる
  test("boolean false もペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ is_cheat_day: false });
    expect(payload).toEqual({ is_cheat_day: false });
    expect("is_cheat_day" in payload).toBe(true);
  });

  // ケース5: true のタグも含まれる
  test("boolean true もペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ is_cheat_day: true, is_poor_sleep: true });
    expect(payload.is_cheat_day).toBe(true);
    expect(payload.is_poor_sleep).toBe(true);
  });

  // ケース6: 全フィールドが undefined → 空オブジェクト
  test("全フィールド undefined → 空ペイロード", () => {
    const payload = buildUpdatePayload({});
    expect(Object.keys(payload)).toHaveLength(0);
  });

  // ケース7: 全フィールドあり → 全て含まれる
  test("全フィールド指定 → 全て含まれる", () => {
    const input = {
      weight: 70.0,
      calories: 2000,
      protein: 150,
      fat: 60,
      carbs: 200,
      note: "テスト",
      is_cheat_day: true,
      is_refeed_day: false,
      is_eating_out: false,
      is_poor_sleep: false,
    } as const;
    const payload = buildUpdatePayload(input);
    expect(Object.keys(payload)).toHaveLength(10);
    expect(payload).toEqual(input);
  });
});

// ── 部分更新シナリオ ──────────────────────────────────────────────────────────

describe("buildUpdatePayload — 部分更新シナリオ", () => {
  // ユースケース1: 体重のみ更新 → macro 系はペイロードに含まれない
  test("体重のみ更新: macro フィールドはペイロードに含まれない", () => {
    const payload = buildUpdatePayload({ weight: 68.5 });
    expect(payload.weight).toBe(68.5);
    expect("calories" in payload).toBe(false);
    expect("protein" in payload).toBe(false);
    expect("fat" in payload).toBe(false);
    expect("carbs" in payload).toBe(false);
    expect("note" in payload).toBe(false);
  });

  // ユースケース2: macro のみ更新 → weight・note・タグはペイロードに含まれない
  test("macro のみ更新: weight・note・タグはペイロードに含まれない", () => {
    const payload = buildUpdatePayload({
      calories: 1800,
      protein: 140,
      fat: 55,
      carbs: 180,
    });
    expect(payload.calories).toBe(1800);
    expect(payload.protein).toBe(140);
    expect("weight" in payload).toBe(false);
    expect("note" in payload).toBe(false);
    expect("is_cheat_day" in payload).toBe(false);
    expect("is_poor_sleep" in payload).toBe(false);
  });

  // ユースケース3: タグのみ更新 → 他フィールドはペイロードに含まれない
  test("タグのみ更新: weight・macro・note はペイロードに含まれない", () => {
    const payload = buildUpdatePayload({ is_cheat_day: true });
    expect(payload.is_cheat_day).toBe(true);
    expect("weight" in payload).toBe(false);
    expect("calories" in payload).toBe(false);
    expect("note" in payload).toBe(false);
  });

  // ユースケース4: メモのみ更新
  test("メモのみ更新: 他フィールドはペイロードに含まれない", () => {
    const payload = buildUpdatePayload({ note: "今日は良い感じ" });
    expect(payload.note).toBe("今日は良い感じ");
    expect("weight" in payload).toBe(false);
    expect("calories" in payload).toBe(false);
  });

  // ユースケース5: 未操作タグは含まれない（MealLogger の touchedTags に対応）
  test("未操作タグ (undefined) は既存値を保持するためペイロードに含まれない", () => {
    // MealLogger で触れていないタグは送らない → undefined として扱われる
    const payload = buildUpdatePayload({ weight: 70.0, is_cheat_day: true });
    expect("is_refeed_day" in payload).toBe(false);
    expect("is_eating_out" in payload).toBe(false);
    expect("is_poor_sleep" in payload).toBe(false);
  });

  // ユースケース6: 空文字は undefined として扱うべき（MealLogger 側で変換済み）
  // ※ buildUpdatePayload 自体は空文字を通すが、呼び出し側が undefined を渡すことで保護
  test("空文字を渡した場合: ペイロードにそのまま含まれる（呼び出し側での変換が必要）", () => {
    // MealLogger では note !== "" ? note : undefined としているため
    // この関数まで空文字が届くケースは想定外だが、動作を明示する
    const payload = buildUpdatePayload({ note: "" });
    expect(payload.note).toBe("");
  });
});

// ── null (明示的クリア) のシナリオ ────────────────────────────────────────────

describe("buildUpdatePayload — null による明示的クリア", () => {
  test("weight: null → 明示的クリアとしてペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ weight: null });
    expect("weight" in payload).toBe(true);
    expect(payload.weight).toBeNull();
  });

  test("note: null → 明示的クリアとしてペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ note: null });
    expect("note" in payload).toBe(true);
    expect(payload.note).toBeNull();
  });

  test("複数フィールドを null でクリア", () => {
    const payload = buildUpdatePayload({ calories: null, protein: null, fat: null, carbs: null });
    expect(payload.calories).toBeNull();
    expect(payload.protein).toBeNull();
    expect(payload.fat).toBeNull();
    expect(payload.carbs).toBeNull();
  });
});
