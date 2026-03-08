import { parseCSV, splitCSVLine } from "./csvParser";

describe("splitCSVLine", () => {
  it("通常のセルを分割できる", () => {
    expect(splitCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("クォート付きセル内のカンマを無視する", () => {
    expect(splitCSVLine('"hello, world",foo,bar')).toEqual([
      "hello, world",
      "foo",
      "bar",
    ]);
  });

  it("ダブルクォートのエスケープ (\"\") を処理する", () => {
    expect(splitCSVLine('"say ""hi""",ok')).toEqual(['say "hi"', "ok"]);
  });

  it("空のセルを正しく扱う", () => {
    expect(splitCSVLine("a,,c")).toEqual(["a", "", "c"]);
  });
});

describe("parseCSV", () => {
  it("正常系: 全列揃ったケース", () => {
    const csv = [
      "log_date,weight,calories,protein,fat,carbs,note",
      "2026-03-01,65.0,2000,150,50,200,test",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      log_date: "2026-03-01",
      weight: 65.0,
      calories: 2000,
      protein: 150,
      fat: 50,
      carbs: 200,
      note: "test",
    });
  });

  it("クォート付き CSV: カンマを含むセルを正しくパースする", () => {
    const csv = [
      'log_date,weight,calories,protein,fat,carbs,note',
      '2026-03-02,64.5,1900,140,45,195,"chicken, rice"',
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].note).toBe("chicken, rice");
  });

  it("列数不一致: 列が少ない行はスキップしエラーに記録する", () => {
    const csv = [
      "log_date,weight,calories,protein,fat,carbs,note",
      "2026-03-03,64.0",  // 列が足りない
      "2026-03-04,63.5,1800,130,40,180,ok",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    // 不足行はスキップ、正常行のみ取り込み
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].log_date).toBe("2026-03-04");
  });

  it("必須列欠損: log_date がない場合はエラーを返す", () => {
    const csv = [
      "weight,calories,protein,fat,carbs,note",
      "65.0,2000,150,50,200,test",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]).toContain("log_date");
  });

  it("不正な日付フォーマットはエラーに記録してスキップする", () => {
    const csv = [
      "log_date,weight",
      "not-a-date,65.0",  // 完全に不正な日付
      "2026-03-05,64.0",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].log_date).toBe("2026-03-05");
  });

  it("YYYY/MM/DD 形式を受け入れる", () => {
    const csv = [
      "log_date,weight",
      "2026/03/06,64.2",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].log_date).toBe("2026-03-06");
  });

  it("列エイリアス: 'date' 列を log_date として扱う", () => {
    const csv = [
      "date,weight",
      "2026-03-07,63.8",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].log_date).toBe("2026-03-07");
  });

  it("空データの場合はエラーメッセージを返す", () => {
    const result = parseCSV("log_date,weight\n");
    expect(result.rows).toHaveLength(0);
  });

  it("ヘッダーのみの CSV はデータ行なしエラー", () => {
    const result = parseCSV("");
    expect(result.errors[0]).toContain("データ行がありません");
  });

  it("オプション列が空の場合は null を返す", () => {
    const csv = [
      "log_date,weight,calories,protein,fat,carbs,note",
      "2026-03-08,,,,,,"
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.rows[0]).toEqual({
      log_date: "2026-03-08",
      weight: null,
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
      note: null,
    });
  });

  it("CRLF 改行コードを正しく処理する", () => {
    const csv = "log_date,weight\r\n2026-03-08,65.0\r\n";
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].log_date).toBe("2026-03-08");
  });
});
