import { parseNonNegative } from "./TempFoodForm";

describe("parseNonNegative", () => {
  // ── 空文字 / 空白 → null ─────────────────────────────────────────────────

  it("空文字は null を返す", () => {
    expect(parseNonNegative("")).toBeNull();
  });

  it("空白のみも null を返す", () => {
    expect(parseNonNegative("  ")).toBeNull();
  });

  // ── 整数 ─────────────────────────────────────────────────────────────────

  it("整数はそのまま返す", () => {
    expect(parseNonNegative("350")).toBe(350);
  });

  it("0 はそのまま返す", () => {
    expect(parseNonNegative("0")).toBe(0);
  });

  // ── 小数 ─────────────────────────────────────────────────────────────────

  it("小数 10.5 を正しく返す", () => {
    expect(parseNonNegative("10.5")).toBe(10.5);
  });

  it("小数 0.5 を正しく返す", () => {
    expect(parseNonNegative("0.5")).toBe(0.5);
  });

  it("小数 100.25 を正しく返す", () => {
    expect(parseNonNegative("100.25")).toBe(100.25);
  });

  it("末尾小数点 '10.' は 10 として解釈する（Number('10.') === 10）", () => {
    // type="text" のとき入力途中の '10.' が state に残るが、
    // Number('10.') === 10 なので有効値として扱われる（バリデーション通過）
    expect(parseNonNegative("10.")).toBe(10);
  });

  // ── 負数 → null ──────────────────────────────────────────────────────────

  it("負数は null を返す", () => {
    expect(parseNonNegative("-1")).toBeNull();
  });

  it("-0.5 は null を返す", () => {
    expect(parseNonNegative("-0.5")).toBeNull();
  });

  // ── 非数値 → null ────────────────────────────────────────────────────────

  it("アルファベット文字列は null を返す", () => {
    expect(parseNonNegative("abc")).toBeNull();
  });

  it("Infinity は null を返す", () => {
    expect(parseNonNegative("Infinity")).toBeNull();
  });

  it("小数点のみ '.' は null を返す（Number('.') === NaN）", () => {
    expect(parseNonNegative(".")).toBeNull();
  });
});
