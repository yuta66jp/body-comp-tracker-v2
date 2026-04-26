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
import { fetchClientData } from "@/lib/clientData/fetchJson";
import type { SleepSession } from "@/lib/supabase/types";

async function fetchRecentSleepSessions(): Promise<SleepSession[]> {
  return fetchClientData<SleepSession[]>("/api/client-data?resource=sleep_sessions");
}

export function useSleepSessions() {
  return useSWR<SleepSession[]>("sleep_sessions", fetchRecentSleepSessions, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}
