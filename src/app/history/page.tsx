import { createClient } from "@/lib/supabase/server";
import { DaysOutChart } from "@/components/history/DaysOutChart";
import { SeasonLowChart } from "@/components/history/SeasonLowChart";
import { SeasonManager } from "@/components/history/SeasonManager";
import {
  calcSeasonMeta,
  buildDaysOutSeries,
  buildDaysOutChartData,
} from "@/lib/utils/calcSeason";
import type { DailyLog, CareerLog } from "@/lib/supabase/types";

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

function currentSeasonLabel(logs: DailyLog[]): string {
  const year = logs.at(-1)?.log_date.slice(0, 4) ?? new Date().getFullYear().toString();
  return `${year}_Current`;
}

export default async function HistoryPage() {
  const [careerLogs, currentLogs] = await Promise.all([
    fetchCareerLogs(),
    fetchCurrentLogs(),
  ]);

  const seasonMeta = calcSeasonMeta(careerLogs);

  const currentLabel = currentSeasonLabel(currentLogs);
  const today = new Date().toISOString().slice(0, 10);
  const currentAsCareer: CareerLog[] = currentLogs
    .filter((d) => d.weight !== null)
    .map((d) => ({
      id: 0,
      log_date: d.log_date,
      weight: d.weight!,
      season: currentLabel,
      target_date: today,
      note: null,
    }));

  const allCareerLogs = [...careerLogs, ...currentAsCareer];
  const seriesMap = buildDaysOutSeries(allCareerLogs);
  const daysOutData = buildDaysOutChartData(seriesMap, -300, 0);
  const allSeasons = Array.from(seriesMap.keys());

  const seasonManagerItems = seasonMeta.map((s) => ({
    season: s.season,
    targetDate: s.targetDate,
    count: s.count,
    peakWeight: s.peakWeight,
  }));

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">キャリア比較</h1>

      <div className="space-y-6">
        {allCareerLogs.length > 0 ? (
          <>
            <DaysOutChart
              data={daysOutData}
              seasons={allSeasons}
              currentSeason={currentLabel}
            />
            {seasonMeta.length > 0 && (
              <SeasonLowChart seasons={seasonMeta} />
            )}
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
      </div>
    </main>
  );
}
