import { toJstDateStr, toLocalDateStr, addDaysStr, dateRangeStr, parseLocalDateStr } from "./date";

// ─────────────────────────────────────────────
// toJstDateStr — JST 固定の日付文字列生成
// ─────────────────────────────────────────────
describe("toJstDateStr", () => {
  it("YYYY-MM-DD フォーマットを返す", () => {
    expect(toJstDateStr(new Date("2026-03-08T00:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("引数なしは現在の JST 日付を返す", () => {
    expect(toJstDateStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * JST 固定テスト:
   * UTC 2026-03-08T15:30:00Z = JST 2026-03-09T00:30:00+09:00
   * → "2026-03-09" を返すべき（UTC では 2026-03-08）
   */
  it("UTC 15:30 は JST 翌日 0:30 になるため翌日の日付を返す", () => {
    const utc = new Date("2026-03-08T15:30:00.000Z");
    expect(toJstDateStr(utc)).toBe("2026-03-09");
  });

  /**
   * UTC 2026-03-08T00:30:00Z = JST 2026-03-08T09:30:00+09:00
   * → "2026-03-08" を返すべき（UTC でも同日）
   */
  it("UTC 00:30 は JST 同日 9:30 なので同じ日付を返す", () => {
    const utc = new Date("2026-03-08T00:30:00.000Z");
    expect(toJstDateStr(utc)).toBe("2026-03-08");
  });

  /**
   * JST の深夜帯 (UTC前日の 15:00〜23:59) で日付ズレが起きないか確認
   * UTC 2026-03-07T23:59:59Z = JST 2026-03-08T08:59:59+09:00 → "2026-03-08"
   */
  it("UTC 前日 23:59 は JST 当日 08:59 なので当日日付を返す", () => {
    const utc = new Date("2026-03-07T23:59:59.000Z");
    expect(toJstDateStr(utc)).toBe("2026-03-08");
  });

  /**
   * UTC の環境（サーバー）と JST の環境（ブラウザ）で同じ Date を渡したとき
   * toJstDateStr は TZ 依存ではなく常に同じ JST 日付を返す
   */
  it("サーバー(UTC)とブラウザ(JST)で同じ結果になること: UTC 15:00 → JST 翌日", () => {
    // UTC サーバーで new Date("2026-03-08T15:00:00Z") を生成した場合
    const utc = new Date("2026-03-08T15:00:00Z");
    // 実行環境 TZ に関わらず "2026-03-09" (JST) を返す
    expect(toJstDateStr(utc)).toBe("2026-03-09");
  });

  it("年をまたぐ境界: UTC 2025-12-31T15:00:00Z = JST 2026-01-01", () => {
    expect(toJstDateStr(new Date("2025-12-31T15:00:00Z"))).toBe("2026-01-01");
  });

  it("月をまたぐ境界: UTC 2026-03-31T15:00:00Z = JST 2026-04-01", () => {
    expect(toJstDateStr(new Date("2026-03-31T15:00:00Z"))).toBe("2026-04-01");
  });
});

// toLocalDateStr は toJstDateStr の deprecated alias
describe("toLocalDateStr (deprecated alias)", () => {
  it("toJstDateStr と同じ結果を返す", () => {
    const d = new Date("2026-03-08T15:30:00Z");
    expect(toLocalDateStr(d)).toBe(toJstDateStr(d));
  });
});

// ─────────────────────────────────────────────
// parseLocalDateStr — 文字列 → Date の変換と検証
// ─────────────────────────────────────────────
describe("parseLocalDateStr", () => {
  it("正常な日付を Date に変換する", () => {
    const d = parseLocalDateStr("2026-03-08");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(8);
  });

  it("うるう年の 2/29 は有効", () => {
    expect(parseLocalDateStr("2024-02-29")).not.toBeNull();
  });

  it("存在しない日付 '2026-02-31' は null を返す", () => {
    expect(parseLocalDateStr("2026-02-31")).toBeNull();
  });

  it("月が範囲外 '2026-13-01' は null を返す", () => {
    expect(parseLocalDateStr("2026-13-01")).toBeNull();
  });

  it("月が 0 '2026-00-01' は null を返す", () => {
    expect(parseLocalDateStr("2026-00-01")).toBeNull();
  });

  it("'abc' は null を返す", () => {
    expect(parseLocalDateStr("abc")).toBeNull();
  });

  it("スラッシュ区切り '2026/03/01' は null を返す", () => {
    expect(parseLocalDateStr("2026/03/01")).toBeNull();
  });

  it("空文字は null を返す", () => {
    expect(parseLocalDateStr("")).toBeNull();
  });

  it("うるう年でない年の 2/29 は null を返す", () => {
    expect(parseLocalDateStr("2026-02-29")).toBeNull();
  });
});

// ─────────────────────────────────────────────
// addDaysStr
// ─────────────────────────────────────────────
describe("addDaysStr", () => {
  it("正の日数を加算できる", () => {
    expect(addDaysStr("2026-03-01", 7)).toBe("2026-03-08");
  });

  it("負の日数で減算できる", () => {
    expect(addDaysStr("2026-03-08", -7)).toBe("2026-03-01");
  });

  it("月をまたぐ加算ができる", () => {
    expect(addDaysStr("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("0日は同じ日付を返す", () => {
    expect(addDaysStr("2026-03-08", 0)).toBe("2026-03-08");
  });

  it("不正な base '2026/03/08' は null を返す", () => {
    expect(addDaysStr("2026/03/08", 1)).toBeNull();
  });

  it("不正な base '存在しない日付' は null を返す", () => {
    expect(addDaysStr("2026-02-31", 1)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// dateRangeStr
// ─────────────────────────────────────────────
describe("dateRangeStr", () => {
  it("from と to が同じ場合は1要素の配列を返す", () => {
    expect(dateRangeStr("2026-03-08", "2026-03-08")).toEqual(["2026-03-08"]);
  });

  it("指定した範囲の日付配列を返す", () => {
    expect(dateRangeStr("2026-03-06", "2026-03-08")).toEqual([
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
    ]);
  });

  it("from > to の場合は空配列を返す", () => {
    expect(dateRangeStr("2026-03-08", "2026-03-06")).toEqual([]);
  });

  it("不正な from は空配列を返す", () => {
    expect(dateRangeStr("abc", "2026-03-08")).toEqual([]);
  });

  it("不正な to は空配列を返す", () => {
    expect(dateRangeStr("2026-03-08", "2026-13-01")).toEqual([]);
  });
});
