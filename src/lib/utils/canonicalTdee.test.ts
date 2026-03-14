/**
 * canonical TDEE batch 値消費テスト
 *
 * batch canonical 方式のアサーション:
 *   - analytics_cache["enriched_logs"] の tdee_estimated / avg_tdee_7d / avg_calories_7d を
 *     front がそのまま読み取れること
 *   - null / undefined / NaN が front で露出しないこと (null に正規化されること)
 *   - batch データなし (enriched_rows が空) でも fallback が成立すること
 *
 * 注: このテストは "enrich.py が正しく計算するか" ではなく
 *     "front が canonical 値を正しく扱うか" を検証する。
 */

import type { EnrichedLogPayloadRow } from "@/lib/supabase/types";

// ── ヘルパー: page.tsx / tdee/page.tsx と同じロジックで avg_tdee_7d を読む ──

/**
 * enrichedRows の末尾行の avg_tdee_7d を使って直近 TDEE 平均を返す。
 * avg_tdee_7d が undefined / null の場合は末尾 7 件の tdee_estimated を fallback とする。
 * これは tdee/page.tsx の実装と同一のロジック。
 */
function readAvgTdeeFromBatch(enrichedRows: EnrichedLogPayloadRow[]): number | null {
  const lastRow = enrichedRows.at(-1);
  if (lastRow?.avg_tdee_7d != null) {
    return lastRow.avg_tdee_7d;
  }
  // fallback: 末尾 7 件の tdee_estimated 平均
  const vals = enrichedRows
    .slice(-7)
    .map((r) => r.tdee_estimated)
    .filter((v): v is number => v !== null);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * enrichedRows の末尾行の avg_calories_7d を使って直近カロリー平均を返す。
 * avg_calories_7d が undefined / null の場合は null を返す。
 */
function readAvgCalories7dFromBatch(enrichedRows: EnrichedLogPayloadRow[]): number | null {
  const lastRow = enrichedRows.at(-1);
  return lastRow?.avg_calories_7d ?? null;
}

// ── テストデータ ──

const makeRow = (
  log_date: string,
  tdee: number | null,
  avg_tdee_7d?: number | null,
  avg_calories_7d?: number | null
): EnrichedLogPayloadRow => ({
  log_date,
  weight_sma7: 65.0,
  tdee_estimated: tdee,
  avg_tdee_7d,
  avg_calories_7d,
});

// ── テストスイート ──

describe("canonical TDEE batch 値の読み取り", () => {
  it("avg_tdee_7d が存在する場合はその値を返す", () => {
    const rows: EnrichedLogPayloadRow[] = [
      makeRow("2026-03-10", 2200, null),
      makeRow("2026-03-11", 2150, null),
      makeRow("2026-03-12", 2300, null),
      makeRow("2026-03-13", 2250, 2230), // avg_tdee_7d = 2230
    ];
    expect(readAvgTdeeFromBatch(rows)).toBe(2230);
  });

  it("avg_tdee_7d が null の場合は末尾 7 件の tdee_estimated を平均する (fallback)", () => {
    const rows: EnrichedLogPayloadRow[] = [
      makeRow("2026-03-08", 2100, null),
      makeRow("2026-03-09", 2200, null),
      makeRow("2026-03-10", 2300, null),
      makeRow("2026-03-11", 2200, null), // avg_tdee_7d なし → fallback
    ];
    const result = readAvgTdeeFromBatch(rows);
    expect(result).not.toBeNull();
    // (2100 + 2200 + 2300 + 2200) / 4 = 2200
    expect(result).toBeCloseTo(2200, 0);
  });

  it("avg_tdee_7d が undefined (古いバッチ結果) の場合も fallback が動く", () => {
    // avg_tdee_7d フィールド自体が存在しない
    const rows: EnrichedLogPayloadRow[] = [
      { log_date: "2026-03-12", weight_sma7: 65.0, tdee_estimated: 2200 },
      { log_date: "2026-03-13", weight_sma7: 64.9, tdee_estimated: 2300 },
    ];
    const result = readAvgTdeeFromBatch(rows);
    expect(result).not.toBeNull();
    // (2200 + 2300) / 2 = 2250
    expect(result).toBeCloseTo(2250, 0);
  });

  it("enrichedRows が空の場合は null を返す (fallback 成立)", () => {
    expect(readAvgTdeeFromBatch([])).toBeNull();
  });

  it("全エントリの tdee_estimated が null の場合は null を返す", () => {
    const rows: EnrichedLogPayloadRow[] = [
      makeRow("2026-03-12", null, null),
      makeRow("2026-03-13", null, null),
    ];
    expect(readAvgTdeeFromBatch(rows)).toBeNull();
  });

  it("avg_calories_7d が存在する場合はその値を返す", () => {
    const rows: EnrichedLogPayloadRow[] = [
      makeRow("2026-03-12", 2200, 2200, 1850),
      makeRow("2026-03-13", 2300, 2250, 1900),
    ];
    expect(readAvgCalories7dFromBatch(rows)).toBe(1900);
  });

  it("avg_calories_7d が undefined の場合は null を返す", () => {
    const rows: EnrichedLogPayloadRow[] = [
      { log_date: "2026-03-13", weight_sma7: 65.0, tdee_estimated: 2200 },
    ];
    expect(readAvgCalories7dFromBatch(rows)).toBeNull();
  });
});

describe("canonical 値の null/NaN 露出防止", () => {
  it("tdee_estimated が null の行は表示対象から除外できる", () => {
    const rows: EnrichedLogPayloadRow[] = [
      makeRow("2026-03-10", 2200),
      makeRow("2026-03-11", null), // 初期 min_periods 未満
      makeRow("2026-03-12", 2300),
    ];
    const valid = rows.filter((r) => r.tdee_estimated !== null);
    expect(valid).toHaveLength(2);
    expect(valid.every((r) => r.tdee_estimated !== null)).toBe(true);
  });

  it("avg_tdee_7d の null を Math.round に渡さない (undefined/null ガード)", () => {
    const rows: EnrichedLogPayloadRow[] = [
      makeRow("2026-03-13", 2200, null),
    ];
    const lastRow = rows.at(-1)!;
    // != null は undefined と null の両方を弾く
    const display = lastRow.avg_tdee_7d != null ? Math.round(lastRow.avg_tdee_7d) : null;
    expect(display).toBeNull();
  });

  it("avg_tdee_7d が正常値のとき Math.round して整数を返す", () => {
    const rows: EnrichedLogPayloadRow[] = [
      makeRow("2026-03-13", 2200, 2213.6),
    ];
    const lastRow = rows.at(-1)!;
    const display = lastRow.avg_tdee_7d != null ? Math.round(lastRow.avg_tdee_7d) : null;
    expect(display).toBe(2214);
  });
});

describe("batch データなし (unavailable) でも fallback が成立すること", () => {
  it("enrichedRows が空でも avgTdee = null で graceful に処理できる", () => {
    const enrichedRows: EnrichedLogPayloadRow[] = [];
    const avgTdee = readAvgTdeeFromBatch(enrichedRows);
    // null を受け取ったコンポーネントは fallback 表示する
    expect(avgTdee).toBeNull();
    // null に対して数値演算を行わない (toLocaleString は呼ばない)
    const display = avgTdee !== null ? avgTdee.toLocaleString() : "—";
    expect(display).toBe("—");
  });
});
