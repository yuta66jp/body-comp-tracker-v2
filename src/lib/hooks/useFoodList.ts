"use client";

import useSWR from "swr";
import { fetchClientData } from "@/lib/clientData/fetchJson";
import type { FoodMaster } from "@/lib/supabase/types";

async function fetchFoodList(): Promise<FoodMaster[]> {
  return fetchClientData<FoodMaster[]>("/api/client-data?resource=food_master");
}

export function useFoodList() {
  return useSWR<FoodMaster[]>("food_master", fetchFoodList, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
}
