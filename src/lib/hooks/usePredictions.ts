"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { Prediction } from "@/lib/supabase/types";

async function fetchPredictions(): Promise<Prediction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("predictions")
    .select("*")
    .order("ds", { ascending: true });

  if (error) throw error;
  return (data as Prediction[]) ?? [];
}

export function usePredictions() {
  return useSWR<Prediction[]>("predictions", fetchPredictions, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
}
