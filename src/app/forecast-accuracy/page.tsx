import { BacktestResults } from "@/components/charts/BacktestResults";
import { BacktestComparison } from "@/components/charts/BacktestComparison";
import { BacktestPolicyComparison } from "@/components/charts/BacktestPolicyComparison";
import { BacktestExcludedDates } from "@/components/charts/BacktestExcludedDates";
import { BacktestLongEventDetails } from "@/components/charts/BacktestLongEventDetails";
import { ForecastAccuracyRefreshButton } from "@/components/charts/ForecastAccuracyRefreshButton";
import { BarChart2 } from "lucide-react";
import { fetchLatestRuns, fetchMetrics, fetchFlaggedLogsForRun } from "@/lib/queries/backtest";
import { parseRunConfig, buildExclusionList, buildLongEventBlocks, buildLongEventExclusionList } from "@/lib/utils/backtestExclusion";
import { PageShell } from "@/components/ui/PageShell";

export const revalidate = 3600; // 1時間キャッシュ (バッチは週1回)

// ─── 共通タイトルスロット ────────────────────────────────────────────────────

function ForecastTitle({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 md:mb-6">
      <BarChart2 size={20} className="text-blue-600" />
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">予測精度評価</h1>
      {children}
    </div>
  );
}

// ─── ページ ──────────────────────────────────────────────────────────────────

export default async function ForecastAccuracyPage() {
  const runsResult = await fetchLatestRuns();

  if (runsResult.kind === "error") {
    return (
      <PageShell titleSlot={<ForecastTitle />}>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-400">
          バックテストデータの取得に失敗しました。しばらく経ってから再度お試しください。
        </div>
      </PageShell>
    );
  }

  const { dailyRun, sma7Run, prevDailyRun, prevSma7Run } = runsResult.data;

  // 両方ともデータなし
  if (!dailyRun && !sma7Run) {
    return (
      <PageShell titleSlot={<ForecastTitle><ForecastAccuracyRefreshButton /></ForecastTitle>}>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900 p-10 text-center">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            まだバックテストが実行されていません
          </p>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            GitHub Actions の{" "}
            <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">ml-backtest.yml</code>{" "}
            を手動実行するか、毎週月曜 AM 4:00 JST の自動実行をお待ちください。
          </p>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">ローカルでの実行:</p>
          <div className="mt-1 flex flex-col items-center gap-1 text-xs">
            <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              python ml-pipeline/backtest.py
            </code>
            <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              python ml-pipeline/backtest.py --series-type sma7
            </code>
          </div>
        </div>
      </PageShell>
    );
  }

  // metrics と除外日用フラグログを並列取得
  const [dailyMetricsResult, sma7MetricsResult, prevDailyMetricsResult, prevSma7MetricsResult, flaggedLogs] = await Promise.all([
    dailyRun     ? fetchMetrics(dailyRun.id)     : Promise.resolve({ kind: "ok" as const, data: [] }),
    sma7Run      ? fetchMetrics(sma7Run.id)      : Promise.resolve({ kind: "ok" as const, data: [] }),
    // 前回 run の metrics (前回比バッジ用。run 不在時は正常系として空配列)
    prevDailyRun ? fetchMetrics(prevDailyRun.id) : Promise.resolve({ kind: "ok" as const, data: [] }),
    prevSma7Run  ? fetchMetrics(prevSma7Run.id)  : Promise.resolve({ kind: "ok" as const, data: [] }),
    // dailyRun の除外日一覧再導出用 (ベストエフォート: 失敗しても空配列)
    dailyRun?.train_min_date && dailyRun?.train_max_date
      ? fetchFlaggedLogsForRun(dailyRun.train_min_date, dailyRun.train_max_date)
      : Promise.resolve([]),
  ]);

  const dailyMetrics     = dailyMetricsResult.kind     === "ok" ? dailyMetricsResult.data     : [];
  const sma7Metrics      = sma7MetricsResult.kind      === "ok" ? sma7MetricsResult.data      : [];
  const prevDailyMetrics = prevDailyMetricsResult.kind === "ok" ? prevDailyMetricsResult.data : [];
  const prevSma7Metrics  = prevSma7MetricsResult.kind  === "ok" ? prevSma7MetricsResult.data  : [];

  // dailyRun の除外日一覧を再導出 (exclude_flagged_plus_recovery policy が存在する場合のみ表示)
  const hasExcludePolicy    = dailyMetrics.some((m) => m.eval_policy === "exclude_flagged_plus_recovery");
  const hasLongEventPolicy  = dailyMetrics.some((m) => m.eval_policy === "exclude_long_event_blocks");

  const parsedRunConfig = dailyRun ? parseRunConfig(dailyRun.config) : null;

  const excludedDateEntries = (() => {
    if (!hasExcludePolicy || !parsedRunConfig) return null;
    const { recoveryDays, manualEventPeriods } = parsedRunConfig;
    return {
      entries: buildExclusionList(flaggedLogs, recoveryDays, manualEventPeriods),
      recoveryDays,
      manualEventPeriods,
    };
  })();

  // 長期イベントブロック除外の再導出 (#480)
  const longEventDetails = (() => {
    if (!hasLongEventPolicy || !parsedRunConfig) return null;
    const { longEventThreshold, longEventRecoveryDays, manualEventPeriods } = parsedRunConfig;
    const blocks = buildLongEventBlocks(flaggedLogs, manualEventPeriods, longEventThreshold);
    const exclusionEntries = buildLongEventExclusionList(
      flaggedLogs, manualEventPeriods, longEventThreshold, longEventRecoveryDays,
    );
    return {
      blocks,
      longEventThreshold,
      longEventRecoveryDays,
      excludedCalendarDays: exclusionEntries.length,
    };
  })();

  return (
    <PageShell
      titleSlot={
        <ForecastTitle>
          <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">データは週次バッチで更新されます</span>
          <ForecastAccuracyRefreshButton />
        </ForecastTitle>
      }
    >
      <div className="space-y-6">
        {/* ── 単日 vs 7日平均 比較 ── */}
        <BacktestComparison
          dailyMetrics={dailyMetrics}
          sma7Metrics={sma7Metrics}
          prevDailyMetrics={prevDailyMetrics}
          prevSma7Metrics={prevSma7Metrics}
        />

        {/* ── 全日 vs イベント除外 評価条件別比較 (#364) ──
            dailyMetrics に all_days / exclude_flagged_plus_recovery の両 policy 行が含まれる場合に表示。
            exclude policy 行がない旧 run では BacktestPolicyComparison が null を返すため表示されない。 */}
        {dailyMetrics.length > 0 && (
          <BacktestPolicyComparison metrics={dailyMetrics} />
        )}

        {/* ── 除外対象日の確認 (#370) ──
            exclude_flagged_plus_recovery policy が存在する run のみ表示。
            daily_logs のフラグと run.config から除外日一覧を再導出して表示する。 */}
        {excludedDateEntries && (
          <BacktestExcludedDates
            entries={excludedDateEntries.entries}
            recoveryDays={excludedDateEntries.recoveryDays}
            manualEventPeriods={excludedDateEntries.manualEventPeriods}
          />
        )}

        {/* ── 長期イベント区間詳細 (#480) ──
            exclude_long_event_blocks policy が存在する run のみ表示。
            検出ブロック一覧 + 全ポリシー詳細指標 (MAE/RMSE/Bias/n) を表示する。 */}
        {longEventDetails && (
          <BacktestLongEventDetails
            metrics={dailyMetrics}
            longEventBlocks={longEventDetails.blocks}
            longEventThreshold={longEventDetails.longEventThreshold}
            longEventRecoveryDays={longEventDetails.longEventRecoveryDays}
            excludedCalendarDays={longEventDetails.excludedCalendarDays}
          />
        )}

        {/* ── 単日評価の詳細 ── */}
        {dailyRun && dailyMetricsResult.kind === "ok" && dailyMetrics.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-bold text-slate-600 dark:text-slate-300">
              単日体重ベース評価
              <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
                ({dailyRun.created_at.slice(0, 10)} 実行)
              </span>
            </h2>
            <BacktestResults run={dailyRun} metrics={dailyMetrics} />
          </div>
        ) : dailyRun && dailyMetricsResult.kind === "error" ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-400">
            単日評価: 指標データの取得に失敗しました。
          </div>
        ) : dailyRun ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            単日評価: バックテスト実行は記録されていますが、指標データが見つかりませんでした。
          </div>
        ) : null}

        {/* ── 7日平均評価の詳細 (新セクション) ── */}
        {sma7Run && sma7MetricsResult.kind === "ok" && sma7Metrics.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-bold text-slate-600 dark:text-slate-300">
              7日平均体重ベース評価
              <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
                ({sma7Run.created_at.slice(0, 10)} 実行)
              </span>
              <span className="ml-2 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                ノイズ除去済み
              </span>
            </h2>
            <BacktestResults run={sma7Run} metrics={sma7Metrics} />
          </div>
        ) : sma7Run && sma7MetricsResult.kind === "error" ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-400">
            7日平均評価: 指標データの取得に失敗しました。
          </div>
        ) : sma7Run ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            7日平均評価: バックテスト実行は記録されていますが、指標データが見つかりませんでした。
          </div>
        ) : (
          /* sma7 未実行の場合の誘導 */
          <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 dark:border-emerald-700/50 dark:bg-emerald-900/20 p-5 text-sm text-emerald-600 dark:text-emerald-400">
            <p className="font-semibold">7日平均ベース評価を追加するには:</p>
            <code className="mt-2 block rounded bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1.5 text-xs font-mono">
              python ml-pipeline/backtest.py --series-type sma7
            </code>
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              単日評価より MAE が低くなるのは正常です。
              水分変動 (±0.5〜1.5 kg) によるノイズが評価から除去されるためです。
            </p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
