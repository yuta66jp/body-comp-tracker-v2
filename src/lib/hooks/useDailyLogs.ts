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
