/**
 * saveDailyLog — テスト
 *
 * フィールドの意味:
 *   undefined  → 「今回更新しない」= ペイロードに含めない
 *   null       → 「明示的クリア」  = ペイロードに含める
 *   値あり     → 「上書き」        = ペイロードに含める
 *
 * テスト構成:
 *   1. buildUpdatePayload  — 純粋関数のユニットテスト
 *   2. saveDailyLog action — Supabase をモックした結合テスト
 */

// ── モジュールモック (Jest により import より前にホイスト) ──────────────────
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));

import { buildUpdatePayload } from "../buildUpdatePayload";
import { saveDailyLog } from "../saveDailyLog";
import { createClient } from "@/lib/supabase/server";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// ── Supabase クライアントモックヘルパー ─────────────────────────────────────

type CapturedCalls = { insert?: unknown; update?: unknown };

/**
 * saveDailyLog が内部で呼ぶ Supabase チェーンをシミュレートするモック。
 *
 * from() は2回呼ばれる:
 *   1回目: .select("log_date").eq().maybeSingle() — 既存レコード確認
 *   2回目: .update(payload).eq() または .insert(payload)
 *
 * captured に呼び出し時の引数を書き込むので、テスト側で検証できる。
 */
function makeClientMock(
  existingRecord: { log_date: string } | null,
  captured: CapturedCalls = {}
) {
  const eqForUpdate = jest.fn().mockResolvedValue({ error: null });
  const updateFn = jest.fn().mockImplementation((payload: unknown) => {
    captured.update = payload;
    return { eq: eqForUpdate };
  });
  const insertFn = jest.fn().mockImplementation((payload: unknown) => {
    captured.insert = payload;
    return Promise.resolve({ error: null });
  });
  const maybeSingleFn = jest
    .fn()
    .mockResolvedValue({ data: existingRecord, error: null });
  const eqForSelect = jest
    .fn()
    .mockReturnValue({ maybeSingle: maybeSingleFn });
  const selectFn = jest.fn().mockReturnValue({ eq: eqForSelect });

  mockCreateClient.mockReturnValueOnce({
    from: jest.fn().mockReturnValue({
      select: selectFn,
      update: updateFn,
      insert: insertFn,
    }),
  } as unknown as ReturnType<typeof createClient>);

  return captured;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. buildUpdatePayload — 純粋関数のユニットテスト
// ════════════════════════════════════════════════════════════════════════════

describe("buildUpdatePayload — undefined/null/値の区別", () => {
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

  test("null はペイロードに含まれる（明示的クリア）", () => {
    const payload = buildUpdatePayload({ weight: null, note: null });
    expect(payload).toEqual({ weight: null, note: null });
    expect("weight" in payload).toBe(true);
    expect("note" in payload).toBe(true);
  });

  test("undefined と null は別物として扱われる", () => {
    const withNull      = buildUpdatePayload({ weight: null });
    const withUndefined = buildUpdatePayload({});
    expect("weight" in withNull).toBe(true);        // null → 含む
    expect("weight" in withUndefined).toBe(false);  // undefined → 含まない
  });

  test("boolean false もペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ is_cheat_day: false });
    expect(payload).toEqual({ is_cheat_day: false });
    expect("is_cheat_day" in payload).toBe(true);
  });

  test("boolean true もペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ is_cheat_day: true, is_poor_sleep: true });
    expect(payload.is_cheat_day).toBe(true);
    expect(payload.is_poor_sleep).toBe(true);
  });

  test("全フィールド undefined → 空ペイロード", () => {
    const payload = buildUpdatePayload({});
    expect(Object.keys(payload)).toHaveLength(0);
  });

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

describe("buildUpdatePayload — Phase 2.5 新規フィールド", () => {
  test("sleep_hours を指定するとペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ sleep_hours: 7.5 });
    expect(payload.sleep_hours).toBe(7.5);
    expect("weight" in payload).toBe(false);
  });

  test("sleep_hours: null → 明示的クリア", () => {
    const payload = buildUpdatePayload({ sleep_hours: null });
    expect("sleep_hours" in payload).toBe(true);
    expect(payload.sleep_hours).toBeNull();
  });

  test("sleep_hours: undefined → ペイロードに含まれない", () => {
    const payload = buildUpdatePayload({});
    expect("sleep_hours" in payload).toBe(false);
  });

  test("had_bowel_movement: true → ペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ had_bowel_movement: true });
    expect(payload.had_bowel_movement).toBe(true);
  });

  test("had_bowel_movement: false → ペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ had_bowel_movement: false });
    expect(payload.had_bowel_movement).toBe(false);
    expect("had_bowel_movement" in payload).toBe(true);
  });

  // DB が BOOLEAN DEFAULT NULL になったため null 送信が可能。
  // チップ再クリック → null = 「未記録」として明示クリアし DB に null を保存する。
  test("had_bowel_movement: null → ペイロードに含まれる（明示クリア=未記録）", () => {
    const payload = buildUpdatePayload({ had_bowel_movement: null });
    expect("had_bowel_movement" in payload).toBe(true);
    expect(payload.had_bowel_movement).toBeNull();
  });

  test("had_bowel_movement: undefined → ペイロードに含まれない（既存値を保持）", () => {
    const payload = buildUpdatePayload({});
    expect("had_bowel_movement" in payload).toBe(false);
  });

  test("training_type: 'chest' → leg_flag: false が同時に設定される", () => {
    const payload = buildUpdatePayload({ training_type: "chest" });
    expect(payload.training_type).toBe("chest");
    expect(payload.leg_flag).toBe(false);
  });

  test("training_type: 'quads' → leg_flag: true が同時に設定される", () => {
    const payload = buildUpdatePayload({ training_type: "quads" });
    expect(payload.training_type).toBe("quads");
    expect(payload.leg_flag).toBe(true);
  });

  test("training_type: 'glutes_hamstrings' → leg_flag: true", () => {
    const payload = buildUpdatePayload({ training_type: "glutes_hamstrings" });
    expect(payload.training_type).toBe("glutes_hamstrings");
    expect(payload.leg_flag).toBe(true);
  });

  test("training_type: null → leg_flag: null (明示的クリア時も同時にクリア)", () => {
    const payload = buildUpdatePayload({ training_type: null });
    expect(payload.training_type).toBeNull();
    expect(payload.leg_flag).toBeNull();
  });

  test("training_type: undefined → leg_flag もペイロードに含まれない", () => {
    const payload = buildUpdatePayload({});
    expect("training_type" in payload).toBe(false);
    expect("leg_flag" in payload).toBe(false);
  });

  test("work_mode: 'office' → ペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ work_mode: "office" });
    expect(payload.work_mode).toBe("office");
  });

  test("work_mode: null → 明示的クリア", () => {
    const payload = buildUpdatePayload({ work_mode: null });
    expect("work_mode" in payload).toBe(true);
    expect(payload.work_mode).toBeNull();
  });

  test("work_mode: undefined → ペイロードに含まれない", () => {
    const payload = buildUpdatePayload({});
    expect("work_mode" in payload).toBe(false);
  });

  test("Phase 2.5 全フィールドを同時指定", () => {
    const payload = buildUpdatePayload({
      sleep_hours: 6.5,
      had_bowel_movement: true,
      training_type: "back",
      work_mode: "remote",
    });
    expect(payload.sleep_hours).toBe(6.5);
    expect(payload.had_bowel_movement).toBe(true);
    expect(payload.training_type).toBe("back");
    expect(payload.leg_flag).toBe(false);
    expect(payload.work_mode).toBe("remote");
  });
});

describe("buildUpdatePayload — 部分更新シナリオ", () => {
  test("体重のみ更新: macro フィールドはペイロードに含まれない", () => {
    const payload = buildUpdatePayload({ weight: 68.5 });
    expect(payload.weight).toBe(68.5);
    expect("calories" in payload).toBe(false);
    expect("protein" in payload).toBe(false);
    expect("fat" in payload).toBe(false);
    expect("carbs" in payload).toBe(false);
    expect("note" in payload).toBe(false);
  });

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

  test("タグのみ更新: weight・macro・note はペイロードに含まれない", () => {
    const payload = buildUpdatePayload({ is_cheat_day: true });
    expect(payload.is_cheat_day).toBe(true);
    expect("weight" in payload).toBe(false);
    expect("calories" in payload).toBe(false);
    expect("note" in payload).toBe(false);
  });

  test("メモのみ更新: 他フィールドはペイロードに含まれない", () => {
    const payload = buildUpdatePayload({ note: "今日は良い感じ" });
    expect(payload.note).toBe("今日は良い感じ");
    expect("weight" in payload).toBe(false);
    expect("calories" in payload).toBe(false);
  });

  test("未操作タグ (undefined) は既存値を保持するためペイロードに含まれない", () => {
    const payload = buildUpdatePayload({ weight: 70.0, is_cheat_day: true });
    expect("is_refeed_day" in payload).toBe(false);
    expect("is_eating_out" in payload).toBe(false);
    expect("is_poor_sleep" in payload).toBe(false);
  });

  // ※ buildUpdatePayload 自体は空文字を通す。呼び出し側 (MealLogger) が
  //   note !== "" ? note : undefined で変換する責務を持つ。
  test("空文字を渡した場合はそのまま含まれる（呼び出し側での変換が必要）", () => {
    const payload = buildUpdatePayload({ note: "" });
    expect(payload.note).toBe("");
  });
});

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

// ════════════════════════════════════════════════════════════════════════════
// 2. saveDailyLog action — Supabase モックを使った結合テスト
// ════════════════════════════════════════════════════════════════════════════

describe("saveDailyLog — insert / partial update の分岐", () => {
  // ケース1: 既存レコードなし → insert が呼ばれ、渡したフィールドのみ含まれる
  test("新規日付 → insert が呼ばれる", async () => {
    const captured = makeClientMock(null);
    const result = await saveDailyLog({ log_date: "2026-03-13", weight: 70.5 });

    expect(result.ok).toBe(true);
    expect(captured.insert).toEqual({ log_date: "2026-03-13", weight: 70.5 });
    expect(captured.update).toBeUndefined();
  });

  // ケース2: 既存レコードあり → update が呼ばれ、渡したフィールドのみ含まれる
  test("既存日付 → update が呼ばれる", async () => {
    const captured = makeClientMock({ log_date: "2026-03-13" });
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      calories: 2000,
      protein: 150,
    });

    expect(result.ok).toBe(true);
    expect(captured.update).toEqual({ calories: 2000, protein: 150 });
    expect(captured.insert).toBeUndefined();
  });

  // ケース3: 全フィールド undefined → エラー（no-op ではなくエラー扱い）
  //
  // 設計判断: 全フィールド undefined の送信は「保存するデータがない」エラーとする。
  //   - no-op 成功にすると、フォームの空送信や実装バグが検出できなくなる
  //   - サーバー側のガードとして明示的に弾き、DB アクセスも行わない
  //   - UI 側 (MealLogger の hasContent チェック) で通常は防がれるため、
  //     このパスはプログラミングエラー検出が主目的
  test("全フィールド undefined → ok: false (保存するデータがありません)", async () => {
    // このケースは Supabase に届く前に弾かれるのでモック不要
    const result = await saveDailyLog({ log_date: "2026-03-13" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("保存するデータがありません");
    }
  });
});

describe("saveDailyLog — 連続保存シナリオ（体重→macro）", () => {
  /**
   * 主要ユースケース:
   *   1回目: 朝に体重だけ保存 → insert
   *   2回目: 夜に食事 macro を保存 → update (weight はペイロードに含まれない)
   *
   * weight がペイロードに含まれないことで、DB 上の weight が維持されることを保証する。
   * (実際の DB 値の維持は Supabase 側の動作に委ねられるが、
   *  update payload に weight が入らないことをここで保証する)
   */
  test("1回目で weight 保存、2回目で macro 保存しても weight がペイロードに含まれない", async () => {
    // --- 1回目: 新規日付に weight のみ保存 ---
    const captured1 = makeClientMock(null);
    const result1 = await saveDailyLog({ log_date: "2026-03-13", weight: 70.5 });

    expect(result1.ok).toBe(true);
    expect(captured1.insert).toEqual({ log_date: "2026-03-13", weight: 70.5 });
    // macro 系・タグ・note は insert にも含まれない
    expect("calories" in (captured1.insert as object)).toBe(false);
    expect("protein"  in (captured1.insert as object)).toBe(false);

    // --- 2回目: 同日付に macro のみ追記 ---
    const captured2 = makeClientMock({ log_date: "2026-03-13" });
    const result2 = await saveDailyLog({
      log_date: "2026-03-13",
      calories: 2000,
      protein: 150,
      fat: 60,
      carbs: 200,
    });

    expect(result2.ok).toBe(true);
    // update が呼ばれ、macro 4項目だけを含む
    expect(captured2.update).toEqual({
      calories: 2000,
      protein: 150,
      fat: 60,
      carbs: 200,
    });
    // weight はペイロードに含まれない → DB 上の weight=70.5 は保持される
    expect("weight" in (captured2.update as object)).toBe(false);
    expect("note"   in (captured2.update as object)).toBe(false);
    expect("is_cheat_day" in (captured2.update as object)).toBe(false);
    expect(captured2.insert).toBeUndefined();
  });

  test("タグのみ更新しても macro・weight が保持される", async () => {
    const captured = makeClientMock({ log_date: "2026-03-13" });
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      is_cheat_day: true,
    });

    expect(result.ok).toBe(true);
    expect(captured.update).toEqual({ is_cheat_day: true });
    expect("weight"   in (captured.update as object)).toBe(false);
    expect("calories" in (captured.update as object)).toBe(false);
  });

  test("note のみ更新しても他フィールドが保持される", async () => {
    const captured = makeClientMock({ log_date: "2026-03-13" });
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      note: "体調良好",
    });

    expect(result.ok).toBe(true);
    expect(captured.update).toEqual({ note: "体調良好" });
    expect("weight"      in (captured.update as object)).toBe(false);
    expect("calories"    in (captured.update as object)).toBe(false);
    expect("is_cheat_day" in (captured.update as object)).toBe(false);
  });

  test("training_type 保存時に leg_flag が同時に insert される", async () => {
    const captured = makeClientMock(null);
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      training_type: "quads",
    });

    expect(result.ok).toBe(true);
    const inserted = captured.insert as Record<string, unknown>;
    expect(inserted.training_type).toBe("quads");
    expect(inserted.leg_flag).toBe(true);
  });

  test("sleep_hours・had_bowel_movement・work_mode の単体保存", async () => {
    const captured = makeClientMock({ log_date: "2026-03-13" });
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      sleep_hours: 7.0,
      had_bowel_movement: true,
      work_mode: "office",
    });

    expect(result.ok).toBe(true);
    expect(captured.update).toEqual({
      sleep_hours: 7.0,
      had_bowel_movement: true,
      work_mode: "office",
    });
    expect("weight" in (captured.update as object)).toBe(false);
    expect("training_type" in (captured.update as object)).toBe(false);
    expect("leg_flag" in (captured.update as object)).toBe(false);
  });
});

describe("saveDailyLog — Phase 2.5 バリデーション", () => {
  test("sleep_hours が 25 → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "2026-03-13", sleep_hours: 25 });
    expect(result.ok).toBe(false);
  });

  test("sleep_hours が -1 → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "2026-03-13", sleep_hours: -1 });
    expect(result.ok).toBe(false);
  });

  test("sleep_hours が 0 → ok: true (境界値)", async () => {
    const captured = makeClientMock(null);
    const result = await saveDailyLog({ log_date: "2026-03-13", sleep_hours: 0 });
    expect(result.ok).toBe(true);
    expect((captured.insert as Record<string, unknown>).sleep_hours).toBe(0);
  });

  test("training_type が不正な値 → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "2026-03-13", training_type: "legs" });
    expect(result.ok).toBe(false);
  });

  test("work_mode が不正な値 → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "2026-03-13", work_mode: "home" });
    expect(result.ok).toBe(false);
  });
});
