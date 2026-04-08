/**
 * useSleepSessions — MealLogger 専用クライアントサイド SWR フック (#516)
 *
 * sleep_sessions テーブルを直接クライアントから読み取る。
 * useDailyLogs と同じパターンで実装。
 *
 * - 件数上限: 直近 200 件（MealLogger の hydration 用途では十分な範囲）
 * - 保存後は mutate() でキャッシュを更新する
 */
"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { SleepSession } from "@/lib/supabase/types";

async function fetchRecentSleepSessions(): Promise<SleepSession[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sleep_sessions")
    .select("*")
    .order("wake_date", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data as SleepSession[]) ?? [];
}

export function useSleepSessions() {
  return useSWR<SleepSession[]>("sleep_sessions", fetchRecentSleepSessions, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}
