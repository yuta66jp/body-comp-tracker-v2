"use client";

import useSWR from "swr";
import { fetchClientData } from "@/lib/clientData/fetchJson";
import type { MealEntryWithItems } from "@/lib/supabase/types";

async function fetchMealEntriesByDate(date: string): Promise<MealEntryWithItems[]> {
  return fetchClientData<MealEntryWithItems[]>(
    `/api/client-data?resource=meal_entries&date=${encodeURIComponent(date)}`
  );
}

export function useMealEntriesByDate(date: string, enabled: boolean) {
  return useSWR<MealEntryWithItems[]>(
    enabled ? ["meal_entries_by_date", date] : null,
    () => fetchMealEntriesByDate(date),
    {
      revalidateOnFocus: false,
    }
  );
}
