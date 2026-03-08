"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { RecipeItem } from "@/lib/supabase/types";

export interface MenuEntry {
  name: string;
  recipe: RecipeItem[];
}

async function fetchMenuList(): Promise<MenuEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_master")
    .select("name, recipe")
    .order("name", { ascending: true });

  if (error) throw error;
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
