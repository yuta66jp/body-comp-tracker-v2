/**
 * sleepSessions.ts — sleep_sessions テーブルの read クエリ (#515)
 *
 * sleep_sessions が睡眠の source of truth。
 * UI コンポーネントはこのクエリ経由で睡眠データを取得する。
 *
 * ## 設計方針
 * - query 関数は pure な async 関数として定義する
 * - エラー時は null / 空配列を返すベストエフォート方式
 *   (補助クエリのため、エラー時にページ全体をブロックしない)
 */

import { createClient } from "@/lib/supabase/server";
import type { SleepSession } from "@/lib/supabase/types";

/**
 * 指定した wake_date の睡眠セッションを 1件取得する。
 *
 * MealLogger の hydrate (既存値の表示) で使用する。
 *
 * @param wakeDate 起床日 "YYYY-MM-DD"
 * @returns SleepSession | null (該当なし or エラー時は null)
 */
export async function fetchSleepSession(
  wakeDate: string
): Promise<SleepSession | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sleep_sessions")
    .select("*")
    .eq("wake_date", wakeDate)
    .maybeSingle();

  if (error) {
    console.error("[fetchSleepSession] error:", error.message, "| wake_date:", wakeDate);
    return null;
  }

  return (data as SleepSession | null) ?? null;
}

/**
 * 指定した日付範囲の睡眠セッションを取得する。
 *
 * ダッシュボード表示・ML バッチ投影などで使用する。
 *
 * @param from 開始日 "YYYY-MM-DD" (inclusive)
 * @param to   終了日 "YYYY-MM-DD" (inclusive)
 * @returns SleepSession[] (エラー時は空配列)
 */
export async function fetchSleepSessionsForRange(
  from: string,
  to: string
): Promise<SleepSession[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sleep_sessions")
    .select("*")
    .gte("wake_date", from)
    .lte("wake_date", to)
    .order("wake_date", { ascending: false });

  if (error) {
    console.error("[fetchSleepSessionsForRange] error:", error.message, "| range:", from, "-", to);
    return [];
  }

  return (data as SleepSession[]) ?? [];
}
