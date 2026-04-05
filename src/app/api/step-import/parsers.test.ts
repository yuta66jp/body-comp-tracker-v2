/**
 * step-import パーサのユニットテスト
 *
 * parseCsv / parseJson のエッジケースと境界値を検証する。
 */

import { parseCsv, parseJson, parseStepFile } from "./parsers";

// ── parseCsv ─────────────────────────────────────────────────────────────────

describe("parseCsv", () => {
  it("正常系: 複数行を正しくパースする", () => {
    const csv = "date,step_count\n2024-01-15,8432\n2024-01-16,12100";
    const result = parseCsv(csv);
    expect(result).toEqual({
      ok: true,
      records: [
        { date: "2024-01-15", stepCount: 8432 },
        { date: "2024-01-16", stepCount: 12100 },
      ],
      invalidRows: 0,
    });
  });

  it("CRLF 改行を正しく処理する", () => {
    const csv = "date,step_count\r\n2024-01-15,8432\r\n2024-01-16,5000";
    const result = parseCsv(csv);
    expect(result).toEqual({
      ok: true,
      records: [
        { date: "2024-01-15", stepCount: 8432 },
        { date: "2024-01-16", stepCount: 5000 },
      ],
      invalidRows: 0,
    });
  });

  it("BOM 付きヘッダを受け付ける（Excel 保存 CSV 対応）", () => {
    const csv = "\uFEFFdate,step_count\n2024-01-15,8432";
    const result = parseCsv(csv);
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-15", stepCount: 8432 }],
      invalidRows: 0,
    });
  });

  it("空行を無視する", () => {
    const csv = "date,step_count\n2024-01-15,8432\n\n2024-01-17,6200\n";
    const result = parseCsv(csv);
    expect(result).toEqual({
      ok: true,
      records: [
        { date: "2024-01-15", stepCount: 8432 },
        { date: "2024-01-17", stepCount: 6200 },
      ],
      invalidRows: 0,
    });
  });

  it("重複日付は後勝ちで上書きする", () => {
    const csv = "date,step_count\n2024-01-15,8432\n2024-01-15,9999";
    const result = parseCsv(csv);
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-15", stepCount: 9999 }],
      invalidRows: 0,
    });
  });

  it("日付形式が不正な行は invalidRows にカウントしてスキップする", () => {
    const csv = "date,step_count\n2024-01-15,8432\n20240116,5000\nnot-a-date,3000";
    const result = parseCsv(csv);
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-15", stepCount: 8432 }],
      invalidRows: 2,
    });
  });

  it("存在しない日付 (2026-02-31) は invalidRows にカウントしてスキップする", () => {
    const csv = "date,step_count\n2026-02-31,8000\n2024-01-16,5000";
    const result = parseCsv(csv);
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-16", stepCount: 5000 }],
      invalidRows: 1,
    });
  });

  it("存在しない月 (2026-13-01) は invalidRows にカウントしてスキップする", () => {
    const csv = "date,step_count\n2026-13-01,8000";
    const result = parseCsv(csv);
    expect(result).toEqual({ ok: true, records: [], invalidRows: 1 });
  });

  it("存在しない日 (2026-04-31) は invalidRows にカウントしてスキップする", () => {
    const csv = "date,step_count\n2026-04-31,8000";
    const result = parseCsv(csv);
    expect(result).toEqual({ ok: true, records: [], invalidRows: 1 });
  });

  it("うるう年でない年の 2月29日 (2025-02-29) は invalidRows にカウントしてスキップする", () => {
    const csv = "date,step_count\n2025-02-29,8000";
    const result = parseCsv(csv);
    expect(result).toEqual({ ok: true, records: [], invalidRows: 1 });
  });

  it("うるう年の 2月29日 (2024-02-29) は通過する", () => {
    const csv = "date,step_count\n2024-02-29,8000";
    const result = parseCsv(csv);
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-02-29", stepCount: 8000 }],
      invalidRows: 0,
    });
  });

  it("step_count が float の行は invalidRows にカウントしてスキップする", () => {
    const csv = "date,step_count\n2024-01-15,8432.9\n2024-01-16,5000";
    const result = parseCsv(csv);
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-16", stepCount: 5000 }],
      invalidRows: 1,
    });
  });

  it("step_count が負値の行は invalidRows にカウントしてスキップする", () => {
    const csv = "date,step_count\n2024-01-15,-1";
    const result = parseCsv(csv);
    expect(result).toEqual({ ok: true, records: [], invalidRows: 1 });
  });

  it("step_count が文字列の行は invalidRows にカウントしてスキップする", () => {
    const csv = "date,step_count\n2024-01-15,abc";
    const result = parseCsv(csv);
    expect(result).toEqual({ ok: true, records: [], invalidRows: 1 });
  });

  it("コンマなし行は invalidRows にカウントしてスキップする", () => {
    const csv = "date,step_count\n2024-01-15";
    const result = parseCsv(csv);
    expect(result).toEqual({ ok: true, records: [], invalidRows: 1 });
  });

  it("ヘッダが不正な場合は ok: false を返す", () => {
    const csv = "Date,StepCount\n2024-01-15,8432";
    const result = parseCsv(csv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("CSV ヘッダーが不正です");
    }
  });

  it("空文字列（ヘッダ後が空）は ok: true で records: [] を返す", () => {
    const result = parseCsv("date,step_count");
    expect(result).toEqual({ ok: true, records: [], invalidRows: 0 });
  });
});

// ── parseJson ────────────────────────────────────────────────────────────────

describe("parseJson", () => {
  it("正常系: 複数要素を正しくパースする", () => {
    const json = '[{"date":"2024-01-15","step_count":8432},{"date":"2024-01-16","step_count":12100}]';
    const result = parseJson(json);
    expect(result).toEqual({
      ok: true,
      records: [
        { date: "2024-01-15", stepCount: 8432 },
        { date: "2024-01-16", stepCount: 12100 },
      ],
      invalidRows: 0,
    });
  });

  it("空配列は ok: true で records: [] を返す", () => {
    const result = parseJson("[]");
    expect(result).toEqual({ ok: true, records: [], invalidRows: 0 });
  });

  it("step_count が 8432.0（JS では整数）は通過する", () => {
    // JSON.parse('8432.0') === 8432（JS は整数として扱う）
    const result = parseJson('[{"date":"2024-01-15","step_count":8432.0}]');
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-15", stepCount: 8432 }],
      invalidRows: 0,
    });
  });

  it("存在しない日付 (2026-02-31) は invalidRows にカウントしてスキップする", () => {
    const result = parseJson('[{"date":"2026-02-31","step_count":8000},{"date":"2024-01-16","step_count":5000}]');
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-16", stepCount: 5000 }],
      invalidRows: 1,
    });
  });

  it("うるう年でない年の 2月29日 (2025-02-29) は invalidRows にカウントしてスキップする", () => {
    const result = parseJson('[{"date":"2025-02-29","step_count":8000}]');
    expect(result).toEqual({ ok: true, records: [], invalidRows: 1 });
  });

  it("うるう年の 2月29日 (2024-02-29) は通過する", () => {
    const result = parseJson('[{"date":"2024-02-29","step_count":8000}]');
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-02-29", stepCount: 8000 }],
      invalidRows: 0,
    });
  });

  it("step_count が小数点付き浮動小数点（例: 8432.9）は invalidRows にカウントされる", () => {
    const result = parseJson('[{"date":"2024-01-15","step_count":8432.9}]');
    expect(result).toEqual({ ok: true, records: [], invalidRows: 1 });
  });

  it("step_count が文字列数値（\"8432\"）も通過する", () => {
    const result = parseJson('[{"date":"2024-01-15","step_count":"8432"}]');
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-15", stepCount: 8432 }],
      invalidRows: 0,
    });
  });

  it("重複日付は後勝ちで上書きする", () => {
    const json = '[{"date":"2024-01-15","step_count":8432},{"date":"2024-01-15","step_count":9999}]';
    const result = parseJson(json);
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-15", stepCount: 9999 }],
      invalidRows: 0,
    });
  });

  it("不正な要素（null・プリミティブ）は invalidRows にカウントしてスキップする", () => {
    const json = '[null,{"date":"2024-01-15","step_count":8432},42]';
    const result = parseJson(json);
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-15", stepCount: 8432 }],
      invalidRows: 2,
    });
  });

  it("配列以外の JSON（オブジェクト）は ok: false を返す", () => {
    const result = parseJson('{"date":"2024-01-15","step_count":8432}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("配列形式の JSON");
    }
  });

  it("不正な JSON 文字列は ok: false を返す", () => {
    const result = parseJson("not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("JSON のパースに失敗");
    }
  });

  it("step_count が負値の行は invalidRows にカウントしてスキップする", () => {
    const result = parseJson('[{"date":"2024-01-15","step_count":-1}]');
    expect(result).toEqual({ ok: true, records: [], invalidRows: 1 });
  });
});

// ── parseStepFile ────────────────────────────────────────────────────────────

describe("parseStepFile", () => {
  it(".csv ファイル名は parseCsv に委譲する", () => {
    const result = parseStepFile("date,step_count\n2024-01-15,8432", "daily_steps.csv");
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-15", stepCount: 8432 }],
      invalidRows: 0,
    });
  });

  it(".json ファイル名は parseJson に委譲する", () => {
    const result = parseStepFile('[{"date":"2024-01-15","step_count":8432}]', "daily_steps.json");
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-15", stepCount: 8432 }],
      invalidRows: 0,
    });
  });

  it("拡張子が大文字（.JSON）でも parseJson に委譲する", () => {
    const result = parseStepFile('[{"date":"2024-01-15","step_count":8432}]', "steps.JSON");
    expect(result).toEqual({
      ok: true,
      records: [{ date: "2024-01-15", stepCount: 8432 }],
      invalidRows: 0,
    });
  });
});
