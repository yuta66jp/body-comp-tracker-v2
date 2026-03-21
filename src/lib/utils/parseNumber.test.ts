import { parseStrictNumber } from "./parseNumber";

// ─── 正常系 ──────────────────────────────────────────────────────────────────

describe("parseStrictNumber — 正常系", () => {
  it("整数を返す", () => {
    expect(parseStrictNumber("72")).toBe(72);
  });

  it("小数を返す (allowDecimal デフォルト true)", () => {
    expect(parseStrictNumber("72.5")).toBe(72.5);
  });

  it("0 を返す", () => {
    expect(parseStrictNumber("0")).toBe(0);
  });

  it("0.0 を返す", () => {
    expect(parseStrictNumber("0.0")).toBe(0);
  });

  it("前後の空白を trim して処理する", () => {
    expect(parseStrictNumber("  72.5  ")).toBe(72.5);
  });

  it("allowNegative: true のとき負数を返す", () => {
    expect(parseStrictNumber("-1", { allowNegative: true })).toBe(-1);
  });

  it("allowNegative: true のとき負の小数を返す", () => {
    expect(parseStrictNumber("-0.5", { allowNegative: true })).toBe(-0.5);
  });

  it("allowDecimal: false のとき整数を返す", () => {
    expect(parseStrictNumber("30", { allowDecimal: false })).toBe(30);
  });

  it("min/max 範囲内の値を返す", () => {
    expect(parseStrictNumber("5", { min: 0, max: 10 })).toBe(5);
    expect(parseStrictNumber("0", { min: 0, max: 10 })).toBe(0);
    expect(parseStrictNumber("10", { min: 0, max: 10 })).toBe(10);
  });

  it("大きな整数を正しく処理する", () => {
    expect(parseStrictNumber("6000")).toBe(6000);
  });
});

// ─── 異常系: 空・null・undefined ─────────────────────────────────────────────

describe("parseStrictNumber — 空・null・undefined", () => {
  it("空文字は null を返す", () => {
    expect(parseStrictNumber("")).toBeNull();
  });

  it("空白のみは null を返す", () => {
    expect(parseStrictNumber("   ")).toBeNull();
  });

  it("null は null を返す", () => {
    expect(parseStrictNumber(null)).toBeNull();
  });

  it("undefined は null を返す", () => {
    expect(parseStrictNumber(undefined)).toBeNull();
  });
});

// ─── 異常系: 部分成功パース ───────────────────────────────────────────────────

describe("parseStrictNumber — 部分成功パースを拒否する", () => {
  it("\"12abc\" は null を返す (parseFloat なら 12 になる)", () => {
    expect(parseStrictNumber("12abc")).toBeNull();
  });

  it("\"1,234\" は null を返す (カンマ区切り)", () => {
    expect(parseStrictNumber("1,234")).toBeNull();
  });

  it("\"08kg\" は null を返す (単位付き)", () => {
    expect(parseStrictNumber("08kg")).toBeNull();
  });

  it("\"72.5abc\" は null を返す", () => {
    expect(parseStrictNumber("72.5abc")).toBeNull();
  });

  it("\"abc\" は null を返す", () => {
    expect(parseStrictNumber("abc")).toBeNull();
  });
});

// ─── 異常系: 記号のみ ─────────────────────────────────────────────────────────

describe("parseStrictNumber — 記号のみは拒否する", () => {
  it("\".\" は null を返す", () => {
    expect(parseStrictNumber(".")).toBeNull();
  });

  it("\"-\" は null を返す", () => {
    expect(parseStrictNumber("-")).toBeNull();
  });

  it("\"+\" は null を返す", () => {
    expect(parseStrictNumber("+")).toBeNull();
  });

  it("\".5\" は null を返す (小数点のみ先行)", () => {
    // 整数部必須: `.5` は拒否する
    expect(parseStrictNumber(".5")).toBeNull();
  });
});

// ─── 異常系: 負数の制御 ───────────────────────────────────────────────────────

describe("parseStrictNumber — allowNegative の制御", () => {
  it("allowNegative デフォルト (false) のとき負数は null を返す", () => {
    expect(parseStrictNumber("-1")).toBeNull();
  });

  it("allowNegative: false を明示したとき負数は null を返す", () => {
    expect(parseStrictNumber("-1", { allowNegative: false })).toBeNull();
  });
});

// ─── 異常系: 小数の制御 ───────────────────────────────────────────────────────

describe("parseStrictNumber — allowDecimal の制御", () => {
  it("allowDecimal: false のとき小数は null を返す", () => {
    expect(parseStrictNumber("72.5", { allowDecimal: false })).toBeNull();
  });
});

// ─── 異常系: 範囲外 ───────────────────────────────────────────────────────────

describe("parseStrictNumber — 範囲外は null を返す", () => {
  it("min 未満は null", () => {
    expect(parseStrictNumber("5", { min: 10 })).toBeNull();
  });

  it("max 超過は null", () => {
    expect(parseStrictNumber("100", { max: 50 })).toBeNull();
  });

  it("min と一致する値は通す", () => {
    expect(parseStrictNumber("10", { min: 10 })).toBe(10);
  });

  it("max と一致する値は通す", () => {
    expect(parseStrictNumber("50", { max: 50 })).toBe(50);
  });
});
