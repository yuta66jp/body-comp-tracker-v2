import { BacktestResults } from "@/components/charts/BacktestResults";
import { BacktestComparison } from "@/components/charts/BacktestComparison";
import { ForecastAccuracyRefreshButton } from "@/components/charts/ForecastAccuracyRefreshButton";
import { BarChart2 } from "lucide-react";
import { fetchLatestRuns, fetchMetrics } from "@/lib/queries/backtest";
import { PageShell } from "@/components/ui/PageShell";

export const revalidate = 3600; // 1時間キャッシュ (バッチは週1回)

// ─── 共通タイトルスロット ────────────────────────────────────────────────────

function ForecastTitle({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 md:mb-6">
      <BarChart2 size={20} className="text-blue-600" />
      <h1 className="text-xl font-bold text-slate-800">予測精度評価</h1>
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
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          バックテストデータの取得に失敗しました。しばらく経ってから再度お試しください。
        </div>
      </PageShell>
    );
  }

  const { dailyRun, sma7Run } = runsResult.data;

  // 両方ともデータなし
  if (!dailyRun && !sma7Run) {
    return (
      <PageShell titleSlot={<ForecastTitle><ForecastAccuracyRefreshButton /></ForecastTitle>}>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-500">
            まだバックテストが実行されていません
          </p>
          <p className="mt-2 text-xs text-slate-400">
            GitHub Actions の{" "}
            <code className="bg-slate-100 px-1 rounded">ml-backtest.yml</code>{" "}
            を手動実行するか、毎週月曜 AM 4:00 JST の自動実行をお待ちください。
          </p>
          <p className="mt-2 text-xs text-slate-400">ローカルでの実行:</p>
          <div className="mt-1 flex flex-col items-center gap-1 text-xs">
            <code className="bg-slate-100 px-2 py-0.5 rounded">
              python ml-pipeline/backtest.py
            </code>
            <code className="bg-slate-100 px-2 py-0.5 rounded">
              python ml-pipeline/backtest.py --series-type sma7
            </code>
          </div>
        </div>
      </PageShell>
    );
  }

  // metrics を並列取得
  const [dailyMetricsResult, sma7MetricsResult] = await Promise.all([
    dailyRun ? fetchMetrics(dailyRun.id) : Promise.resolve({ kind: "ok" as const, data: [] }),
    sma7Run ? fetchMetrics(sma7Run.id) : Promise.resolve({ kind: "ok" as const, data: [] }),
  ]);

  const dailyMetrics = dailyMetricsResult.kind === "ok" ? dailyMetricsResult.data : [];
  const sma7Metrics = sma7MetricsResult.kind === "ok" ? sma7MetricsResult.data : [];

  return (
    <PageShell
      titleSlot={
        <ForecastTitle>
          <span className="hidden sm:inline text-xs text-slate-400">データは週次バッチで更新されます</span>
          <ForecastAccuracyRefreshButton />
        </ForecastTitle>
      }
    >
      <div className="space-y-6">
        {/* ── 単日 vs 7日平均 比較 (新セクション) ── */}
        <BacktestComparison
          dailyMetrics={dailyMetrics}
          sma7Metrics={sma7Metrics}
        />

        {/* ── 単日評価の詳細 (既存) ── */}
        {dailyRun && dailyMetricsResult.kind === "ok" && dailyMetrics.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-bold text-slate-600">
              単日体重ベース評価
              <span className="ml-2 text-xs font-normal text-slate-400">
                ({dailyRun.created_at.slice(0, 10)} 実行)
              </span>
            </h2>
            <BacktestResults run={dailyRun} metrics={dailyMetrics} />
          </div>
        ) : dailyRun && dailyMetricsResult.kind === "error" ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            単日評価: 指標データの取得に失敗しました。
          </div>
        ) : dailyRun ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            単日評価: バックテスト実行は記録されていますが、指標データが見つかりませんでした。
          </div>
        ) : null}

        {/* ── 7日平均評価の詳細 (新セクション) ── */}
        {sma7Run && sma7MetricsResult.kind === "ok" && sma7Metrics.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-bold text-slate-600">
              7日平均体重ベース評価
              <span className="ml-2 text-xs font-normal text-slate-400">
                ({sma7Run.created_at.slice(0, 10)} 実行)
              </span>
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                ノイズ除去済み
              </span>
            </h2>
            <BacktestResults run={sma7Run} metrics={sma7Metrics} />
          </div>
        ) : sma7Run && sma7MetricsResult.kind === "error" ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            7日平均評価: 指標データの取得に失敗しました。
          </div>
        ) : sma7Run ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            7日平均評価: バックテスト実行は記録されていますが、指標データが見つかりませんでした。
          </div>
        ) : (
          /* sma7 未実行の場合の誘導 */
          <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-600">
            <p className="font-semibold">7日平均ベース評価を追加するには:</p>
            <code className="mt-2 block rounded bg-emerald-100 px-3 py-1.5 text-xs font-mono">
              python ml-pipeline/backtest.py --series-type sma7
            </code>
            <p className="mt-2 text-xs text-emerald-600">
              単日評価より MAE が低くなるのは正常です。
              水分変動 (±0.5〜1.5 kg) によるノイズが評価から除去されるためです。
            </p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
