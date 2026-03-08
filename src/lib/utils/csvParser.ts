/**
 * csvParser.ts — CSV パース共通ユーティリティ
 *
 * - RFC 4180 準拠のクォート付きセル（"value with, comma"）に対応
 * - CRLF / LF / CR の改行コードに対応
 * - 列数不一致（多い / 少ない）を許容し、不足列は空文字として扱う
 * - 必須列（log_date）が欠損している場合はエラーを返す
 */

export interface ParsedRow {
  log_date: string;
  weight: number | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  note: string | null;
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
};

export function normalizeKey(raw: string): keyof ParsedRow | null {
  return ALIASES[raw.toLowerCase().trim().replace(/\s+/g, "")] ?? null;
}

export function parseNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseFloat(v.trim());
  return isNaN(n) ? null : n;
}

/**
 * RFC 4180 準拠の CSV 行をセルの配列に分割する。
 * クォートで囲まれたフィールド内のカンマや改行を正しく扱う。
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
 * CSV テキストを ParsedRow の配列に変換する。
 *
 * @param text - CSV 文字列（UTF-8 想定）
 * @returns rows: 有効な行、errors: スキップされた行の説明
 */
export function parseCSV(text: string): ParseResult {
  // 改行コードを LF に統一してから分割
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");

  if (lines.length < 2) return { rows: [], errors: ["データ行がありません"] };

  const headerCells = splitCSVLine(lines[0]);
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

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);

    // 列数不一致の警告（エラーにはしない — 不足分は空文字、余剰は無視）
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
    });
  }

  return { rows, errors };
}
