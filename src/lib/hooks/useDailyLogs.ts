/**
 * useDailyLogs — MealLogger 専用クライアントサイド SWR フック
 *
 * ## スコープと制約
 *
 * - このフックは **client component (MealLogger) 専用** であり、Server Components からは使わないこと
 * - `daily_logs` の **全列 full read** を行う（`select("*")`）
 *   - 理由: MealLogger はフォーム hydration に既存ログの全フィールドが必要
 *   - front 側の Server Component ページは `src/lib/queries/dailyLogs.ts` の projection query を使うこと
 * - 保存後は `mutate()` でキャッシュを更新する（revalidatePath ではなく SWR 側で即時反映）
 *
 * ## full read が許容される理由
 * Client Component がブラウザから直接フォームを操作するため、
 * どの列が編集されるか事前に絞れない。Server Component SSR 側の read 最適化とは別物として扱う。
 */
"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { DailyLog } from "@/lib/supabase/types";

async function fetchDailyLogs(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("*")
    .order("log_date", { ascending: false });

  if (error) throw error;
  return (data as DailyLog[]) ?? [];
}

export function useDailyLogs() {
  return useSWR<DailyLog[]>("daily_logs", fetchDailyLogs, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}
