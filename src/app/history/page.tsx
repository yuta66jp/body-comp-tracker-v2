import { createClient } from "@/lib/supabase/server";
import { DaysOutChart } from "@/components/history/DaysOutChart";
import { SeasonLowChart } from "@/components/history/SeasonLowChart";
import { SeasonManager } from "@/components/history/SeasonManager";
import { MonthlyChart, COLORS } from "@/components/history/MonthlyChart";
import { SeasonSummary } from "@/components/history/SeasonSummary";
import {
  calcSeasonMeta,
  buildDaysOutSeries,
  buildDaysOutChartData,
} from "@/lib/utils/calcSeason";
import type { DailyLog, CareerLog } from "@/lib/supabase/types";
import type { MonthStats } from "@/components/history/SeasonSummary";

export const revalidate = 3600;

async function fetchCareerLogs(): Promise<CareerLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("career_logs")
    .select("*")
    .order("log_date", { ascending: true });
  if (error) { console.error(error.message); return []; }
  return (data as CareerLog[]) ?? [];
}

async function fetchCurrentLogs(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date, weight")
    .not("weight", "is", null)
    .order("log_date", { ascending: true });
  if (error) { console.error(error.message); return []; }
  return (data as DailyLog[]) ?? [];
}

async function fetchAllLogs(): Promise<DailyLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_logs").select("*").order("log_date", { ascending: true });
  if (error) return [];
  return (data as DailyLog[]) ?? [];
}

function groupByMonth(logs: DailyLog[]) {
  const map = new Map<string, DailyLog[]>();
  for (const log of logs) {
    const month = log.log_date.slice(0, 7);
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(log);
  }
  return map;
}

function avg(vals: (number | null)[]): number | null {
  const v = vals.filter((x): x is number => x !== null);
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
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

function buildWeeklyData(
  monthMap: Map<string, DailyLog[]>,
  key: keyof Pick<DailyLog, "weight" | "calories">
) {
  const maxWeeks = Math.max(
    ...Array.from(monthMap.values()).map((logs) => Math.ceil(logs.length / 7))
  );
  const months = Array.from(monthMap.keys());
  const data = Array.from({ length: maxWeeks }, (_, weekIdx) => {
    const point: { week: string; [k: string]: string | number | null } = { week: `W${weekIdx + 1}` };
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

/** current daily_logs を career_logs 形式に変換してシーズン比較に追加 */
function currentSeasonLabel(logs: DailyLog[]): string {
  const year = logs.at(-1)?.log_date.slice(0, 4) ?? new Date().getFullYear().toString();
  return `${year}_Current`;
}

export default async function HistoryPage() {
  const [careerLogs, currentLogs, allLogs] = await Promise.all([
    fetchCareerLogs(),
    fetchCurrentLogs(),
    fetchAllLogs(),
  ]);

  // --- キャリア比較 (Tab2 / Tab3 相当) ---
  const seasonMeta = calcSeasonMeta(careerLogs);

  // 現在シーズンを career_logs 形式に変換して追加
  const currentLabel = currentSeasonLabel(currentLogs);
  const today = new Date().toISOString().slice(0, 10);
  const currentAsCareer: CareerLog[] = currentLogs
    .filter((d) => d.weight !== null)
    .map((d) => ({
      id: 0,
      log_date: d.log_date,
      weight: d.weight!,
      season: currentLabel,
      target_date: today, // 大会日未定の場合は今日をプレースホルダーに
      note: null,
    }));

  const allCareerLogs = [...careerLogs, ...currentAsCareer];
  const allSeasonMeta = calcSeasonMeta(allCareerLogs);

  const seriesMap = buildDaysOutSeries(allCareerLogs);
  const daysOutData = buildDaysOutChartData(seriesMap, -300, 0);
  const allSeasons = Array.from(seriesMap.keys());

  // 過去シーズンのみ Season Low チャートに表示
  const historicMeta = seasonMeta; // currentLabel 含まない

  // --- 月次比較 (旧 Tab2 の月次集計) ---
  const monthMap = groupByMonth(allLogs);
  const monthStats = buildMonthStats(monthMap);
  const { data: weightData, months } = buildWeeklyData(monthMap, "weight");
  const { data: calData } = buildWeeklyData(monthMap, "calories");

  const seasonManagerItems = seasonMeta.map((s) => ({
    season: s.season,
    targetDate: s.targetDate,
    count: s.count,
    peakWeight: s.peakWeight,
  }));

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">履歴・シーズン比較</h1>

      <div className="space-y-6">
        {/* キャリア比較セクション */}
        {allCareerLogs.length > 0 ? (
          <>
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                キャリア比較
              </h2>
              <div className="space-y-6">
                <DaysOutChart
                  data={daysOutData}
                  seasons={allSeasons}
                  currentSeason={currentLabel}
                />
                {historicMeta.length > 0 && (
                  <SeasonLowChart seasons={historicMeta} />
                )}
              </div>
            </div>
            <SeasonManager seasons={seasonManagerItems} />
          </>
        ) : (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-700">
            キャリアデータがありません。
            <code className="ml-1 font-mono text-xs">
              python ml-pipeline/import_history.py /path/to/history.csv
            </code>
            を実行してデータをインポートしてください。
          </div>
        )}

        {/* 月次比較セクション */}
        {allLogs.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              月次比較（現在のログ）
            </h2>
            <div className="space-y-6">
              <SeasonSummary stats={monthStats} />
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
          </div>
        )}
      </div>
    </main>
  );
}
