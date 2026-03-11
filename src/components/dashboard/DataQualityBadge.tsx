/**
 * DataQualityBadge — ダッシュボード向けコンパクト品質表示
 *
 * Server Component (状態・イベントなし)
 * props は page.tsx で事前計算した DataQualityReport を受け取る。
 */

import type { DataQualityReport } from "@/lib/utils/calcDataQuality";

interface Props {
  report: DataQualityReport;
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600";
  if (score >= 70) return "text-amber-600";
  return "text-rose-600";
}

function scoreBg(score: number): string {
  if (score >= 90) return "bg-emerald-50 border-emerald-200";
  if (score >= 70) return "bg-amber-50 border-amber-200";
  return "bg-rose-50 border-rose-200";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "良好";
  if (score >= 70) return "注意";
  return "要確認";
}

export function DataQualityBadge({ report }: Props) {
  const { period7 } = report;
  const hasIssues =
    period7.weightMissingDays > 0 ||
    period7.caloriesMissingDays > 0 ||
    period7.anomalies.length > 0 ||
    report.duplicateDates.length > 0;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2 text-xs ${scoreBg(period7.score)}`}
    >
      {/* スコア */}
      <span className="flex items-center gap-1.5 font-semibold">
        <span className={`text-[11px] font-bold uppercase tracking-wide ${scoreColor(period7.score)}`}>
          データ品質
        </span>
        <span className={`rounded-full px-2 py-0.5 font-bold ${scoreColor(period7.score)} ${scoreBg(period7.score)}`}>
          {period7.score} / 100
        </span>
        <span className={`${scoreColor(period7.score)}`}>
          {scoreLabel(period7.score)}
        </span>
      </span>

      {/* 区切り */}
      <span className="hidden text-slate-300 sm:inline">|</span>

      {/* 詳細チップ */}
      {hasIssues ? (
        <span className="flex flex-wrap gap-2 text-slate-600">
          {period7.weightMissingDays > 0 && (
            <span>⚠ 体重欠損 <b>{period7.weightMissingDays}</b> 日</span>
          )}
          {period7.caloriesMissingDays > 0 && (
            <span>⚠ カロリー欠損 <b>{period7.caloriesMissingDays}</b> 日</span>
          )}
          {period7.anomalies.length > 0 && (
            <span>⚠ 異常値候補 <b>{period7.anomalies.length}</b> 件</span>
          )}
          {report.duplicateDates.length > 0 && (
            <span>⚠ 重複日付 <b>{report.duplicateDates.length}</b> 件</span>
          )}
        </span>
      ) : (
        <span className="text-emerald-600">直近7日のデータは問題なし</span>
      )}

      <span className="ml-auto hidden text-slate-400 sm:inline">
        直近7日
      </span>
    </div>
  );
}
