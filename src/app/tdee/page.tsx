import { createClient } from "@/lib/supabase/server";
import { TdeeKpiCard } from "@/components/tdee/TdeeKpiCard";
import { TdeeDetailChart } from "@/components/tdee/TdeeDetailChart";
import { TdeeDailyTable } from "@/components/tdee/TdeeDailyTable";
import { calcTheoreticalTdee } from "@/lib/utils/calcTdee";
import type { DailyLog, AnalyticsCache, Setting } from "@/lib/supabase/types";

export const revalidate = 3600;

async function fetchEnrichedLogs() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("analytics_cache")
    .select("payload, updated_at")
    .eq("metric_type", "enriched_logs")
    .single();
  if (error || !data) return null;
  const row = data as Pick<AnalyticsCache, "payload" | "updated_at">;
  return row.payload as Array<{ log_date: string; weight_sma7: number | null; tdee_estimated: number | null }>;
}

async function fetchRawLogs(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs").select("*").order("log_date", { ascending: true });
  if (error) return [];
  return (data as DailyLog[]) ?? [];
}

async function fetchSettings(): Promise<Record<string, number | null>> {
  const supabase = createClient();
  const { data } = await supabase.from("settings").select("key, value_num");
  const rows = (data as Setting[] | null) ?? [];
  return Object.fromEntries(rows.map((r) => [r.key, r.value_num]));
}

export default async function TdeePage() {
  const [enriched, rawLogs, settings] = await Promise.all([
    fetchEnrichedLogs(),
    fetchRawLogs(),
    fetchSettings(),
  ]);

  // 理論 TDEE（settings から）
  const heightCm = settings["height_cm"] ?? null;
  const ageYears = settings["age"] ?? null;
  const activityFactor = settings["activity_factor"] ?? 1.55;
  const latestWeight = rawLogs.filter((d) => d.weight !== null).at(-1)?.weight ?? null;

  const theoreticalTdee =
    heightCm && ageYears && latestWeight
      ? calcTheoreticalTdee({
          weightKg: latestWeight,
          heightCm,
          ageYears,
          isMale: true, // TODO: settings に性別追加
          activityFactor,
        })
      : null;

  // enriched_logs からグラフデータ構築
  const rawCalMap = new Map(
    rawLogs.filter((d) => d.calories !== null).map((d) => [d.log_date, d.calories!])
  );

  // 10日移動平均カロリー
  const sortedRaw = [...rawLogs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const calMaMap = new Map<string, number>();
  for (let i = 0; i < sortedRaw.length; i++) {
    const window = sortedRaw.slice(Math.max(0, i - 9), i + 1).filter((d) => d.calories !== null);
    if (window.length > 0) {
      calMaMap.set(sortedRaw[i].log_date, window.reduce((s, d) => s + d.calories!, 0) / window.length);
    }
  }

  const chartData = (enriched ?? []).map((row) => ({
    date: row.log_date.slice(5),
    tdee: row.tdee_estimated,
    intake: calMaMap.get(row.log_date) ?? null,
    theoretical: theoreticalTdee,
  }));

  const tdeeValues = (enriched ?? []).map((r) => r.tdee_estimated).filter((v): v is number => v !== null);
  const avgTdee = tdeeValues.length > 0
    ? tdeeValues.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, tdeeValues.length)
    : null;

  const avgCalories7 = sortedRaw.slice(-7).filter((d) => d.calories !== null)
    .reduce((s, d) => s + d.calories!, 0) / (sortedRaw.slice(-7).filter((d) => d.calories !== null).length || 1) || null;

  const tableData = (enriched ?? []).map((row) => ({
    date: row.log_date,
    calories: rawCalMap.get(row.log_date) ?? null,
    tdee: row.tdee_estimated,
  }));

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">TDEE・代謝分析</h1>
      {!enriched ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6 text-sm text-amber-700">
          enriched_logs がありません。GitHub Actions の ML バッチ（enrich.py）を実行してください。
        </div>
      ) : (
        <div className="space-y-6">
          <TdeeKpiCard
            avgTdee={avgTdee}
            theoreticalTdee={theoreticalTdee}
            avgCalories={avgCalories7}
          />
          <TdeeDetailChart data={chartData} avgTdee={avgTdee} />
          <TdeeDailyTable data={tableData} />
          {!theoreticalTdee && (
            <p className="text-center text-xs text-gray-400">
              ※ 理論 TDEE を表示するには「設定」で身長・年齢・活動係数を入力してください。
            </p>
          )}
        </div>
      )}
    </main>
  );
}
