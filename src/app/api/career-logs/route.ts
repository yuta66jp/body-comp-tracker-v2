/**
 * /api/career-logs — career_logs の書き込み API
 *
 * RLS の制約:
 *   - anon ロール: SELECT のみ許可
 *   - service_role: 全操作許可
 *
 * クライアントから直接 upsert/delete すると anon ロールで失敗するため、
 * このルートハンドラで service_role キーを使ってサーバー側で実行する。
 *
 * POST  /api/career-logs  → upsert (season + log_date が一意制約)
 * DELETE /api/career-logs → delete (id 指定)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** service_role キーを使用するサーバー専用クライアント */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase credentials are not configured");
  }
  return createClient<Database>(url, key);
}

/** POST: career_logs に upsert */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const { season, target_date, log_date, weight, note } = body as Record<string, unknown>;

  // 必須フィールドの検証
  if (
    typeof season !== "string" || season.trim() === "" ||
    typeof target_date !== "string" || target_date.trim() === "" ||
    typeof log_date !== "string" || log_date.trim() === "" ||
    typeof weight !== "number" || !isFinite(weight)
  ) {
    return NextResponse.json(
      { error: "season, target_date, log_date (string) および weight (number) は必須です" },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server configuration error" },
      { status: 500 }
    );
  }

  const { error } = await supabase.from("career_logs").upsert(
    {
      season: season.trim(),
      target_date: target_date.trim(),
      log_date: log_date.trim(),
      weight,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
    },
    { onConflict: "log_date,season" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

/** DELETE: career_logs から id で削除 */
export async function DELETE(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id } = (body as Record<string, unknown>) ?? {};
  if (typeof id !== "number" || !Number.isInteger(id)) {
    return NextResponse.json({ error: "id (integer) は必須です" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server configuration error" },
      { status: 500 }
    );
  }

  const { error } = await supabase.from("career_logs").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
