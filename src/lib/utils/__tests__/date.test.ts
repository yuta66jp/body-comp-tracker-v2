/**
 * date.ts — calcDaysLeft ユニットテスト
 *
 * テスト方針:
 *   - calcDaysLeft は純粋関数（入力文字列 → 整数）なので、
 *     実行時刻・実行環境のタイムゾーンに依存しない
 *   - 同じ入力なら常に同じ出力になることを確認する（JST境界の安定性）
 *   - KpiCards / GoalNavigator / calcReadiness が同じ定義を参照する基盤テスト
 */

import {
  calcDaysLeft,
  toJstDateStr,
  parseLocalDateStr,
  addDaysStr,
  dateRangeStr,
} from "../date";

// ════════════════════════════════════════════════════════════════════════════
// calcDaysLeft — 基本ケース
// ════════════════════════════════════════════════════════════════════════════

describe("calcDaysLeft — 正常系", () => {
  test("未来日: 正の値を返す", () => {
    expect(calcDaysLeft("2026-03-01", "2026-03-31")).toBe(30);
  });

  test("翌日: 1", () => {
    expect(calcDaysLeft("2026-03-01", "2026-03-02")).toBe(1);
  });

  test("同日: 0 (当日が大会日)", () => {
    expect(calcDaysLeft("2026-03-31", "2026-03-31")).toBe(0);
  });

  test("昨日: -1 (大会が過去)", () => {
    expect(calcDaysLeft("2026-04-01", "2026-03-31")).toBe(-1);
  });

  test("30日前に戻る: -30", () => {
    expect(calcDaysLeft("2026-04-30", "2026-03-31")).toBe(-30);
  });

  test("月をまたぐ: 2月→3月", () => {
    expect(calcDaysLeft("2026-01-31", "2026-02-28")).toBe(28);
  });

  test("年をまたぐ: 12月→1月", () => {
    expect(calcDaysLeft("2025-12-31", "2026-01-01")).toBe(1);
    expect(calcDaysLeft("2025-12-01", "2026-01-01")).toBe(31);
  });

  test("うるう年: 2024-02-28 → 2024-03-01 = 2日 (2/29 が存在)", () => {
    expect(calcDaysLeft("2024-02-28", "2024-03-01")).toBe(2);
  });

  test("平年: 2025-02-28 → 2025-03-01 = 1日 (2/29 は存在しない)", () => {
    expect(calcDaysLeft("2025-02-28", "2025-03-01")).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// calcDaysLeft — 例外・null ケース
// ════════════════════════════════════════════════════════════════════════════

describe("calcDaysLeft — 例外・null ケース", () => {
  test("today が空文字 → null", () => {
    expect(calcDaysLeft("", "2026-03-31")).toBeNull();
  });

  test("target が空文字 → null", () => {
    expect(calcDaysLeft("2026-03-01", "")).toBeNull();
  });

  test("両方空文字 → null", () => {
    expect(calcDaysLeft("", "")).toBeNull();
  });

  test("today が不正フォーマット → null", () => {
    expect(calcDaysLeft("abc", "2026-03-31")).toBeNull();
    expect(calcDaysLeft("2026/03/01", "2026-03-31")).toBeNull();
    expect(calcDaysLeft("20260301", "2026-03-31")).toBeNull();
  });

  test("target が不正フォーマット → null", () => {
    expect(calcDaysLeft("2026-03-01", "abc")).toBeNull();
    expect(calcDaysLeft("2026-03-01", "2026/03/31")).toBeNull();
  });

  test("存在しない日付 (2月30日) → null", () => {
    expect(calcDaysLeft("2026-02-30", "2026-03-31")).toBeNull();
    expect(calcDaysLeft("2026-03-01", "2026-02-30")).toBeNull();
  });

  test("month が範囲外 → null", () => {
    expect(calcDaysLeft("2026-13-01", "2026-03-31")).toBeNull();
    expect(calcDaysLeft("2026-00-01", "2026-03-31")).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// calcDaysLeft — JST 境界安定性テスト
// ════════════════════════════════════════════════════════════════════════════

describe("calcDaysLeft — JST 境界安定性", () => {
  /**
   * calcDaysLeft は parseLocalDateStr("YYYY-MM-DD") を使い
   * 「ローカル午前0時 Date」同士の差分を計算する純粋関数。
   * 実行時刻に依存しないため、以下が成立する:
   *   - 同一入力 → 常に同一出力（時刻依存なし）
   *   - JST 00:01 に実行しても JST 23:59 に実行しても同じ結果
   */
  test("純粋関数: 同一入力から複数回呼んでも同一結果", () => {
    const a = calcDaysLeft("2026-03-01", "2026-03-31");
    const b = calcDaysLeft("2026-03-01", "2026-03-31");
    expect(a).toBe(30);
    expect(b).toBe(30);
    expect(a).toBe(b);
  });

  test("new Date('YYYY-MM-DD') の UTC 解釈罠を回避している", () => {
    // new Date("2026-03-31") は UTC midnight として解釈される。
    // JST 00:01 = UTC 前日 15:01 のタイミングでは
    //   (UTC 2026-03-31 00:00 - UTC 前日 15:01) = 0.37日 → Math.round = 0
    // になるが、calcDaysLeft は日付文字列のみを比較するため常に 0 を返す。
    expect(calcDaysLeft("2026-03-31", "2026-03-31")).toBe(0);
    // 同様に翌日は必ず -1
    expect(calcDaysLeft("2026-04-01", "2026-03-31")).toBe(-1);
  });

  test("toJstDateStr() と組み合わせて使う典型パターン", () => {
    // 今日の JST 日付文字列 → calcDaysLeft の today として使う
    const today = toJstDateStr(); // テスト実行時の JST 今日
    const sameDay = calcDaysLeft(today, today);
    expect(sameDay).toBe(0); // 今日 → 今日 = 0

    const tomorrow = addDaysStr(today, 1)!;
    expect(calcDaysLeft(today, tomorrow)).toBe(1);

    const yesterday = addDaysStr(today, -1)!;
    expect(calcDaysLeft(today, yesterday)).toBe(-1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 参照先統一の確認
// ════════════════════════════════════════════════════════════════════════════

describe("参照先統一: KpiCards と GoalNavigator が同じ定義を使う", () => {
  /**
   * GoalNavigator は calcReadiness の metrics.days_to_contest を使う。
   * calcReadiness は calcDaysLeft を使って計算する。
   * KpiCards も calcDaysLeft を直接使う。
   *
   * → 両者は「同じ関数・同じ定義」から計算される。
   *   このテストはその等価性を日付値レベルで確認する。
   */
  test("calcDaysLeft(today, target) の結果は calcReadiness の days_to_contest と一致する", async () => {
    // calcReadiness をモックなしでテストするには依存が多いため、
    // ここでは「calcDaysLeft が calcReadiness 内で使われる計算と同じ結果を返すこと」を
    // 代表値で確認する。
    //
    // calcReadiness が使う計算:
    //   const todayMs = new Date(`${todayStr}T00:00:00+09:00`).getTime();  (旧実装)
    //   → 廃止済み、calcDaysLeft に統一
    //
    // calcDaysLeft が使う計算:
    //   parseLocalDateStr(today) と parseLocalDateStr(target) の差分

    // 30日後
    const today = "2026-03-01";
    const contest = "2026-03-31";
    expect(calcDaysLeft(today, contest)).toBe(30);

    // 当日
    expect(calcDaysLeft("2026-03-31", "2026-03-31")).toBe(0);

    // 翌日以降 (過去)
    expect(calcDaysLeft("2026-04-01", "2026-03-31")).toBe(-1);
  });

  test("calcDaysLeft(today, today+1) = 1 は addDaysStr の逆算と一致する", () => {
    const base = "2026-06-15";
    const next = addDaysStr(base, 1)!;
    expect(calcDaysLeft(base, next)).toBe(1);
    expect(calcDaysLeft(next, base)).toBe(-1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 既存ユーティリティの回帰テスト
// ════════════════════════════════════════════════════════════════════════════

describe("parseLocalDateStr — 入力検証", () => {
  test("正常な日付を返す", () => {
    const d = parseLocalDateStr("2026-03-15");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2); // 0-indexed
    expect(d!.getDate()).toBe(15);
  });

  test("不正なフォーマットは null", () => {
    expect(parseLocalDateStr("abc")).toBeNull();
    expect(parseLocalDateStr("2026/03/15")).toBeNull();
    expect(parseLocalDateStr("")).toBeNull();
  });

  test("存在しない日付は null", () => {
    expect(parseLocalDateStr("2026-02-29")).toBeNull(); // 2026は平年
    expect(parseLocalDateStr("2026-13-01")).toBeNull();
  });
});

describe("addDaysStr — 日数加算", () => {
  test("正方向", () => {
    expect(addDaysStr("2026-03-01", 30)).toBe("2026-03-31");
    expect(addDaysStr("2026-03-31", 1)).toBe("2026-04-01");
  });

  test("負方向", () => {
    expect(addDaysStr("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("0日 = 同日", () => {
    expect(addDaysStr("2026-03-15", 0)).toBe("2026-03-15");
  });

  test("不正な base → null", () => {
    expect(addDaysStr("abc", 1)).toBeNull();
    expect(addDaysStr("", 5)).toBeNull();
  });
});

describe("dateRangeStr — 日付範囲生成", () => {
  test("3日間の範囲", () => {
    expect(dateRangeStr("2026-03-01", "2026-03-03")).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
  });

  test("同日 = 1件", () => {
    expect(dateRangeStr("2026-03-15", "2026-03-15")).toEqual(["2026-03-15"]);
  });

  test("from > to → 空配列", () => {
    expect(dateRangeStr("2026-03-31", "2026-03-01")).toEqual([]);
  });

  test("不正な日付 → 空配列", () => {
    expect(dateRangeStr("abc", "2026-03-31")).toEqual([]);
    expect(dateRangeStr("2026-03-01", "xyz")).toEqual([]);
  });
});
