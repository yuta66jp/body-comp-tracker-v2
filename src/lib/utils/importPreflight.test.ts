import { computeImportPreflight } from "./importPreflight";

// ─── 正常系 ──────────────────────────────────────────────────────────────────

describe("computeImportPreflight — 全行新規", () => {
  it("newCount が行数に等しく updateCount が 0", () => {
    const rows = [
      { log_date: "2026-03-01" },
      { log_date: "2026-03-02" },
      { log_date: "2026-03-03" },
    ];
    const result = computeImportPreflight(rows, 0, new Set());
    expect(result.newCount).toBe(3);
    expect(result.updateCount).toBe(0);
    expect(result.skipCount).toBe(0);
    expect(result.dateRange).toEqual({ from: "2026-03-01", to: "2026-03-03" });
  });
});

describe("computeImportPreflight — 全行更新", () => {
  it("updateCount が行数に等しく newCount が 0", () => {
    const rows = [
      { log_date: "2026-03-01" },
      { log_date: "2026-03-02" },
    ];
    const existing = new Set(["2026-03-01", "2026-03-02"]);
    const result = computeImportPreflight(rows, 0, existing);
    expect(result.newCount).toBe(0);
    expect(result.updateCount).toBe(2);
    expect(result.dateRange).toEqual({ from: "2026-03-01", to: "2026-03-02" });
  });
});

describe("computeImportPreflight — 新規と更新の混在", () => {
  it("新規と更新が正しく分類される", () => {
    const rows = [
      { log_date: "2026-03-01" }, // 既存
      { log_date: "2026-03-02" }, // 新規
      { log_date: "2026-03-03" }, // 既存
      { log_date: "2026-03-04" }, // 新規
    ];
    const existing = new Set(["2026-03-01", "2026-03-03"]);
    const result = computeImportPreflight(rows, 0, existing);
    expect(result.newCount).toBe(2);
    expect(result.updateCount).toBe(2);
  });
});

describe("computeImportPreflight — スキップ件数", () => {
  it("parseErrorCount がそのまま skipCount になる", () => {
    const rows = [{ log_date: "2026-03-01" }];
    const result = computeImportPreflight(rows, 5, new Set());
    expect(result.skipCount).toBe(5);
  });

  it("skipCount は newCount / updateCount に含まれない", () => {
    const rows = [{ log_date: "2026-03-01" }];
    const result = computeImportPreflight(rows, 3, new Set());
    expect(result.newCount + result.updateCount).toBe(1); // parsedRows の件数のみ
  });
});

describe("computeImportPreflight — 日付範囲", () => {
  it("行の順序に依存せず正しい min/max を返す", () => {
    // 降順で渡してもソートして min/max を求める
    const rows = [
      { log_date: "2026-03-15" },
      { log_date: "2026-03-01" },
      { log_date: "2026-03-10" },
    ];
    const result = computeImportPreflight(rows, 0, new Set());
    expect(result.dateRange).toEqual({ from: "2026-03-01", to: "2026-03-15" });
  });

  it("1行のとき from と to が同じ日付になる", () => {
    const rows = [{ log_date: "2026-03-05" }];
    const result = computeImportPreflight(rows, 0, new Set());
    expect(result.dateRange).toEqual({ from: "2026-03-05", to: "2026-03-05" });
  });

  it("行が0件のとき dateRange が null になる", () => {
    const result = computeImportPreflight([], 0, new Set());
    expect(result.dateRange).toBeNull();
    expect(result.newCount).toBe(0);
    expect(result.updateCount).toBe(0);
  });
});

describe("computeImportPreflight — 全フィールド空のとき", () => {
  it("全カウントが 0 で dateRange が null", () => {
    const result = computeImportPreflight([], 0, new Set());
    expect(result).toEqual({
      newCount: 0,
      updateCount: 0,
      skipCount: 0,
      dateRange: null,
    });
  });
});
