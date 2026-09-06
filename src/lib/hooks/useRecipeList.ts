"use client";

import useSWR from "swr";
import { fetchClientData } from "@/lib/clientData/fetchJson";
import type { Recipe } from "@/lib/recipes";

export function useRecipeList(initialRecipes?: Recipe[]) {
  return useSWR<Recipe[]>("recipe_master", () => fetchClientData<Recipe[]>("/api/client-data?resource=recipe_master"), {
    fallbackData: initialRecipes,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });
}
