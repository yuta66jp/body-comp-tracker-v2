import { isActiveNav } from "./nav";

describe("isActiveNav", () => {
  // ── "/" は完全一致のみ ──────────────────────────────────────────────
  it('href="/" は pathname="/" のとき true', () => {
    expect(isActiveNav("/", "/")).toBe(true);
  });

  it('href="/" は pathname="/macro" のとき false', () => {
    expect(isActiveNav("/macro", "/")).toBe(false);
  });

  it('href="/" は pathname="/settings" のとき false', () => {
    expect(isActiveNav("/settings", "/")).toBe(false);
  });

  // ── 完全一致 ────────────────────────────────────────────────────────
  it("完全一致の場合は true", () => {
    expect(isActiveNav("/macro", "/macro")).toBe(true);
    expect(isActiveNav("/settings", "/settings")).toBe(true);
    expect(isActiveNav("/foods", "/foods")).toBe(true);
  });

  // ── prefix 一致（ネストルート）───────────────────────────────────────
  it("pathname が href のネストルートの場合は true", () => {
    expect(isActiveNav("/settings/profile", "/settings")).toBe(true);
    expect(isActiveNav("/foods/edit", "/foods")).toBe(true);
    expect(isActiveNav("/history/2026-03", "/history")).toBe(true);
  });

  it("prefix は一致するが '/' 区切りでない場合は false (部分文字列マッチ不可)", () => {
    // /settingsX は /settings の prefix 一致として扱わない
    expect(isActiveNav("/settingsX", "/settings")).toBe(false);
    expect(isActiveNav("/foodsdb", "/foods")).toBe(false);
  });

  // ── 不一致 ──────────────────────────────────────────────────────────
  it("全く別のパスのとき false", () => {
    expect(isActiveNav("/macro", "/tdee")).toBe(false);
    expect(isActiveNav("/history", "/macro")).toBe(false);
  });
});
