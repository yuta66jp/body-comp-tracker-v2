import { toLocalDateStr, addDaysStr, dateRangeStr } from "./date";

describe("toLocalDateStr", () => {
  it("指定した Date をローカル YYYY-MM-DD に変換する", () => {
    const d = new Date(2026, 2, 8); // 2026-03-08 (月は 0 始まり)
    expect(toLocalDateStr(d)).toBe("2026-03-08");
  });

  it("引数なしは現在の日付を返す", () => {
    const result = toLocalDateStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * JSTずれテスト:
   * UTC 2026-03-07T15:00:00Z = JST 2026-03-08T00:00:00+09:00
   * toISOString() では "2026-03-07" になるが、
   * ローカルタイムゾーンが JST なら toLocalDateStr() は "2026-03-08" になるべき。
   *
   * テスト実行環境のタイムゾーンが UTC の場合は同じ結果になるため、
   * ここでは「YYYY-MM-DD フォーマットであること」と「Date の年月日と一致すること」を検証する。
   */
  it("UTC 2026-03-07T15:00:00Z の場合、ローカル日付を正しく返す", () => {
    const utcMidnight = new Date("2026-03-07T15:00:00Z");
    const result = toLocalDateStr(utcMidnight);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // ローカル日付が正しく使われること
    expect(result).toBe(
      `${utcMidnight.getFullYear()}-${String(utcMidnight.getMonth() + 1).padStart(2, "0")}-${String(utcMidnight.getDate()).padStart(2, "0")}`
    );
  });

  it("UTC 00:00 境界: UTC 2026-03-07T00:00:00Z は toISOString では 2026-03-07 だが、ローカル日付を返す", () => {
    const d = new Date("2026-03-07T00:00:00Z");
    const result = toLocalDateStr(d);
    // ローカル年月日と一致すること（toISOString と異なる可能性がある）
    const localYear = d.getFullYear();
    const localMonth = String(d.getMonth() + 1).padStart(2, "0");
    const localDay = String(d.getDate()).padStart(2, "0");
    expect(result).toBe(`${localYear}-${localMonth}-${localDay}`);
  });
});

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
});

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
});
