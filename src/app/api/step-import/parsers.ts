/**
 * step-import パーサ
 *
 * CSV / JSON テキストを { date, stepCount }[] に変換する純粋関数群。
 * Route Handler の Next.js 依存を持たないため単体テスト可能。
 */

// ── 型 ───────────────────────────────────────────────────────────────────────

export type StepRecord = { date: string; stepCount: number };

export type ParseResult =
  | { ok: true; records: StepRecord[]; invalidRows: number }
  | { ok: false; message: string };

// ── 内部定数 ─────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * YYYY-MM-DD 形式の文字列がカレンダー上に実在する日付かどうかを検証する。
 *
 * DATE_RE によるフォーマットチェック通過後に呼ぶことを前提とする。
 * new Date("YYYY-MM-DD") は UTC として解釈されるため、
 * `d.toISOString().slice(0, 10)` が元の文字列と一致するかで存在確認できる。
 * 2026-02-31 や 2026-13-01 は Invalid Date になる、または繰り上がった日付になるため不一致として弾かれる。
 */
function isCalendarDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

// ── parseCsv ─────────────────────────────────────────────────────────────────

/**
 * CSV テキストを { date, stepCount }[] にパースする。
 *
 * - ヘッダ行は "date,step_count"（小文字・順不同は不可）
 * - BOM（\uFEFF）を自動除去する（Excel 保存 CSV 対応）
 * - 日付形式不正 / 数値不正の行は invalidRows にカウントしてスキップ
 * - 重複日付は後勝ちで上書き（Apple Health 出力の日付重複は起こらないが念のため）
 */
export function parseCsv(text: string): ParseResult {
  // BOM（\uFEFF）を除去する。Excel で開いて上書き保存した CSV に付くことがある。
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length === 0) return { ok: false, message: "ファイルが空です" };

  const header = lines[0]?.trim();
  if (header !== "date,step_count") {
    return {
      ok: false,
      message: `CSV ヘッダーが不正です。1行目は "date,step_count" である必要があります（実際: "${header?.slice(0, 40)}"）`,
    };
  }

  const records: StepRecord[] = [];
  const seen = new Map<string, number>(); // date → records index
  let invalidRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const commaIdx = line.indexOf(",");
    if (commaIdx < 0) { invalidRows++; continue; }

    const date = line.slice(0, commaIdx).trim();
    const stepStr = line.slice(commaIdx + 1).trim();

    if (!DATE_RE.test(date) || !isCalendarDate(date)) { invalidRows++; continue; }

    const stepCount = Number(stepStr);
    if (!Number.isInteger(stepCount) || stepCount < 0 || isNaN(stepCount)) { invalidRows++; continue; }

    const existing = seen.get(date);
    if (existing !== undefined) {
      records[existing] = { date, stepCount };
    } else {
      seen.set(date, records.length);
      records.push({ date, stepCount });
    }
  }

  return { ok: true, records, invalidRows };
}

// ── parseJson ────────────────────────────────────────────────────────────────

/**
 * JSON テキストを { date, stepCount }[] にパースする。
 *
 * 期待形式: [{"date":"YYYY-MM-DD","step_count":N}, ...]
 * - 浮動小数点数（例: 1234.9）は無効行としてスキップする（Math.trunc で暗黙整数化しない）
 * - 重複日付は後勝ちで上書き
 */
export function parseJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "JSON のパースに失敗しました。有効な JSON ファイルを選択してください" };
  }

  if (!Array.isArray(data)) {
    return {
      ok: false,
      message: '配列形式の JSON を指定してください: [{"date":"YYYY-MM-DD","step_count":N}, ...]',
    };
  }

  const records: StepRecord[] = [];
  const seen = new Map<string, number>();
  let invalidRows = 0;

  for (const item of data) {
    if (typeof item !== "object" || item === null) { invalidRows++; continue; }
    const obj = item as Record<string, unknown>;

    const date = typeof obj["date"] === "string" ? obj["date"].trim() : "";
    if (!DATE_RE.test(date) || !isCalendarDate(date)) { invalidRows++; continue; }

    const stepRaw = obj["step_count"];

    // 浮動小数点数（例: 1234.9）は無効行としてスキップする。
    // Math.trunc で暗黙的に整数化しない。
    if (typeof stepRaw === "number" && !Number.isInteger(stepRaw)) { invalidRows++; continue; }

    const stepCount =
      typeof stepRaw === "number"
        ? stepRaw
        : parseInt(String(stepRaw ?? ""), 10);

    if (!Number.isInteger(stepCount) || stepCount < 0 || isNaN(stepCount)) { invalidRows++; continue; }

    const existing = seen.get(date);
    if (existing !== undefined) {
      records[existing] = { date, stepCount };
    } else {
      seen.set(date, records.length);
      records.push({ date, stepCount });
    }
  }

  return { ok: true, records, invalidRows };
}

// ── parseStepFile ────────────────────────────────────────────────────────────

/**
 * ファイル名の拡張子からフォーマットを判定し、テキストをパースする。
 * 拡張子が .json なら JSON、それ以外（.csv など）は CSV として処理する。
 */
export function parseStepFile(text: string, fileName: string): ParseResult {
  const isJson = fileName.toLowerCase().endsWith(".json");
  return isJson ? parseJson(text) : parseCsv(text);
}
