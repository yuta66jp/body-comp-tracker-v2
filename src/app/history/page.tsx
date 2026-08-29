import { SeasonHistoryExplorer } from "@/components/history/SeasonHistoryExplorer";
import { StatusNotice } from "@/components/ui/StatusNotice";
import { PageShell } from "@/components/ui/PageShell";
import { fetchCareerLogs, fetchSeasonHistoryDailyLogs } from "@/lib/queries/dailyLogs";
import { fetchSeasons } from "@/lib/queries/seasons";
import { buildSeasonHistoryData } from "@/lib/utils/seasonHistory";
import { toJstDateStr } from "@/lib/utils/date";

// 進行中シーズンの日次ログを現在値として扱うため、毎回最新状態を取得する。
export const revalidate = 0;

export default async function HistoryPage() {
  const [seasonsResult, dailyLogsResult, careerLogsResult] = await Promise.all([
    fetchSeasons(),
    fetchSeasonHistoryDailyLogs(),
    fetchCareerLogs(),
  ]);

  const today = toJstDateStr();
  const history = buildSeasonHistoryData(
    seasonsResult.kind === "ok" ? seasonsResult.data : [],
    dailyLogsResult.kind === "ok" ? dailyLogsResult.data : [],
    careerLogsResult.kind === "ok" ? careerLogsResult.data : [],
    today
  );

  return (
    <PageShell title="履歴">

      <div className="mb-4 space-y-3">
        {seasonsResult.kind === "error" && (
          <StatusNotice status="error">
            シーズン情報を取得できませんでした。移行前のキャリア履歴だけを表示します。
          </StatusNotice>
        )}
        {dailyLogsResult.kind === "error" && (
          <StatusNotice status="error">
            日次ログを取得できませんでした。利用可能な終了済みキャリア履歴で表示します。
          </StatusNotice>
        )}
        {careerLogsResult.kind === "error" && (
          <StatusNotice status="caution">
            移行前のキャリア履歴を取得できませんでした。シーズン所属の日次ログを優先して表示します。
          </StatusNotice>
        )}
      </div>

      <SeasonHistoryExplorer
        records={history.records}
        legacyRecords={history.legacyRecords}
        unassignedLogCount={history.unassignedLogCount}
        today={today}
      />
    </PageShell>
  );
}
