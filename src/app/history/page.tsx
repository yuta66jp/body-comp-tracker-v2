import { createClient } from "@/lib/supabase/server";
import { DaysOutChart } from "@/components/history/DaysOutChart";
import { SeasonLowChart } from "@/components/history/SeasonLowChart";
import {
  calcSeasonMeta,
  buildDaysOutSeries,
  buildDaysOutChartData,
} from "@/lib/utils/calcSeason";
import { toJstDateStr } from "@/lib/utils/date";
import type { DailyLog, CareerLog, Setting } from "@/lib/supabase/types";

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

async function fetchSettings(): Promise<Record<string, string | number | null>> {
  const supabase = createClient();
  const { data } = await supabase.from("settings").select("key, value_num, value_str");
  const rows = (data as Setting[] | null) ?? [];
  return Object.fromEntries(
    rows.map((r) => [r.key, r.value_num !== null ? r.value_num : r.value_str])
  );
}

export default async function HistoryPage() {
  const [careerLogs, currentLogs, settings] = await Promise.all([
    fetchCareerLogs(),
    fetchCurrentLogs(),
    fetchSettings(),
  ]);

  const contestDate = typeof settings["contest_date"] === "string"
    ? settings["contest_date"]
    : toJstDateStr();

  const currentSeasonLabel = typeof settings["current_season"] === "string" && settings["current_season"]
    ? settings["current_season"]
    : `${currentLogs.at(-1)?.log_date.slice(0, 4) ?? new Date().getFullYear()}_Current`;

  const seasonMeta = calcSeasonMeta(careerLogs);

  // 現在シーズンのログを career_logs 形式に変換して比較に追加
  const currentAsCareer: CareerLog[] = currentLogs
    .filter((d) => d.weight !== null)
    .map((d) => ({
      id: 0,
      log_date: d.log_date,
      weight: d.weight!,
      season: currentSeasonLabel,
      target_date: contestDate,
      note: null,
    }));

  const allCareerLogs = [...careerLogs, ...currentAsCareer];
  const allSeasonMeta = calcSeasonMeta(allCareerLogs);
  const seriesMap = buildDaysOutSeries(allCareerLogs);
  const daysOutData = buildDaysOutChartData(seriesMap, -300, 0);
  const allSeasons = Array.from(seriesMap.keys());

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-xl font-bold text-gray-800">キャリア比較</h1>

      {/* 現在シーズン情報（読み取り専用・設定ページから変更可能） */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>
          現在シーズン:
          <span className="ml-1 font-semibold text-blue-600">{currentSeasonLabel}</span>
        </span>
        <span>
          大会日:
          <span className="ml-1 font-semibold text-red-500">{contestDate}</span>
        </span>
        <span className="text-slate-300">
          ※ 設定ページの「現在のシーズン」「コンテスト日」で変更できます
        </span>
      </div>

      <div className="space-y-6">
        {allCareerLogs.length > 0 ? (
          <>
            <DaysOutChart
              data={daysOutData}
              seasons={allSeasons}
              currentSeason={currentSeasonLabel}
            />
            {allSeasonMeta.length > 0 && (
              <SeasonLowChart seasons={allSeasonMeta} currentSeason={currentSeasonLabel} />
            )}
            {/* 過去実績データは import_history.py で一括インポートして管理 */}
            {seasonMeta.length === 0 && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-700">
                過去シーズンのデータがありません。
                <code className="ml-1 font-mono text-xs">
                  python ml-pipeline/import_history.py /path/to/history.csv
                </code>
                を実行してインポートしてください。
              </div>
            )}
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
