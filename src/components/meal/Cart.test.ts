import { normalizeGrams } from "./Cart";

describe("normalizeGrams", () => {
  // ── 空文字 / 不正入力 → fallback に戻す ───────────────────────────────────

  it("空文字は fallback を返す", () => {
    expect(normalizeGrams("", 100)).toBe(100);
  });

  it("空白のみも fallback を返す", () => {
    expect(normalizeGrams("  ", 100)).toBe(100);
  });

  it("アルファベット文字列は fallback を返す", () => {
    expect(normalizeGrams("abc", 100)).toBe(100);
  });

  it("NaN になる文字列 (--5) は fallback を返す", () => {
    expect(normalizeGrams("--5", 100)).toBe(100);
  });

  it("Infinity 文字列は fallback を返す", () => {
    expect(normalizeGrams("Infinity", 100)).toBe(100);
  });

  // ── 有効な数値 ────────────────────────────────────────────────────────────

  it("正の整数はそのまま返す", () => {
    expect(normalizeGrams("250", 100)).toBe(250);
  });

  it("0 はそのまま返す（カートに残したまま 0g にできる）", () => {
    expect(normalizeGrams("0", 100)).toBe(0);
  });

  it("小数はそのまま返す（小数入力を許容）", () => {
    expect(normalizeGrams("150.5", 100)).toBe(150.5);
  });

  // ── 負数 → 0 にクランプ ──────────────────────────────────────────────────

  it("負数は 0 にクランプする", () => {
    expect(normalizeGrams("-5", 100)).toBe(0);
  });

  it("-0 は 0 を返す", () => {
    expect(normalizeGrams("-0", 100)).toBe(0);
  });

  // ── fallback が 0 のとき ──────────────────────────────────────────────────

  it("fallback が 0 で空文字を渡すと 0 を返す", () => {
    expect(normalizeGrams("", 0)).toBe(0);
  });

  it("fallback が 0 で不正文字列を渡すと 0 を返す", () => {
    expect(normalizeGrams("xyz", 0)).toBe(0);
  });

  // ── 全消し → 再入力のシナリオ ────────────────────────────────────────────

  it("100 から全消しして 250 と打った場合: normalizeGrams('250', 100) === 250", () => {
    // 全消し中は editingGrams に '' が保持される（テスト対象外: UI state）
    // blur 時点では新しい値 '250' が渡る
    expect(normalizeGrams("250", 100)).toBe(250);
  });

  it("全消し後に未入力のまま blur した場合は元の値に戻る", () => {
    expect(normalizeGrams("", 100)).toBe(100);
  });
});
