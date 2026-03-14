/**
 * AnalyticsStatusNote — analytics 依存値の stale / unavailable 補助注記
 *
 * - fresh:       何も表示しない
 * - stale:       「再計算前データ（最終更新: YYYY-MM-DD、N日前）」
 * - unavailable: 「未計算 — <unavailableLabel>」
 *
 * 使用箇所: TdeeKpiCard, WeeklyReviewCard エネルギーバランス, FactorAnalysis ヘッダー
 */
import type { AnalyticsAvailability } from "@/lib/analytics/status";

interface Props {
  availability: AnalyticsAvailability;
  /** unavailable 時の説明ラベル（デフォルト: "ML バッチが未実行のため未計算"） */
  unavailableLabel?: string;
}

export function AnalyticsStatusNote({
  availability,
  unavailableLabel = "ML バッチが未実行のため未計算",
}: Props) {
  if (availability.status === "fresh") return null;

  if (availability.status === "stale") {
    const dateStr = availability.lastUpdatedDate ?? "不明";
    const dayStr =
      availability.staleDays !== null && availability.staleDays > 0
        ? `、${availability.staleDays}日前`
        : "";
    return (
      <span className="inline-block text-xs text-amber-600">
        再計算前データ（最終更新: {dateStr}{dayStr}）
      </span>
    );
  }

  // unavailable
  return (
    <span className="inline-block text-xs text-slate-400">
      {unavailableLabel}
    </span>
  );
}
