import {
  isValidEntry,
  prepareFactorRows,
  isHighDropRate,
  calcDropPct,
  MIN_ROWS,
  HIGH_DROP_THRESHOLD,
  type FactorEntry,
  type FactorMeta,
} from "./factorAnalysisUtils";

// ── isValidEntry ─────────────────────────────────────────────────────────────

describe("isValidEntry", () => {
  const valid: FactorEntry = { label: "テスト", importance: 0.3, pct: 30 };

  it("正常なエントリは true を返す", () => {
    expect(isValidEntry(valid)).toBe(true);
  });

  it("pct が NaN のとき false を返す", () => {
    expect(isValidEntry({ ...valid, pct: NaN })).toBe(false);
  });

  it("pct が Infinity のとき false を返す", () => {
    expect(isValidEntry({ ...valid, pct: Infinity })).toBe(false);
  });

  it("pct が負値のとき false を返す", () => {
    expect(isValidEntry({ ...valid, pct: -1 })).toBe(false);
  });

  it("importance が NaN のとき false を返す", () => {
    expect(isValidEntry({ ...valid, importance: NaN })).toBe(false);
  });

  it("importance が Infinity のとき false を返す", () => {
    expect(isValidEntry({ ...valid, importance: Infinity })).toBe(false);
  });

  it("importance が負値のとき false を返す", () => {
    expect(isValidEntry({ ...valid, importance: -0.1 })).toBe(false);
  });

  it("pct = 0 は有効（重要度ゼロの特徴量）", () => {
    expect(isValidEntry({ ...valid, pct: 0, importance: 0 })).toBe(true);
  });
});

// ── prepareFactorRows ─────────────────────────────────────────────────────────

describe("prepareFactorRows", () => {
  const data: Record<string, FactorEntry> = {
    cal_lag1:      { label: "カロリー（当日）", importance: 0.5,  pct: 50 },
    p_lag1:        { label: "タンパク質",       importance: 0.3,  pct: 30 },
    c_lag1:        { label: "炭水化物",         importance: 0.2,  pct: 20 },
  };

  it("重要度の高い順にソートされる", () => {
    const { rows } = prepareFactorRows(data);
    expect(rows[0].key).toBe("cal_lag1");
    expect(rows[1].key).toBe("p_lag1");
    expect(rows[2].key).toBe("c_lag1");
  });

  it("rank が 1 始まりで付与される", () => {
    const { rows } = prepareFactorRows(data);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[2].rank).toBe(3);
  });

  it("ラベルが featureLabels の FEATURE_LABEL_MAP で解決される", () => {
    const { rows } = prepareFactorRows(data);
    // FEATURE_LABEL_MAP に cal_lag1 → "摂取 kcal（当日）" が登録されている
    expect(rows[0].label).toBe("摂取 kcal（当日）");
  });

  it("FEATURE_LABEL_MAP に未登録のキーは payload の label にフォールバックする", () => {
    const custom: Record<string, FactorEntry> = {
      unknown_feature: { label: "バックエンドラベル", importance: 1.0, pct: 100 },
    };
    const { rows } = prepareFactorRows(custom);
    expect(rows[0].label).toBe("バックエンドラベル");
  });

  it("NaN を含む無効エントリは除外される", () => {
    const withInvalid: Record<string, FactorEntry> = {
      ...data,
      bad_entry: { label: "不正", importance: NaN, pct: NaN },
    };
    const { rows, filteredOutCount } = prepareFactorRows(withInvalid);
    expect(filteredOutCount).toBe(1);
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.key === "bad_entry")).toBe(false);
  });

  it("空の data を渡すと rows=[] / filteredOutCount=0 が返る", () => {
    const { rows, filteredOutCount } = prepareFactorRows({});
    expect(rows).toHaveLength(0);
    expect(filteredOutCount).toBe(0);
  });

  it("全エントリが無効の場合 rows=[] / filteredOutCount=エントリ数", () => {
    const allInvalid: Record<string, FactorEntry> = {
      a: { label: "A", importance: NaN, pct: NaN },
      b: { label: "B", importance: NaN, pct: NaN },
    };
    const { rows, filteredOutCount } = prepareFactorRows(allInvalid);
    expect(rows).toHaveLength(0);
    expect(filteredOutCount).toBe(2);
  });
});

// ── isHighDropRate / calcDropPct ──────────────────────────────────────────────

describe("isHighDropRate", () => {
  const base: FactorMeta = {
    sample_count: 50, date_from: "2025-01-01", date_to: "2026-01-01",
    total_rows: 100, dropped_count: 35,
  };

  it("dropped_count / total_rows > HIGH_DROP_THRESHOLD で true", () => {
    expect(isHighDropRate({ ...base, dropped_count: 35, total_rows: 100 })).toBe(true);
  });

  it("dropped_count / total_rows <= HIGH_DROP_THRESHOLD で false", () => {
    expect(isHighDropRate({ ...base, dropped_count: 29, total_rows: 100 })).toBe(false);
  });

  it("dropped_count が undefined のとき false", () => {
    const { dropped_count: _dropped, ...withoutDrop } = base;
    expect(isHighDropRate(withoutDrop as FactorMeta)).toBe(false);
  });

  it("total_rows = 0 のとき false（ゼロ除算を防ぐ）", () => {
    expect(isHighDropRate({ ...base, total_rows: 0, dropped_count: 5 })).toBe(false);
  });

  it(`HIGH_DROP_THRESHOLD は ${HIGH_DROP_THRESHOLD} である`, () => {
    // ちょうど境界値
    const count = Math.round(HIGH_DROP_THRESHOLD * 100);
    expect(isHighDropRate({ ...base, dropped_count: count, total_rows: 100 })).toBe(false);
    expect(isHighDropRate({ ...base, dropped_count: count + 1, total_rows: 100 })).toBe(true);
  });
});

describe("calcDropPct", () => {
  const base: FactorMeta = {
    sample_count: 50, date_from: null, date_to: null,
    total_rows: 100, dropped_count: 35,
  };

  it("dropped_count / total_rows を百分率（整数）で返す", () => {
    expect(calcDropPct(base)).toBe(35);
  });

  it("小数点は四捨五入される", () => {
    expect(calcDropPct({ ...base, dropped_count: 33, total_rows: 100 })).toBe(33);
    expect(calcDropPct({ ...base, dropped_count: 1, total_rows: 3 })).toBe(33);
  });

  it("dropped_count が undefined のとき null", () => {
    const { dropped_count: _dropped, ...withoutDrop } = base;
    expect(calcDropPct(withoutDrop as FactorMeta)).toBeNull();
  });

  it("total_rows = 0 のとき null", () => {
    expect(calcDropPct({ ...base, total_rows: 0 })).toBeNull();
  });
});

// ── 定数の妥当性 ──────────────────────────────────────────────────────────────

describe("constants", () => {
  it("MIN_ROWS は analyze.py の MIN_ROWS = 14 と一致する", () => {
    expect(MIN_ROWS).toBe(14);
  });

  it("HIGH_DROP_THRESHOLD は 0〜1 の範囲内である", () => {
    expect(HIGH_DROP_THRESHOLD).toBeGreaterThan(0);
    expect(HIGH_DROP_THRESHOLD).toBeLessThan(1);
  });
});
