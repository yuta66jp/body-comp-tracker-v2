import { DaysOutChart } from "@/components/history/DaysOutChart";
import { SeasonLowChart } from "@/components/history/SeasonLowChart";
import { SeasonComparisonTable } from "@/components/history/SeasonComparisonTable";
import { SeasonComparisonAccordion } from "@/components/history/SeasonComparisonAccordion";
import { TodayWindowComparison } from "@/components/history/TodayWindowComparison";
import {
  calcSeasonMeta,
  buildDaysOutSeries,
  buildDaysOutChartData,
  buildMilestoneRows,
  buildTodayWindowEntries,
  calcTodayDaysOut,
} from "@/lib/utils/calcSeason";
import { toJstDateStr } from "@/lib/utils/date";
import { fetchCareerLogs, fetchWeightLogs } from "@/lib/queries/dailyLogs";
import { fetchSettings } from "@/lib/queries/settings";
import { mapToAppSettings } from "@/lib/domain/settings";
import type { CareerLog } from "@/lib/supabase/types";
import { PageShell } from "@/components/ui/PageShell";

/** 比較するマイルストーン (大会日からの日数) */
const MILESTONES = [-180, -120, -90, -60, -30, -14];

export const revalidate = 3600;

export default async function HistoryPage() {
  const [careerLogsResult, currentLogs, settingsResult] = await Promise.all([
    fetchCareerLogs(),
    fetchWeightLogs(),
    fetchSettings(),
  ]);

  // QueryResult を展開。エラー時はフォールバック値で graceful degradation を維持する。
  const careerLogs = careerLogsResult.kind === "ok" ? careerLogsResult.data : [];
  const settings = settingsResult.kind === "ok" ? settingsResult.data : mapToAppSettings([]);

  const contestDate = settings.contestDate ?? toJstDateStr();

  const currentSeasonLabel = settings.currentSeason
    ? settings.currentSeason
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
  // 古いシーズンから新しいシーズンへ昇順に統一 (Season Low・Today比較・比較テーブルで表示順を揃える)
  const allSeasons = Array.from(seriesMap.keys()).sort((a, b) => a.localeCompare(b));

  // ── 比較テーブル用データ ──
  const milestoneRows = buildMilestoneRows(seriesMap, MILESTONES);

  // 今日の daysOut と 今日基準近傍比較データ
  const todayStr = toJstDateStr();
  const todayDaysOut = calcTodayDaysOut(todayStr, contestDate);
  const todayWindowEntries =
    todayDaysOut !== null
      ? buildTodayWindowEntries(seriesMap, todayDaysOut, 7)
      : [];

  const isCut = settings.currentPhase !== "Bulk";

  return (
    <PageShell title="キャリア比較">

      {/* Read error banners — graceful degradation: コンテンツはブロックしない */}
      {careerLogsResult.kind === "error" && (
        <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          キャリアデータの取得中にエラーが発生しました。ページを再読み込みしてください。
        </div>
      )}
      {settingsResult.kind === "error" && (
        <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          設定データの取得中にエラーが発生しました。コンテスト日・シーズン名がデフォルト値になります。
        </div>
      )}

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
            {/* 今日基準近傍比較 (メイン判断用) */}
            {todayDaysOut !== null && (
              <TodayWindowComparison
                entries={todayWindowEntries}
                currentSeason={currentSeasonLabel}
                todayDaysOut={todayDaysOut}
                windowDays={7}
                isCut={isCut}
              />
            )}

            {/* days-out グラフ (視覚的確認用) */}
            <DaysOutChart
              data={daysOutData}
              seasons={allSeasons}
              currentSeason={currentSeasonLabel}
              todayDaysOut={todayDaysOut}
            />

            {/* 全シーズン × マイルストーン 比較: モバイルはアコーディオン / md+ はテーブル */}
            <div className="md:hidden">
              <SeasonComparisonAccordion
                milestoneRows={milestoneRows}
                seasonMeta={allSeasonMeta}
                seasons={allSeasons}
                currentSeason={currentSeasonLabel}
                isCut={isCut}
              />
            </div>
            <div className="hidden md:block">
              <SeasonComparisonTable
                milestoneRows={milestoneRows}
                seasonMeta={allSeasonMeta}
                seasons={allSeasons}
                currentSeason={currentSeasonLabel}
                isCut={isCut}
              />
            </div>

            {/* 仕上がり体重推移 */}
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
    </PageShell>
  );
}
