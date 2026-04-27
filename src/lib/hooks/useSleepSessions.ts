/**
 * useSleepSessions — MealLogger 専用クライアントサイド SWR フック (#516)
 *
 * sleep_sessions テーブルを直接クライアントから読み取る。
 * useDailyLogs と同じパターンで実装。
 *
 * - 件数上限: 直近 200 件（MealLogger の hydration 用途では十分な範囲）
 * - 直近 200 件外の日付を手入力した場合は、useSleepSessionByDate() で対象日付のみ補完取得する
 * - 保存後は mutate() でキャッシュを更新する
 */
"use client";

import useSWR from "swr";
import { fetchClientData } from "@/lib/clientData/fetchJson";
import type { SleepSession } from "@/lib/supabase/types";

async function fetchRecentSleepSessions(): Promise<SleepSession[]> {
  return fetchClientData<SleepSession[]>("/api/client-data?resource=sleep_sessions");
}

async function fetchSleepSessionByDate(date: string): Promise<SleepSession | null> {
  return fetchClientData<SleepSession | null>(
    `/api/client-data?resource=sleep_sessions&date=${encodeURIComponent(date)}`
  );
}

export function useSleepSessions() {
  return useSWR<SleepSession[]>("sleep_sessions", fetchRecentSleepSessions, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}

export function useSleepSessionByDate(date: string, enabled: boolean) {
  return useSWR<SleepSession | null>(
    enabled ? ["sleep_session_by_date", date] : null,
    () => fetchSleepSessionByDate(date),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    }
  );
}
