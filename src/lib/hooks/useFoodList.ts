"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { FoodMaster } from "@/lib/supabase/types";

async function fetchFoodList(): Promise<FoodMaster[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("food_master")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data as FoodMaster[]) ?? [];
}

export function useFoodList() {
  return useSWR<FoodMaster[]>("food_master", fetchFoodList, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
}
