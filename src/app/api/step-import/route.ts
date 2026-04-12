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
import type { StepRecord } from "./parsers";

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

// ── 分類ロジック（preflight / import で共有） ───────────────────────────────

/**
 * パース済み歩数レコードを既存ログとの照合結果に基づいて分類する。
 *
 * preflight と import が同じロジックで分類することで、
 * 事前確認の件数と実保存の件数が一致することを保証する。
 */
export type ClassifiedRecords = {
  /** daily_logs に行が存在し、step_count を更新すべきレコード（新規 + 上書き） */
  toUpdate: StepRecord[];
  /** daily_logs に行が存在し、既に step_count が入っていないレコード（新規書き込み対象） */
  newRecords: StepRecord[];
  /** daily_logs に行が存在し、既に step_count が入っているレコード（上書き対象） */
  overwriteRecords: StepRecord[];
  /** daily_logs に対応行がないレコード（スキップ対象） */
  skippedRecords: StepRecord[];
};

export function classifyRecords(
  records: StepRecord[],
  existingMap: Map<string, number | null>,
): ClassifiedRecords {
  const toUpdate: StepRecord[] = [];
  const newRecords: StepRecord[] = [];
  const overwriteRecords: StepRecord[] = [];
  const skippedRecords: StepRecord[] = [];

  for (const record of records) {
    if (!existingMap.has(record.date)) {
      skippedRecords.push(record);
    } else {
      toUpdate.push(record);
      const existing = existingMap.get(record.date);
      if (existing === null || existing === undefined) {
        newRecords.push(record);
      } else {
        overwriteRecords.push(record);
      }
    }
  }

  return { toUpdate, newRecords, overwriteRecords, skippedRecords };
}

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

  // 解析結果の日付一覧を取得（昇順ソート済み）
  const dates = parsed.records.map((r) => r.date).sort();
  const datesSet = new Set(dates);
  const minDate = dates[0]!;
  const maxDate = dates[dates.length - 1]!;

  // DB から対象日付範囲の daily_logs を取得
  //
  // `.in("log_date", dates)` は PostgREST により URL クエリパラメータに展開されるため、
  // 日付件数が多い（数百〜数千件）と URL 長制限を超えて 400 Bad Request になる。
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

  // preflight と import で同じ classifyRecords を使うことで件数の一致を保証する
  const classified = classifyRecords(parsed.records, existingMap);

  // ── preflight ──────────────────────────────────────────────────────────────
  if (action === "preflight") {
    const result: StepPreflightResult = {
      totalDays:    parsed.records.length,
      matchedDays:  classified.toUpdate.length,
      overwriteDays: classified.overwriteRecords.length,
      newDays:      classified.newRecords.length,
      skippedDays:  classified.skippedRecords.length,
      invalidRows:  parsed.invalidRows,
    };
    return NextResponse.json(result);
  }

  // ── import ─────────────────────────────────────────────────────────────────
  let savedCount   = 0;
  let skippedCount = classified.skippedRecords.length;

  // step_count を日付ごとに UPDATE する
  //
  // upsert（INSERT...ON CONFLICT）を使わない理由:
  //   upsert は INSERT を試みるため、NOT NULL DEFAULT カラム（is_cheat_day 等）が
  //   NULL と評価される場合に制約違反で全チャンクが失敗する。
  //   UPDATE は既存行のみを対象にするため INSERT 側の制約に触れない。
  //
  // 並行実行（BATCH_CONCURRENCY 件ずつ Promise.allSettled）でタイムアウトを回避する。
  // classified.toUpdate は existingMap.has() でフィルタ済みのため全行が既存行。
  const BATCH_CONCURRENCY = 20;
  const { toUpdate } = classified;

  for (let i = 0; i < toUpdate.length; i += BATCH_CONCURRENCY) {
    const batch = toUpdate.slice(i, i + BATCH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(({ date, stepCount }) =>
        supabase
          .from("daily_logs")
          .update({ step_count: stepCount })
          .eq("log_date", date)
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && !result.value.error) {
        savedCount++;
      } else {
        const msg =
          result.status === "rejected"
            ? String(result.reason)
            : (result.value.error?.message ?? "unknown error");
        console.error("[step-import] update error:", msg);
        skippedCount++;
      }
    }
  }

  if (savedCount > 0) {
    revalidateAfterDailyLogMutation();
  }

  const result: StepImportResult = { ok: true, savedCount, skippedCount };
  return NextResponse.json(result);
}
