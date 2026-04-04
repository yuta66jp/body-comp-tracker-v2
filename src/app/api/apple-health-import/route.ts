/**
 * /api/apple-health-import — Apple Health ZIP から歩数をインポートするエンドポイント
 *
 * ## エンドポイント
 *
 * ### POST /api/apple-health-import?action=preflight
 *   リクエスト: multipart/form-data, field: "file" (ZIP)
 *   レスポンス: AppleHealthPreflightResult
 *   - ZIP を解析して日次歩数を集計し、既存 daily_logs との突合結果を返す
 *   - DB への書き込みは行わない
 *
 * ### POST /api/apple-health-import?action=import
 *   リクエスト: multipart/form-data, field: "file" (ZIP)
 *   レスポンス: AppleHealthImportResult
 *   - ZIP を解析して日次歩数を集計し、既存行のみ step_count を更新する
 *   - 既存 daily_logs に行がない日付はスキップ（新規行は作らない）
 *
 * ## セキュリティ前提
 * 個人利用専用（認証チェックなし）。CSV エクスポートと同じ前提。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseAppleHealthZip } from "@/lib/utils/appleHealthParser";
import { revalidateAfterDailyLogMutation } from "@/lib/cache/revalidate";

// ── 型定義 ──────────────────────────────────────────────────────────────────

export type AppleHealthPreflightResult = {
  /** ZIP から集計された日付総数 */
  totalDays: number;
  /** existing daily_logs と一致した日数（weight ログあり） */
  matchedDays: number;
  /** matchedDays のうち既に step_count が入っている日数（上書き対象） */
  overwriteDays: number;
  /** matchedDays のうち step_count が未入力の日数（新規書き込み対象） */
  newDays: number;
  /** daily_logs に対応行がない日数（スキップ対象） */
  skippedDays: number;
};

export type AppleHealthImportResult =
  | { ok: true; savedCount: number; skippedCount: number }
  | { ok: false; message: string };

// ── ヘルパー ──────────────────────────────────────────────────────────────

/**
 * multipart/form-data から "file" フィールドを取り出す。
 * 失敗時は null を返す。
 */
async function extractZipBuffer(req: NextRequest): Promise<ArrayBuffer | null> {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return null;
    return await (file as File).arrayBuffer();
  } catch {
    return null;
  }
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  if (action !== "preflight" && action !== "import") {
    return NextResponse.json({ error: "action パラメータが不正です（preflight または import を指定してください）" }, { status: 400 });
  }

  // ZIP を読み込む
  const zipBuffer = await extractZipBuffer(req);
  if (!zipBuffer) {
    return NextResponse.json({ error: "ZIP ファイルが見つかりません" }, { status: 400 });
  }

  // ZIP を解析して日次歩数 Map を取得
  let dailyStepMap;
  try {
    dailyStepMap = await parseAppleHealthZip(zipBuffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ZIP 解析に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (dailyStepMap.size === 0) {
    return NextResponse.json({ error: "歩数データが見つかりませんでした" }, { status: 400 });
  }

  // 解析結果の日付一覧を取得
  const dates = Array.from(dailyStepMap.keys()).sort();

  // DB から対象日付範囲の daily_logs を取得
  const supabase = createClient();
  const { data: existingLogs, error: fetchError } = await supabase
    .from("daily_logs")
    .select("log_date, step_count")
    .in("log_date", dates);

  if (fetchError) {
    return NextResponse.json({ error: "DB 取得エラー: " + fetchError.message }, { status: 500 });
  }

  const existingMap = new Map<string, number | null>(
    (existingLogs ?? []).map((row) => [row.log_date, row.step_count as number | null])
  );

  // ── preflight ──────────────────────────────────────────────────────────────
  if (action === "preflight") {
    let matchedDays  = 0;
    let overwriteDays = 0;
    let newDays       = 0;
    let skippedDays   = 0;

    for (const date of dates) {
      if (!existingMap.has(date)) {
        skippedDays++;
      } else {
        matchedDays++;
        if (existingMap.get(date) !== null && existingMap.get(date) !== undefined) {
          overwriteDays++;
        } else {
          newDays++;
        }
      }
    }

    const result: AppleHealthPreflightResult = {
      totalDays: dates.length,
      matchedDays,
      overwriteDays,
      newDays,
      skippedDays,
    };
    return NextResponse.json(result);
  }

  // ── import ─────────────────────────────────────────────────────────────────
  let savedCount   = 0;
  let skippedCount = 0;

  // 既存 daily_logs がある日付だけ step_count を更新する
  // 新規行は作らない（仕様: weight ログがない日はインポートしない）
  for (const [date, steps] of dailyStepMap) {
    if (!existingMap.has(date)) {
      skippedCount++;
      continue;
    }

    const { error: updateError } = await supabase.rpc("save_daily_log_partial", {
      p_log_date: date,
      p_fields:   { step_count: steps },
    });

    if (updateError) {
      // 1 件の失敗で全体を止めず、スキップしてカウント
      console.error("[apple-health-import] rpc error:", date, updateError.message);
      skippedCount++;
    } else {
      savedCount++;
    }
  }

  if (savedCount > 0) {
    revalidateAfterDailyLogMutation();
  }

  const result: AppleHealthImportResult = { ok: true, savedCount, skippedCount };
  return NextResponse.json(result);
}
