import { parseCSV, splitCSVLine } from "./csvParser";

// ---- 新列のデフォルト値 (旧 CSV に存在しない場合) ----
const NEW_FIELD_DEFAULTS = {
  is_cheat_day: false,
  is_refeed_day: false,
  is_eating_out: false,
  is_travel_day: false,
  is_poor_sleep: false,
  sleep_hours: null,
  had_bowel_movement: null,
  training_type: null,
  work_mode: null,
  leg_flag: null,
};

// ---- round-trip 用: route.ts の toCSV と同等のシリアライザ ----
function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const body = rows.map((row) =>
    columns
      .map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(",")
  );
  return [header, ...body].join("\n");
}

const DAILY_LOG_COLUMNS = [
  "log_date", "weight", "calories", "protein", "fat", "carbs", "note",
  "is_cheat_day", "is_refeed_day", "is_eating_out", "is_travel_day", "is_poor_sleep",
  "sleep_hours", "had_bowel_movement", "training_type", "work_mode", "leg_flag",
];

// =========================================================
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

// =========================================================
describe("parseCSV", () => {
  it("正常系: 全列揃ったケース", () => {
    const csv = [
      "log_date,weight,calories,protein,fat,carbs,note",
      "2026-03-01,65.0,2000,150,50,200,test",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
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

  it("note にダブルクォートを含む CSV を正しくパースする", () => {
    const csv = [
      "log_date,weight,calories,protein,fat,carbs,note",
      '2026-03-03,65.0,2000,150,50,200,"say ""hello"" today"',
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].note).toBe('say "hello" today');
  });

  it("note にセル内改行を含む CSV を正しくパースする (multiline)", () => {
    // "line1\nline2" がクォートされている場合、2行に分かれず1レコードとして解釈される
    const csv =
      "log_date,weight,calories,protein,fat,carbs,note\n" +
      '2026-03-04,65.0,2000,150,50,200,"line1\nline2"\n' +
      "2026-03-05,64.5,1900,140,45,195,normal\n";

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].note).toBe("line1\nline2");
    expect(result.rows[1].log_date).toBe("2026-03-05");
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

  it("存在しない日付（2026-02-30）はエラーに記録してスキップする", () => {
    const csv = [
      "log_date,weight",
      "2026-02-30,65.0",  // 実在しない日付（regex は通るが parseLocalDateStr で弾く）
      "2026-03-01,64.0",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]).toContain("2026-02-30");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].log_date).toBe("2026-03-01");
  });

  it("不正な training_type はエラーに記録して行をスキップする", () => {
    const csv = [
      "log_date,weight,training_type",
      "2026-03-01,65.0,invalid_type",
      "2026-03-02,64.5,chest",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("invalid_type");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].log_date).toBe("2026-03-02");
  });

  it("有効な training_type はそのまま保持する", () => {
    const csv = [
      "log_date,weight,training_type",
      "2026-03-01,65.0,quads",
      "2026-03-02,64.5,off",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].training_type).toBe("quads");
    expect(result.rows[1].training_type).toBe("off");
  });

  it("不正な work_mode はエラーに記録して行をスキップする", () => {
    const csv = [
      "log_date,weight,work_mode",
      "2026-03-01,65.0,invalid_mode",
      "2026-03-02,64.5,office",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("invalid_mode");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].log_date).toBe("2026-03-02");
  });

  it("有効な work_mode はそのまま保持する", () => {
    const csv = [
      "log_date,weight,work_mode",
      "2026-03-01,65.0,office",
      "2026-03-02,64.5,remote",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].work_mode).toBe("office");
    expect(result.rows[1].work_mode).toBe("remote");
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

  it("オプション列が空の場合は null / false を返す", () => {
    const csv = [
      "log_date,weight,calories,protein,fat,carbs,note",
      "2026-03-08,,,,,,",
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
      ...NEW_FIELD_DEFAULTS,
    });
  });

  it("CRLF 改行コードを正しく処理する", () => {
    const csv = "log_date,weight\r\n2026-03-08,65.0\r\n";
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].log_date).toBe("2026-03-08");
  });

  // ---- 新カラム ----
  it("新カラム: boolean フィールドを正しくパースする", () => {
    const csv = [
      "log_date,is_cheat_day,is_refeed_day,is_eating_out,is_poor_sleep,had_bowel_movement",
      "2026-03-10,true,false,1,0,true",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      is_cheat_day: true,
      is_refeed_day: false,
      is_eating_out: true,
      is_poor_sleep: false,
      had_bowel_movement: true,
    });
  });

  it("新カラム: had_bowel_movement は空文字で null になる（未記録）", () => {
    const csv = [
      "log_date,had_bowel_movement",
      "2026-03-15,",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.rows[0].had_bowel_movement).toBeNull();
  });

  it("新カラム: had_bowel_movement は true/false を正しくパースする", () => {
    const csv = [
      "log_date,had_bowel_movement",
      "2026-03-15,true",
      "2026-03-16,false",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.rows[0].had_bowel_movement).toBe(true);
    expect(result.rows[1].had_bowel_movement).toBe(false);
  });

  it("新カラム: leg_flag は空文字で null になる", () => {
    const csv = [
      "log_date,leg_flag",
      "2026-03-11,",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.rows[0].leg_flag).toBeNull();
  });

  it("新カラム: leg_flag は true/false を正しくパースする", () => {
    const csv = [
      "log_date,leg_flag",
      "2026-03-12,true",
      "2026-03-13,false",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.rows[0].leg_flag).toBe(true);
    expect(result.rows[1].leg_flag).toBe(false);
  });

  it("新カラム: training_type / work_mode / sleep_hours を正しくパースする", () => {
    const csv = [
      "log_date,training_type,work_mode,sleep_hours",
      "2026-03-14,chest,office,7.5",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.rows[0]).toMatchObject({
      training_type: "chest",
      work_mode: "office",
      sleep_hours: 7.5,
    });
  });

  it("新カラム: 空文字の training_type / work_mode は null になる", () => {
    const csv = [
      "log_date,training_type,work_mode",
      "2026-03-15,,",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.rows[0].training_type).toBeNull();
    expect(result.rows[0].work_mode).toBeNull();
  });

  it("旧 CSV（新カラムなし）をインポートしても新フィールドはデフォルト値になる", () => {
    const csv = [
      "log_date,weight,calories,protein,fat,carbs,note",
      "2026-03-16,65.0,2000,150,50,200,legacy",
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      log_date: "2026-03-16",
      note: "legacy",
      ...NEW_FIELD_DEFAULTS,
    });
  });
});

// =========================================================
describe("round-trip: export → import", () => {
  it("note にカンマを含むレコードが往復できる", () => {
    const original = [{
      log_date: "2026-03-20", weight: 65.0, calories: 2000,
      protein: 150, fat: 50, carbs: 200,
      note: "chicken, rice",
      is_cheat_day: false, is_refeed_day: false, is_eating_out: false, is_travel_day: false, is_poor_sleep: false,
      sleep_hours: null, had_bowel_movement: false,
      training_type: null, work_mode: null, leg_flag: null,
    }];

    const csv = toCSV(original as Record<string, unknown>[], DAILY_LOG_COLUMNS);
    const result = parseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].note).toBe("chicken, rice");
    expect(result.rows[0].log_date).toBe("2026-03-20");
  });

  it("note にダブルクォートを含むレコードが往復できる", () => {
    const original = [{
      log_date: "2026-03-21", weight: 64.5, calories: 1800,
      protein: 130, fat: 45, carbs: 180,
      note: 'say "hello" today',
      is_cheat_day: false, is_refeed_day: false, is_eating_out: false, is_travel_day: false, is_poor_sleep: false,
      sleep_hours: null, had_bowel_movement: false,
      training_type: null, work_mode: null, leg_flag: null,
    }];

    const csv = toCSV(original as Record<string, unknown>[], DAILY_LOG_COLUMNS);
    const result = parseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].note).toBe('say "hello" today');
  });

  it("note に改行を含むレコードが往復できる", () => {
    const original = [{
      log_date: "2026-03-22", weight: 64.0, calories: 1900,
      protein: 140, fat: 40, carbs: 190,
      note: "朝: オートミール\n昼: チキン\n夜: サラダ",
      is_cheat_day: false, is_refeed_day: false, is_eating_out: false, is_travel_day: false, is_poor_sleep: false,
      sleep_hours: 7, had_bowel_movement: true,
      training_type: "chest", work_mode: "office", leg_flag: false,
    }];

    const csv = toCSV(original as Record<string, unknown>[], DAILY_LOG_COLUMNS);
    const result = parseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].note).toBe("朝: オートミール\n昼: チキン\n夜: サラダ");
    expect(result.rows[0].log_date).toBe("2026-03-22");
  });

  it("複数レコードの note に改行が含まれていても行数が保たれる", () => {
    const original = [
      {
        log_date: "2026-03-23", weight: 63.5, calories: 1750,
        protein: 120, fat: 38, carbs: 170,
        note: "line1\nline2",
        is_cheat_day: false, is_refeed_day: false, is_eating_out: false, is_travel_day: false, is_poor_sleep: false,
        sleep_hours: null, had_bowel_movement: false,
        training_type: null, work_mode: null, leg_flag: null,
      },
      {
        log_date: "2026-03-24", weight: 63.0, calories: 1800,
        protein: 130, fat: 40, carbs: 175,
        note: null,
        is_cheat_day: true, is_refeed_day: false, is_eating_out: false, is_travel_day: false, is_poor_sleep: false,
        sleep_hours: 6.5, had_bowel_movement: true,
        training_type: "back", work_mode: "remote", leg_flag: false,
      },
    ];

    const csv = toCSV(original as Record<string, unknown>[], DAILY_LOG_COLUMNS);
    const result = parseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].note).toBe("line1\nline2");
    expect(result.rows[1].log_date).toBe("2026-03-24");
    expect(result.rows[1].is_cheat_day).toBe(true);
    expect(result.rows[1].sleep_hours).toBe(6.5);
    expect(result.rows[1].training_type).toBe("back");
  });

  it("全新カラムを含むレコードが往復できる", () => {
    const original = [{
      log_date: "2026-03-25", weight: 62.8, calories: 2100,
      protein: 160, fat: 55, carbs: 210,
      note: "test note",
      is_cheat_day: true, is_refeed_day: true, is_eating_out: true, is_travel_day: true, is_poor_sleep: true,
      sleep_hours: 5.5, had_bowel_movement: true,
      training_type: "quads", work_mode: "remote", leg_flag: true,
    }];

    const csv = toCSV(original as Record<string, unknown>[], DAILY_LOG_COLUMNS);
    const result = parseCSV(csv);

    expect(result.errors).toHaveLength(0);
    const row = result.rows[0];
    expect(row.is_cheat_day).toBe(true);
    expect(row.is_refeed_day).toBe(true);
    expect(row.is_eating_out).toBe(true);
    expect(row.is_travel_day).toBe(true);
    expect(row.is_poor_sleep).toBe(true);
    expect(row.sleep_hours).toBe(5.5);
    expect(row.had_bowel_movement).toBe(true);
    expect(row.training_type).toBe("quads");
    expect(row.work_mode).toBe("remote");
    expect(row.leg_flag).toBe(true);
  });
});
