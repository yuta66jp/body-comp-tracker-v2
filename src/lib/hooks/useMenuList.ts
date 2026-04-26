"use client";

import useSWR from "swr";
import { fetchClientData } from "@/lib/clientData/fetchJson";
import type { RecipeItem } from "@/lib/supabase/types";

export interface MenuEntry {
  name: string;
  recipe: RecipeItem[];
}

async function fetchMenuList(): Promise<MenuEntry[]> {
  const data = await fetchClientData<Array<{ name: string; recipe: unknown }>>(
    "/api/client-data?resource=menu_master",
  );
  return ((data as Array<{ name: string; recipe: unknown }>) ?? []).map((row) => ({
    name: row.name,
    recipe: Array.isArray(row.recipe) ? (row.recipe as RecipeItem[]) : [],
  }));
}

export function useMenuList() {
  return useSWR<MenuEntry[]>("menu_master", fetchMenuList, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
}
