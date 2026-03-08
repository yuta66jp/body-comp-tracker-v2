import { createClient } from "@/lib/supabase/server";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { RecentLogsTable } from "@/components/dashboard/RecentLogsTable";
import { MealLogger } from "@/components/meal/MealLogger";
import type { DailyLog, Prediction } from "@/lib/supabase/types";

export const revalidate = 3600; // 1時間キャッシュ

async function fetchLogs(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("*")
    .order("log_date", { ascending: true });
  if (error) {
    console.error("daily_logs fetch error:", error.message);
    return [];
  }
  return (data as DailyLog[]) ?? [];
}

async function fetchPredictions(): Promise<Prediction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("predictions")
    .select("*")
    .order("ds", { ascending: true });
  if (error) {
    console.error("predictions fetch error:", error.message);
    return [];
  }
  return (data as Prediction[]) ?? [];
}

export default async function DashboardPage() {
  const [logs, predictions] = await Promise.all([fetchLogs(), fetchPredictions()]);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">Body Composition Tracker</h1>
      <div className="space-y-6">
        <MealLogger />
        {logs.length > 0 && (
          <>
            <KpiCards logs={logs} />
            {predictions.length > 0 && (
              <ForecastChart logs={logs} predictions={predictions} />
            )}
            <RecentLogsTable logs={logs} />
          </>
        )}
        {logs.length === 0 && (
          <p className="text-center text-sm text-gray-400">
            上のフォームから最初のログを入力してください。
          </p>
        )}
      </div>
    </main>
  );
}
