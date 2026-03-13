/**
 * csvParser.ts — CSV パース共通ユーティリティ
 *
 * - RFC 4180 準拠のクォート付きセル（"value with, comma"）に対応
 * - クォートフィールド内の改行（multiline フィールド）に対応
 * - CRLF / LF / CR の改行コードに対応
 * - 必須列（log_date）が欠損している場合はエラーを返す
 *
 * 制限事項:
 * - 列数不足の行（実際のセル数 < ヘッダー数）はスキップし、errors に記録する。
 *   列数が多い場合（実際のセル数 > ヘッダー数）の余剰列は無視する。
 */

export interface ParsedRow {
  log_date: string;
  weight: number | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  note: string | null;
  is_cheat_day: boolean;
  is_refeed_day: boolean;
  is_eating_out: boolean;
  is_poor_sleep: boolean;
  sleep_hours: number | null;
  had_bowel_movement: boolean;
  training_type: string | null;
  work_mode: string | null;
  leg_flag: boolean | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
}

/** 列名の正規化（エクスポート形式 / 旧版 CSV など複数フォーマットに対応） */
const ALIASES: Record<string, keyof ParsedRow> = {
  log_date: "log_date", date: "log_date",
  weight: "weight", "weight(kg)": "weight",
  calories: "calories", "calories(kcal)": "calories", kcal: "calories",
  protein: "protein", "protein(g)": "protein", p: "protein",
  fat: "fat", "fat(g)": "fat", f: "fat",
  carbs: "carbs", "carbs(g)": "carbs", c: "carbs",
  note: "note", memo: "note",
  is_cheat_day: "is_cheat_day",
  is_refeed_day: "is_refeed_day",
  is_eating_out: "is_eating_out",
  is_poor_sleep: "is_poor_sleep",
  sleep_hours: "sleep_hours",
  had_bowel_movement: "had_bowel_movement",
  training_type: "training_type",
  work_mode: "work_mode",
  leg_flag: "leg_flag",
};

export function normalizeKey(raw: string): keyof ParsedRow | null {
  return ALIASES[raw.toLowerCase().trim().replace(/\s+/g, "")] ?? null;
}

export function parseNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseFloat(v.trim());
  return isNaN(n) ? null : n;
}

/** "true" / "1" → true, それ以外（空文字含む）→ false */
function parseBool(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1";
}

/** "true"/"1" → true, "false"/"0" → false, "" → null */
function parseBoolNullable(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (s === "") return null;
  return s === "true" || s === "1";
}

/**
 * RFC 4180 準拠の CSV 行をセルの配列に分割する。
 * クォートで囲まれたフィールド内のカンマや改行を正しく扱う。
 * ※ 単一行を渡す用途向け。multiline 対応は tokenizeCSV を使うこと。
 */
export function splitCSVLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // エスケープされたダブルクォート ("") の処理
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  cells.push(cur);
  return cells;
}

/**
 * CSV テキスト全体を走査してセルの二次元配列を返す。
 * クォートフィールド内の改行（multiline）に対応する。
 */
function tokenizeCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < s.length && s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch; // フィールド内改行もそのまま保持
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
  }
  // 末尾の残りをフラッシュ（末尾改行なしのファイルに対応）
  row.push(cell);
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    rows.push(row);
  }

  return rows;
}

/**
 * CSV テキストを ParsedRow の配列に変換する。
 *
 * @param text - CSV 文字列（UTF-8 想定）
 * @returns rows: 有効な行、errors: スキップされた行の説明
 */
export function parseCSV(text: string): ParseResult {
  // multiline 対応のトークナイザーで全セルを取得
  const allRows = tokenizeCSV(text);
  // 全セルが空文字の行は除外
  const nonEmpty = allRows.filter((r) => r.some((c) => c.trim() !== ""));

  if (nonEmpty.length < 2) return { rows: [], errors: ["データ行がありません"] };

  const headerCells = nonEmpty[0];
  const headers = headerCells.map((h) => h.trim());
  const keyMap = headers.map(normalizeKey);

  if (!keyMap.includes("log_date")) {
    return {
      rows: [],
      errors: ["日付列（log_date または date）が見つかりません"],
    };
  }

  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < nonEmpty.length; i++) {
    const cells = nonEmpty[i];

    // 列数不足の行はスキップして errors に記録する。
    // 余剰列（cells.length > headers.length）は keyMap の範囲外として自然に無視される。
    if (cells.length < headers.length) {
      errors.push(
        `行 ${i + 1}: 列数が不足しています（期待 ${headers.length} 列、実際 ${cells.length} 列）— スキップ`
      );
      continue;
    }

    const raw: Record<string, string> = {};
    keyMap.forEach((key, idx) => {
      if (key) raw[key] = (cells[idx] ?? "").trim();
    });

    const dateStr = raw["log_date"]?.trim() ?? "";
    if (!dateStr) continue; // 空行扱いでスキップ

    // YYYY-MM-DD または YYYY/MM/DD を受け入れる
    const normalized = dateStr.replace(/\//g, "-").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      errors.push(`行 ${i + 1}: 日付フォーマットが不正（${dateStr}）`);
      continue;
    }

    rows.push({
      log_date: normalized,
      weight: parseNum(raw["weight"] ?? ""),
      calories: parseNum(raw["calories"] ?? ""),
      protein: parseNum(raw["protein"] ?? ""),
      fat: parseNum(raw["fat"] ?? ""),
      carbs: parseNum(raw["carbs"] ?? ""),
      note: raw["note"] || null,
      is_cheat_day: parseBool(raw["is_cheat_day"] ?? ""),
      is_refeed_day: parseBool(raw["is_refeed_day"] ?? ""),
      is_eating_out: parseBool(raw["is_eating_out"] ?? ""),
      is_poor_sleep: parseBool(raw["is_poor_sleep"] ?? ""),
      sleep_hours: parseNum(raw["sleep_hours"] ?? ""),
      had_bowel_movement: parseBool(raw["had_bowel_movement"] ?? ""),
      training_type: raw["training_type"] || null,
      work_mode: raw["work_mode"] || null,
      leg_flag: parseBoolNullable(raw["leg_flag"] ?? ""),
    });
  }

  return { rows, errors };
}
