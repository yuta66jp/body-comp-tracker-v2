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
import { revalidatePath } from "next/cache";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// ── Supabase クライアントモックヘルパー ─────────────────────────────────────

/** saveDailyLog の RPC 呼び出し引数をキャプチャする型 */
type RpcCapture = {
  name?: string;
  p_log_date?: string;
  p_fields?: Record<string, unknown>;
  calls: Array<{ name: string; p_log_date: string; p_fields: Record<string, unknown> }>;
};

type TimeFields = { bed_time: string | null; weigh_in_time: string | null };
type TimeFieldMap = Record<string, TimeFields | null>;

function isTimeFields(value: unknown): value is TimeFields {
  return typeof value === "object" && value !== null && "bed_time" in value && "weigh_in_time" in value;
}

/**
 * saveDailyLog が内部で呼ぶ supabase クライアントをモックする。
 *
 * - rpc("save_daily_log_partial", ...) の引数を capture に記録する
 * - existingRow を渡すと from("daily_logs").select().eq().maybeSingle() もモックし、
 *   bed_time / weigh_in_time の片側のみ更新する際の既存行フェッチに応答する
 *
 * @param rpcError    - RPC が返すエラー（省略時は null = 成功）
 * @param existingRow - DB フェッチ結果。省略時は from チェーンをモックしない
 *                      (両方が payload にある場合 or どちらも payload にない場合はフェッチが走らないため不要)
 */
function makeRpcMock(
  rpcError?: { message: string },
  existingRow?:
    | TimeFields
    | TimeFieldMap
    | null
): RpcCapture {
  const capture: RpcCapture = { calls: [] };

  const mockClient: Record<string, unknown> = {
    rpc: jest.fn().mockImplementation(
      (name: string, args: { p_log_date: string; p_fields: Record<string, unknown> }) => {
        capture.name       = name;
        capture.p_log_date = args.p_log_date;
        capture.p_fields   = args.p_fields;
        capture.calls.push({ name, p_log_date: args.p_log_date, p_fields: args.p_fields });
        return Promise.resolve({ error: rpcError ?? null });
      }
    ),
  };

  const rowMap: TimeFieldMap =
    existingRow === undefined
      ? {}
      : (existingRow === null || isTimeFields(existingRow))
          ? { "2026-04-07": existingRow }
          : existingRow;

  mockClient.from = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockImplementation((_: string, logDate: string) => ({
        maybeSingle: jest.fn().mockResolvedValue({ data: rowMap[logDate] ?? null, error: null }),
      })),
    }),
  });

  mockCreateClient.mockReturnValueOnce(mockClient as unknown as ReturnType<typeof createClient>);
  return capture;
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
    const payload = buildUpdatePayload({ is_cheat_day: true, is_refeed_day: true });
    expect(payload.is_cheat_day).toBe(true);
    expect(payload.is_refeed_day).toBe(true);
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
      is_travel_day: false,
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

  test("training_type: 'off' → leg_flag: false (オフ日 = 非レッグ日と確定)", () => {
    // off は「トレーニングなしと明示した日」。null (未記録) とは区別する。
    const payload = buildUpdatePayload({ training_type: "off" });
    expect(payload.training_type).toBe("off");
    expect(payload.leg_flag).toBe(false);
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
// 2. saveDailyLog action — Supabase RPC モックを使った結合テスト
//
// read-then-write (select → insert/update 分岐) を廃止し、
// save_daily_log_partial RPC の 1 呼び出しで atomic upsert を実現している。
// テストは RPC への引数 (p_log_date, p_fields) を検証する。
// ════════════════════════════════════════════════════════════════════════════

describe("saveDailyLog — atomic upsert (RPC 呼び出し検証)", () => {
  test("weight のみ → RPC が save_daily_log_partial で呼ばれ p_fields に weight が含まれる", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({ log_date: "2026-03-13", weight: 70.5 });

    expect(result.ok).toBe(true);
    expect(capture.name).toBe("save_daily_log_partial");
    expect(capture.p_log_date).toBe("2026-03-13");
    expect(capture.p_fields?.weight).toBe(70.5);
    // 未指定フィールドは p_fields に含まれない
    expect("calories" in (capture.p_fields ?? {})).toBe(false);
    expect("protein"  in (capture.p_fields ?? {})).toBe(false);
  });

  test("macro のみ → p_fields に calories/protein が含まれ weight は含まれない", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      calories: 2000,
      protein: 150,
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.calories).toBe(2000);
    expect(capture.p_fields?.protein).toBe(150);
    expect("weight" in (capture.p_fields ?? {})).toBe(false);
  });

  // 全フィールド undefined → DB アクセスなしでエラー
  //
  // 設計判断: 全フィールド undefined の送信は「保存するデータがない」エラーとする。
  //   - no-op 成功にすると、フォームの空送信や実装バグが検出できなくなる
  //   - サーバー側のガードとして明示的に弾き、RPC も呼ばない
  //   - UI 側 (MealLogger の hasContent チェック) で通常は防がれるため、
  //     このパスはプログラミングエラー検出が主目的
  test("全フィールド undefined → ok: false (保存するデータがありません)", async () => {
    const result = await saveDailyLog({ log_date: "2026-03-13" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("保存するデータがありません");
    }
  });

  test("RPC がエラーを返す → ok: false", async () => {
    makeRpcMock({ message: "DB error" });
    const result = await saveDailyLog({ log_date: "2026-03-13", weight: 70.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("保存に失敗しました");
    }
  });
});

describe("saveDailyLog — 連続保存シナリオ（体重→macro）", () => {
  /**
   * RPC ベースでの partial update 意味論の確認。
   *
   * 旧: 1回目 insert / 2回目 update と分岐していた。
   * 新: 両回とも同じ RPC を呼ぶ。p_fields に「送ったフィールドのみ」が含まれることで
   *     DB 側の ON CONFLICT CASE WHEN により未指定フィールドが保持される。
   *
   * テストが担保すること:
   *   - 2回目の p_fields に weight が含まれないこと（RPC が weight を触らない = 保持）
   */
  test("weight 保存後に macro のみ保存: 2回目 p_fields に weight が含まれない", async () => {
    // --- 1回目: weight のみ ---
    const capture1 = makeRpcMock();
    const result1 = await saveDailyLog({ log_date: "2026-03-13", weight: 70.5 });

    expect(result1.ok).toBe(true);
    expect(capture1.p_fields?.weight).toBe(70.5);
    expect("calories" in (capture1.p_fields ?? {})).toBe(false);
    expect("protein"  in (capture1.p_fields ?? {})).toBe(false);

    // --- 2回目: macro のみ ---
    const capture2 = makeRpcMock();
    const result2 = await saveDailyLog({
      log_date: "2026-03-13",
      calories: 2000,
      protein: 150,
      fat: 60,
      carbs: 200,
    });

    expect(result2.ok).toBe(true);
    // macro 4 項目のみ p_fields に含まれる
    expect(capture2.p_fields?.calories).toBe(2000);
    expect(capture2.p_fields?.protein).toBe(150);
    expect(capture2.p_fields?.fat).toBe(60);
    expect(capture2.p_fields?.carbs).toBe(200);
    // weight は p_fields になし → RPC は weight を触らない → DB 値は保持される
    expect("weight"       in (capture2.p_fields ?? {})).toBe(false);
    expect("note"         in (capture2.p_fields ?? {})).toBe(false);
    expect("is_cheat_day" in (capture2.p_fields ?? {})).toBe(false);
  });

  test("タグのみ保存: p_fields に is_cheat_day のみ、weight・macro は含まれない", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      is_cheat_day: true,
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.is_cheat_day).toBe(true);
    expect("weight"   in (capture.p_fields ?? {})).toBe(false);
    expect("calories" in (capture.p_fields ?? {})).toBe(false);
  });

  test("note のみ保存: p_fields に note のみ、他フィールドは含まれない", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      note: "体調良好",
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.note).toBe("体調良好");
    expect("weight"       in (capture.p_fields ?? {})).toBe(false);
    expect("calories"     in (capture.p_fields ?? {})).toBe(false);
    expect("is_cheat_day" in (capture.p_fields ?? {})).toBe(false);
  });

  test("training_type 保存時に leg_flag が p_fields に同時に含まれる", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      training_type: "quads",
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.training_type).toBe("quads");
    // leg_flag は buildUpdatePayload が training_type から導出して追加する
    expect(capture.p_fields?.leg_flag).toBe(true);
  });

  test("training_type: null → leg_flag も null で p_fields に含まれる（明示クリア）", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      training_type: null,
    });

    expect(result.ok).toBe(true);
    expect("training_type" in (capture.p_fields ?? {})).toBe(true);
    expect(capture.p_fields?.training_type).toBeNull();
    expect("leg_flag" in (capture.p_fields ?? {})).toBe(true);
    expect(capture.p_fields?.leg_flag).toBeNull();
  });

  test("sleep_hours・had_bowel_movement・work_mode のみ保存: 他フィールドは含まれない", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      sleep_hours: 7.0,
      had_bowel_movement: true,
      work_mode: "office",
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.sleep_hours).toBe(7.0);
    expect(capture.p_fields?.had_bowel_movement).toBe(true);
    expect(capture.p_fields?.work_mode).toBe("office");
    expect("weight"        in (capture.p_fields ?? {})).toBe(false);
    expect("training_type" in (capture.p_fields ?? {})).toBe(false);
    expect("leg_flag"      in (capture.p_fields ?? {})).toBe(false);
  });

  test("had_bowel_movement: null → p_fields にキーが含まれ値が null（明示クリア=未記録）", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      had_bowel_movement: null,
    });

    expect(result.ok).toBe(true);
    expect("had_bowel_movement" in (capture.p_fields ?? {})).toBe(true);
    expect(capture.p_fields?.had_bowel_movement).toBeNull();
  });
});

describe("saveDailyLog — log_date バリデーション", () => {
  // 正常系
  test("通常の日付 → ok: true", async () => {
    makeRpcMock();
    const result = await saveDailyLog({ log_date: "2026-03-13", weight: 70.0 });
    expect(result.ok).toBe(true);
  });

  test("うるう年 2月29日 (2024) → ok: true", async () => {
    makeRpcMock();
    const result = await saveDailyLog({ log_date: "2024-02-29", weight: 70.0 });
    expect(result.ok).toBe(true);
  });

  test("月末 1月31日 → ok: true", async () => {
    makeRpcMock();
    const result = await saveDailyLog({ log_date: "2026-01-31", weight: 70.0 });
    expect(result.ok).toBe(true);
  });

  test("月末 4月30日 → ok: true", async () => {
    makeRpcMock();
    const result = await saveDailyLog({ log_date: "2026-04-30", weight: 70.0 });
    expect(result.ok).toBe(true);
  });

  // 異常系: フォーマット不正
  test("スラッシュ区切り (2026/03/13) → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "2026/03/13", weight: 70.0 });
    expect(result.ok).toBe(false);
  });

  test("空文字 → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "", weight: 70.0 });
    expect(result.ok).toBe(false);
  });

  test("数字のみ (20260313) → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "20260313", weight: 70.0 });
    expect(result.ok).toBe(false);
  });

  test("任意文字列 ('abc') → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "abc", weight: 70.0 });
    expect(result.ok).toBe(false);
  });

  // 異常系: 実在しない日付
  test("非うるう年 2月29日 (2026) → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "2026-02-29", weight: 70.0 });
    expect(result.ok).toBe(false);
  });

  test("存在しない日 4月31日 → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "2026-04-31", weight: 70.0 });
    expect(result.ok).toBe(false);
  });

  test("存在しない月 13月 → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "2026-13-01", weight: 70.0 });
    expect(result.ok).toBe(false);
  });

  test("0月 → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "2026-00-01", weight: 70.0 });
    expect(result.ok).toBe(false);
  });

  test("0日 → ok: false", async () => {
    const result = await saveDailyLog({ log_date: "2026-01-00", weight: 70.0 });
    expect(result.ok).toBe(false);
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
    const capture = makeRpcMock();
    const result = await saveDailyLog({ log_date: "2026-03-13", sleep_hours: 0 });
    expect(result.ok).toBe(true);
    expect(capture.p_fields?.sleep_hours).toBe(0);
  });

  test("training_type: 'off' → ok: true (有効値)", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({ log_date: "2026-03-13", training_type: "off" });
    expect(result.ok).toBe(true);
    expect(capture.p_fields?.training_type).toBe("off");
    expect(capture.p_fields?.leg_flag).toBe(false);
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

// ════════════════════════════════════════════════════════════════════════════
// RPC 保存戦略: UPDATE 先行 / INSERT fallback
//
// 旧実装の INSERT ... ON CONFLICT DO UPDATE は、p_fields に weight がないと
// INSERT 側の NOT NULL 制約で既存行更新でも失敗する問題があった。
// 新実装は「UPDATE 先行 → 行なければ INSERT」方式で、
// 既存行への partial update は INSERT 側に触れない。
// ════════════════════════════════════════════════════════════════════════════

describe("saveDailyLog — 既存行 partial update (fix: INSERT NOT NULL 回避)", () => {
  test("既存行に training_type だけ更新: weight なしでも ok: true", async () => {
    // 既存行への partial update は INSERT 側に触れないため weight 不要
    const capture = makeRpcMock(); // RPC 成功
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      training_type: "back",
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.training_type).toBe("back");
    expect(capture.p_fields?.leg_flag).toBe(false);
    // weight は p_fields に含まれない（既存行の値を保持する意図）
    expect("weight" in (capture.p_fields ?? {})).toBe(false);
  });

  test("既存行に work_mode だけ更新: weight なしでも ok: true", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      work_mode: "remote",
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.work_mode).toBe("remote");
    expect("weight" in (capture.p_fields ?? {})).toBe(false);
  });

  test("既存行に sleep_hours だけ更新: weight なしでも ok: true", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-03-13",
      sleep_hours: 6.5,
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.sleep_hours).toBe(6.5);
    expect("weight" in (capture.p_fields ?? {})).toBe(false);
  });

  test("RPC が new_log_requires_weight を返す → 分かりやすいメッセージ", async () => {
    // 新規日付への weight なし保存: RPC がエラーコードを返す
    makeRpcMock({ message: "new_log_requires_weight" });
    const result = await saveDailyLog({
      log_date: "2026-03-20",
      training_type: "chest",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("新しい日付を作成するには体重の入力が必要です");
    }
  });

  test("新規日付への weight あり保存は従来通り ok: true", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-03-20",
      weight: 70.0,
      training_type: "chest",
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.weight).toBe(70.0);
    expect(capture.p_fields?.training_type).toBe("chest");
    expect(capture.p_fields?.leg_flag).toBe(false);
  });
});

// ─── skipRevalidate オプション ────────────────────────────────────────────────

const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

// ════════════════════════════════════════════════════════════════════════════
// buildUpdatePayload — bed_time (#501)
// ════════════════════════════════════════════════════════════════════════════

describe("buildUpdatePayload — bed_time (#501)", () => {
  test("bed_time を指定するとペイロードに含まれる", () => {
    const payload = buildUpdatePayload({ bed_time: "23:00" });
    expect(payload.bed_time).toBe("23:00");
    expect("weight" in payload).toBe(false);
  });

  test("bed_time: null → 明示的クリア", () => {
    const payload = buildUpdatePayload({ bed_time: null });
    expect("bed_time" in payload).toBe(true);
    expect(payload.bed_time).toBeNull();
  });

  test("bed_time: undefined → ペイロードに含まれない", () => {
    const payload = buildUpdatePayload({});
    expect("bed_time" in payload).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// saveDailyLog — bed_time / sleep_hours 自動算出 (#501)
// ════════════════════════════════════════════════════════════════════════════

describe("saveDailyLog — bed_time 保存 (#501, #526)", () => {
  // #526: weigh_in_time は user input から削除。sleep_sessions.wake_at からの DB トリガーで
  // 自動同期される。saveDailyLog は weigh_in_time を payload に含まない。
  // sleep_hours 算出は user の bed_time + DB の weigh_in_time (projection 値) から行う。

  // ── 前日夜就寝（overnight シフト）──────────────────────────────────────────

  test("前日夜就寝は翌日の起床日レコードへ保存される (23:00→07:00=8h)", async () => {
    // DB "2026-04-08" に weigh_in_time: "07:00" がある → 翌日シフト + sleep_hours 算出
    const capture = makeRpcMock(undefined, {
      "2026-04-07": { bed_time: null, weigh_in_time: null },
      "2026-04-08": { bed_time: null, weigh_in_time: "07:00" },
    });
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      bed_time: "23:00",
    });

    expect(result.ok).toBe(true);
    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0]?.p_log_date).toBe("2026-04-08");
    expect(capture.calls[0]?.p_fields.bed_time).toBe("23:00");
    // #526: weigh_in_time は DB トリガー専管 → payload に含まれない
    expect("weigh_in_time" in (capture.calls[0]?.p_fields ?? {})).toBe(false);
    expect(capture.calls[0]?.p_fields.sleep_hours).toBe(8.0);
  });

  test("翌日レコードが存在しない場合、overnight 時刻でも当日に保存される (new_log_requires_weight を防ぐ)", async () => {
    // 4/8 が存在しない → シフトせず 4/7 に保存 (#511 fix)
    // DB の weigh_in_time がないため sleep_hours は算出不能
    const capture = makeRpcMock(undefined, {
      "2026-04-07": null,
      "2026-04-08": null,
    });
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      weight: 70.0,
      bed_time: "23:00",
    });

    expect(result.ok).toBe(true);
    expect(capture.calls).toHaveLength(1);
    // 翌日レコードなし → シフトしない → 当日 (4/7) に保存
    expect(capture.calls[0]?.p_log_date).toBe("2026-04-07");
    expect(capture.calls[0]?.p_fields.weight).toBe(70.0);
    expect(capture.calls[0]?.p_fields.bed_time).toBe("23:00");
    // weigh_in_time が DB にない → sleep_hours 算出不能
    expect("sleep_hours" in (capture.calls[0]?.p_fields ?? {})).toBe(false);
    expect("weigh_in_time" in (capture.calls[0]?.p_fields ?? {})).toBe(false);
  });

  // ── 当日就寝（シフトなし）── ──────────────────────────────────────────────

  test("当日深夜就寝は同日の起床日レコードへ保存される (01:30→08:00=6.5h)", async () => {
    // DB に weigh_in_time: "08:00" がある → 同日に sleep_hours 算出
    const capture = makeRpcMock(undefined, {
      "2026-04-08": { bed_time: null, weigh_in_time: "08:00" },
      "2026-04-09": null,
    });
    const result = await saveDailyLog({
      log_date: "2026-04-08",
      bed_time: "01:30",
    });

    expect(result.ok).toBe(true);
    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0]?.p_log_date).toBe("2026-04-08");
    expect(capture.calls[0]?.p_fields.sleep_hours).toBe(6.5);
    expect("weigh_in_time" in (capture.calls[0]?.p_fields ?? {})).toBe(false);
  });

  test("早朝就寝も同日の起床日レコードへ保存される (04:00→10:00=6h)", async () => {
    const capture = makeRpcMock(undefined, {
      "2026-04-08": { bed_time: null, weigh_in_time: "10:00" },
      "2026-04-09": null,
    });
    const result = await saveDailyLog({
      log_date: "2026-04-08",
      bed_time: "04:00",
    });

    expect(result.ok).toBe(true);
    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0]?.p_log_date).toBe("2026-04-08");
    expect(capture.calls[0]?.p_fields.sleep_hours).toBe(6.0);
    expect("weigh_in_time" in (capture.calls[0]?.p_fields ?? {})).toBe(false);
  });

  test("算出結果が異常値 (同一時刻→24h) の場合 sleep_hours は更新しない", async () => {
    // DB の weigh_in_time と user の bed_time が同一時刻 → delta=0 → 24h → null
    const capture = makeRpcMock(undefined, {
      "2026-04-07": { bed_time: null, weigh_in_time: "07:00" },
      "2026-04-08": null,
    });
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      bed_time: "07:00",
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.bed_time).toBe("07:00");
    // 同一時刻 → 日またぎで 24h → 無効 → sleep_hours はペイロードに含まれない
    expect("sleep_hours" in (capture.p_fields ?? {})).toBe(false);
  });

  // ── bed_time のみ更新 (DB マージ) ────────────────────────────────────────

  test("bed_time のみ更新: 翌日レコードに weigh_in_time があれば翌日起床日レコードで再計算する", async () => {
    const capture = makeRpcMock(undefined, {
      "2026-04-07": { bed_time: null, weigh_in_time: null },
      "2026-04-08": { bed_time: null, weigh_in_time: "07:00" },
    });
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      bed_time: "23:00",
    });

    expect(result.ok).toBe(true);
    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0]?.p_log_date).toBe("2026-04-08");
    expect(capture.calls[0]?.p_fields.bed_time).toBe("23:00");
    expect(capture.calls[0]?.p_fields.sleep_hours).toBe(8.0);
    expect("weigh_in_time" in (capture.calls[0]?.p_fields ?? {})).toBe(false);
  });

  test("既に起床日基準で保存済みの overnight レコードで bed_time だけ更新しても翌日に再シフトしない", async () => {
    const capture = makeRpcMock(undefined, {
      "2026-04-08": { bed_time: "23:30", weigh_in_time: "07:00" },
      "2026-04-09": null,
    });
    const result = await saveDailyLog({
      log_date: "2026-04-08",
      bed_time: "23:45",
    });

    expect(result.ok).toBe(true);
    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0]?.p_log_date).toBe("2026-04-08");
    expect(capture.calls[0]?.p_fields.bed_time).toBe("23:45");
    // 23:45→07:00 = 7h15m = 7.3h
    expect(capture.calls[0]?.p_fields.sleep_hours).toBe(7.3);
  });

  test("bed_time 更新: DB の weigh_in_time なし → sleep_hours は更新されない", async () => {
    // DB: weigh_in_time = null → 算出不能
    const capture = makeRpcMock(undefined, { bed_time: null, weigh_in_time: null });
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      bed_time: "23:00",
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.bed_time).toBe("23:00");
    // weigh_in_time が null なので算出不能 → sleep_hours はペイロードに含まれない
    expect("sleep_hours" in (capture.p_fields ?? {})).toBe(false);
  });

  test("bed_time 更新: 既存行なし (新規) → sleep_hours は更新されない", async () => {
    // DB: 行なし (null) → weigh_in_time 取得不能 → sleep_hours 算出不能
    const capture = makeRpcMock(undefined, {
      "2026-04-07": null,
      "2026-04-08": null,
    });
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      weight: 70.0,
      bed_time: "23:00",
    });

    expect(result.ok).toBe(true);
    expect(capture.p_fields?.bed_time).toBe("23:00");
    expect("sleep_hours" in (capture.p_fields ?? {})).toBe(false);
  });

  // ── 睡眠 + 食事の複合保存 ─────────────────────────────────────────────────

  test("睡眠系と食事系を同時保存しても、翌日レコードがあれば睡眠系だけ翌日の起床日レコードへ分離される", async () => {
    // DB "2026-04-08" に weigh_in_time: "07:00" → shift + sleep_hours 算出
    const capture = makeRpcMock(undefined, {
      "2026-04-07": { bed_time: null, weigh_in_time: null },
      "2026-04-08": { bed_time: null, weigh_in_time: "07:00" },
    });
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      calories: 2100,
      last_meal_end_time: "22:00",
      bed_time: "23:30",
    });

    expect(result.ok).toBe(true);
    expect(capture.calls).toHaveLength(2);
    // Call 1: 当日 → 食事系のみ（bed_time は分離）
    expect(capture.calls[0]?.p_log_date).toBe("2026-04-07");
    expect(capture.calls[0]?.p_fields.calories).toBe(2100);
    expect(capture.calls[0]?.p_fields.last_meal_end_time).toBe("22:00");
    expect("bed_time" in (capture.calls[0]?.p_fields ?? {})).toBe(false);
    // Call 2: 翌日起床日 → 睡眠系（weigh_in_time は DB トリガー専管）
    expect(capture.calls[1]?.p_log_date).toBe("2026-04-08");
    expect(capture.calls[1]?.p_fields.bed_time).toBe("23:30");
    expect("weigh_in_time" in (capture.calls[1]?.p_fields ?? {})).toBe(false);
    expect(capture.calls[1]?.p_fields.sleep_hours).toBe(7.5);
  });

  test("睡眠系と食事系を同時保存・翌日レコードなしの場合は sleep も当日にまとめて保存される", async () => {
    // DB "2026-04-07" に weigh_in_time: "07:00" → 同日に sleep_hours 算出
    // 翌日レコードなし → シフトせず当日にまとめる (#511 fix: 部分保存エラーも防ぐ)
    const capture = makeRpcMock(undefined, {
      "2026-04-07": { bed_time: null, weigh_in_time: "07:00" },
      "2026-04-08": null,
    });
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      calories: 2100,
      last_meal_end_time: "22:00",
      bed_time: "23:30",
    });

    expect(result.ok).toBe(true);
    // 翌日レコードなし → 1回のRPCで当日(4/7)にまとめる
    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0]?.p_log_date).toBe("2026-04-07");
    expect(capture.calls[0]?.p_fields.calories).toBe(2100);
    expect(capture.calls[0]?.p_fields.last_meal_end_time).toBe("22:00");
    expect(capture.calls[0]?.p_fields.bed_time).toBe("23:30");
    // weigh_in_time は DB トリガー専管 → payload に含まれない
    expect("weigh_in_time" in (capture.calls[0]?.p_fields ?? {})).toBe(false);
    expect(capture.calls[0]?.p_fields.sleep_hours).toBe(7.5);
  });

  // ── 明示クリア / 未操作 ───────────────────────────────────────────────────

  test("bed_time: null → p_fields に bed_time と sleep_hours が null で含まれる（連動クリア）", async () => {
    // bed_time: null は DB フェッチなしでクリアする
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      bed_time: null,
    });

    expect(result.ok).toBe(true);
    expect("bed_time" in (capture.p_fields ?? {})).toBe(true);
    expect(capture.p_fields?.bed_time).toBeNull();
    // bed_time クリア時は sleep_hours も連動してクリア
    expect("sleep_hours" in (capture.p_fields ?? {})).toBe(true);
    expect(capture.p_fields?.sleep_hours).toBeNull();
  });

  test("bed_time: undefined → p_fields に bed_time も sleep_hours も含まれない（未操作）", async () => {
    const capture = makeRpcMock();
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      weight: 70.0,
    });

    expect(result.ok).toBe(true);
    expect("bed_time" in (capture.p_fields ?? {})).toBe(false);
    expect("sleep_hours" in (capture.p_fields ?? {})).toBe(false);
  });

  // ── バリデーション ─────────────────────────────────────────────────────────

  test("bed_time フォーマット不正 → ok: false", async () => {
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      bed_time: "25:00",
    });
    expect(result.ok).toBe(false);
  });

  test("bed_time コロンなし → ok: false", async () => {
    const result = await saveDailyLog({
      log_date: "2026-04-07",
      bed_time: "2300",
    });
    expect(result.ok).toBe(false);
  });
});

describe("saveDailyLog — skipRevalidate オプション", () => {
  beforeEach(() => {
    mockRevalidatePath.mockClear();
  });

  it("オプションなし: 保存成功後に revalidatePath が呼ばれる", async () => {
    makeRpcMock(); // RPC 成功
    await saveDailyLog({ log_date: "2026-03-10", weight: 70.0 });
    expect(mockRevalidatePath).toHaveBeenCalled();
  });

  it("skipRevalidate: false: 保存成功後に revalidatePath が呼ばれる", async () => {
    makeRpcMock();
    await saveDailyLog({ log_date: "2026-03-10", weight: 70.0 }, { skipRevalidate: false });
    expect(mockRevalidatePath).toHaveBeenCalled();
  });

  it("skipRevalidate: true: 保存成功後に revalidatePath が呼ばれない", async () => {
    makeRpcMock();
    await saveDailyLog({ log_date: "2026-03-10", weight: 70.0 }, { skipRevalidate: true });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("skipRevalidate: true で RPC エラー: revalidatePath が呼ばれない", async () => {
    makeRpcMock({ message: "some error" });
    const result = await saveDailyLog(
      { log_date: "2026-03-10", weight: 70.0 },
      { skipRevalidate: true }
    );
    expect(result.ok).toBe(false);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
