"use client";

import useSWR from "swr";
import { fetchClientData } from "@/lib/clientData/fetchJson";
import type { Prediction } from "@/lib/supabase/types";

async function fetchPredictions(): Promise<Prediction[]> {
  return fetchClientData<Prediction[]>("/api/client-data?resource=predictions");
}

export function usePredictions() {
  return useSWR<Prediction[]>("predictions", fetchPredictions, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
}
