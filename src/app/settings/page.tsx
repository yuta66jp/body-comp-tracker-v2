import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings/SettingsForm";
import type { Setting } from "@/lib/supabase/types";

export const revalidate = 0;

async function fetchSettings(): Promise<Setting[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("settings").select("*");
  if (error) {
    console.error("settings fetch error:", error.message);
    return [];
  }
  return (data as Setting[]) ?? [];
}

export default async function SettingsPage() {
  const settings = await fetchSettings();

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">設定</h1>
      <SettingsForm initialSettings={settings} />
    </main>
  );
}
