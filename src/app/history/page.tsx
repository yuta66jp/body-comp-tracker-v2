import { createClient } from "@/lib/supabase/server";
import { MonthlyChart, COLORS } from "@/components/history/MonthlyChart";
import { SeasonSummary } from "@/components/history/SeasonSummary";
import type { DailyLog } from "@/lib/supabase/types";
import type { MonthStats } from "@/components/history/SeasonSummary";

export const revalidate = 3600;

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

function groupByMonth(logs: DailyLog[]) {
  const map = new Map<string, DailyLog[]>();
  for (const log of logs) {
    const month = log.log_date.slice(0, 7); // YYYY-MM
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(log);
  }
  return map;
}

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function buildMonthStats(monthMap: Map<string, DailyLog[]>): MonthStats[] {
  return Array.from(monthMap.entries()).map(([month, logs]) => {
    const withWeight = logs.filter((d) => d.weight !== null);
    return {
      month,
      avgWeight: avg(logs.map((d) => d.weight)),
      avgCalories: avg(logs.map((d) => d.calories)),
      avgProtein: avg(logs.map((d) => d.protein)),
      startWeight: withWeight[0]?.weight ?? null,
      endWeight: withWeight[withWeight.length - 1]?.weight ?? null,
      days: logs.length,
    };
  });
}

/** 月ごとの週次平均を計算して MonthlyChart 用データに変換 */
function buildWeeklyData(
  monthMap: Map<string, DailyLog[]>,
  key: keyof Pick<DailyLog, "weight" | "calories" | "protein">
) {
  const maxWeeks = Math.max(
    ...Array.from(monthMap.values()).map((logs) => Math.ceil(logs.length / 7))
  );

  const months = Array.from(monthMap.keys());

  const data = Array.from({ length: maxWeeks }, (_, weekIdx) => {
    const point: { week: string; [k: string]: string | number | null } = {
      week: `W${weekIdx + 1}`,
    };
    for (const month of months) {
      const logs = monthMap.get(month)!;
      const slice = logs.slice(weekIdx * 7, (weekIdx + 1) * 7);
      const valid = slice.map((d) => d[key]).filter((v): v is number => v !== null);
      point[month] = valid.length > 0
        ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
        : null;
    }
    return point;
  });

  return { data, months };
}

export default async function HistoryPage() {
  const logs = await fetchLogs();

  if (logs.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-gray-400">データがありません。</p>
      </main>
    );
  }

  const monthMap = groupByMonth(logs);
  const stats = buildMonthStats(monthMap);
  const { data: weightData, months } = buildWeeklyData(monthMap, "weight");
  const { data: calData } = buildWeeklyData(monthMap, "calories");

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">過去シーズン比較</h1>
      <div className="space-y-6">
        <SeasonSummary stats={stats} />
        <MonthlyChart
          data={weightData}
          months={months}
          title="体重推移（月別・週次平均）"
          unit="kg"
          colors={COLORS}
        />
        <MonthlyChart
          data={calData}
          months={months}
          title="摂取カロリー（月別・週次平均）"
          unit="kcal"
          colors={COLORS}
        />
      </div>
    </main>
  );
}
