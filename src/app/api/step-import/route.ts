/**
 * /api/step-import — 日次歩数 CSV/JSON を daily_logs にインポートするエンドポイント
 *
 * ## エンドポイント
 *
 * ### POST /api/step-import?action=preflight
 *   リクエスト: multipart/form-data, field: "file" (CSV または JSON)
 *   レスポンス: StepPreflightResult
 *   - ファイルを解析して日次歩数を集計し、既存 daily_logs との突合結果を返す
 *   - DB への書き込みは行わない
 *
 * ### POST /api/step-import?action=import
 *   リクエスト: multipart/form-data, field: "file" (CSV または JSON)
 *   レスポンス: StepImportResult
 *   - ファイルを解析して日次歩数を集計し、既存行のみ step_count を更新する
 *   - 既存 daily_logs に行がない日付はスキップ（新規行は作らない）
 *
 * ## 入力ファイル形式
 *
 * CSV (date,step_count):
 *   date,step_count
 *   2024-01-15,8432
 *
 * JSON ([{date, step_count}]):
 *   [{"date":"2024-01-15","step_count":8432}]
 *
 * ## セキュリティ前提
 * 個人利用専用（認証チェックなし）。CSV エクスポートと同じ前提。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";
import { parseStepFile } from "./parsers";
import type { ParseResult } from "./parsers";

// ── 型定義 ──────────────────────────────────────────────────────────────────

export type StepPreflightResult = {
  /** ファイルから集計された日付総数（バリデーション通過分） */
  totalDays: number;
  /** existing daily_logs と一致した日数 */
  matchedDays: number;
  /** matchedDays のうち既に step_count が入っている日数（上書き対象） */
  overwriteDays: number;
  /** matchedDays のうち step_count が未入力の日数（新規書き込み対象） */
  newDays: number;
  /** daily_logs に対応行がない日数（スキップ対象） */
  skippedDays: number;
  /** 日付形式・数値形式の不正などでスキップした行数 */
  invalidRows: number;
};

export type StepImportResult =
  | { ok: true; savedCount: number; skippedCount: number }
  | { ok: false; message: string };

// ── ヘルパー ──────────────────────────────────────────────────────────────

async function extractFileText(req: NextRequest): Promise<{ text: string; name: string } | null> {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return null;
    const f = file as File;
    const text = await f.text();
    return { text, name: f.name };
  } catch {
    return null;
  }
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  if (action !== "preflight" && action !== "import") {
    return NextResponse.json(
      { error: "action パラメータが不正です（preflight または import を指定してください）" },
      { status: 400 },
    );
  }

  // ファイルを読み込む
  const fileResult = await extractFileText(req);
  if (!fileResult) {
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 400 });
  }

  // CSV / JSON をパース
  const parsed = parseStepFile(fileResult.text, fileResult.name);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400 });
  }

  if (parsed.records.length === 0) {
    return NextResponse.json(
      { error: "有効な歩数データが見つかりませんでした（バリデーション不通過行が多い可能性があります）" },
      { status: 400 },
    );
  }

  // 解析結果の日付一覧を取得（昇順ソート��み）
  const dates = parsed.records.map((r) => r.date).sort();
  const datesSet = new Set(dates);
  const minDate = dates[0]!;
  const maxDate = dates[dates.length - 1]!;

  // DB から対象日付範囲の daily_logs を取得
  //
  // `.in("log_date", dates)` は PostgREST により URL クエリパラメータに展開されるため、
  // 日付件数が多い（数百〜数千件）と URL 長制限を超���て 400 Bad Request になる。
  // 代わりに minDate〜maxDate の範囲取得を使い、アプリ側で datesSet との突合を行う。
  // 範囲内に import 対象外の日付が含まれる場合があるが、datesSet フィルタで除外する。
  const supabase = createClient();
  const { data: existingLogs, error: fetchError } = await supabase
    .from("daily_logs")
    .select("log_date, step_count")
    .gte("log_date", minDate)
    .lte("log_date", maxDate);

  if (fetchError) {
    return NextResponse.json({ error: "DB 取得エラー: " + fetchError.message }, { status: 500 });
  }

  // 範囲取得結果のうち import 対象日だけを Map に収録する
  const existingMap = new Map<string, number | null>(
    (existingLogs ?? [])
      .filter((row) => datesSet.has(row.log_date))
      .map((row) => [row.log_date, row.step_count as number | null]),
  );

  // ── preflight ──────────────────────────────────────────────────────────────
  if (action === "preflight") {
    let matchedDays  = 0;
    let overwriteDays = 0;
    let newDays       = 0;
    let skippedDays   = 0;

    for (const { date } of parsed.records) {
      if (!existingMap.has(date)) {
        skippedDays++;
      } else {
        matchedDays++;
        const existing = existingMap.get(date);
        if (existing !== null && existing !== undefined) {
          overwriteDays++;
        } else {
          newDays++;
        }
      }
    }

    const result: StepPreflightResult = {
      totalDays:    parsed.records.length,
      matchedDays,
      overwriteDays,
      newDays,
      skippedDays,
      invalidRows:  parsed.invalidRows,
    };
    return NextResponse.json(result);
  }

  // ── import ─────────────────────────────────────────────────────────────────
  let savedCount   = 0;
  let skippedCount = 0;

  // 既存 daily_logs がある日付だけ step_count を更新する
  // 新規行は作らない（仕様: weight ログがない日はインポートしない）
  for (const { date, stepCount } of parsed.records) {
    if (!existingMap.has(date)) {
      skippedCount++;
      continue;
    }

    const { error: updateError } = await supabase.rpc("save_daily_log_partial", {
      p_log_date: date,
      p_fields:   { step_count: stepCount },
    });

    if (updateError) {
      console.error("[step-import] rpc error:", date, updateError.message);
      skippedCount++;
    } else {
      savedCount++;
    }
  }

  if (savedCount > 0) {
    revalidateAfterDailyLogMutation();
  }

  const result: StepImportResult = { ok: true, savedCount, skippedCount };
  return NextResponse.json(result);
}
