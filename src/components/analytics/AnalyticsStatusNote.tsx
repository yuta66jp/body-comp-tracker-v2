/**
 * AnalyticsStatusNote — analytics 依存値の stale / unavailable / error 補助注記
 *
 * - fresh:       何も表示しない
 * - stale:       「再計算前データ（最終更新: YYYY-MM-DD、最新ログより N 日遅れ）」
 *                staleDays は「キャッシュ日と最新依存データ日の差」であり、
 *                「今日から N 日前」ではない。文言はこの意味を正確に伝える。
 * - unavailable: 「未計算 — <unavailableLabel>」
 * - error:       「取得エラー — <errorLabel>」
 *
 * 使用箇所: TdeeKpiCard, WeeklyReviewCard エネルギーバランス, FactorAnalysis ヘッダー
 */
import type { AnalyticsAvailability } from "@/lib/analytics/status";

interface Props {
  availability: AnalyticsAvailability;
  /** unavailable 時の説明ラベル（デフォルト: "ML バッチが未実行のため未計算"） */
  unavailableLabel?: string;
  /** error 時の説明ラベル（デフォルト: "データ取得に失敗しました"） */
  errorLabel?: string;
}

export function AnalyticsStatusNote({
  availability,
  unavailableLabel = "ML バッチが未実行のため未計算",
  errorLabel = "データ取得に失敗しました",
}: Props) {
  if (availability.status === "fresh") return null;

  if (availability.status === "stale") {
    const dateStr = availability.lastUpdatedDate ?? "不明";
    // staleDays は「キャッシュ日と最新依存データ日の差」。
    // 「N日前」は「今日からN日前」と誤読されるため、比較基準を明示した文言にする。
    const dayStr =
      availability.staleDays !== null && availability.staleDays > 0
        ? `、最新ログより${availability.staleDays}日遅れ`
        : "";
    return (
      <span className="inline-block text-xs text-amber-600">
        再計算前データ（最終更新: {dateStr}{dayStr}）
      </span>
    );
  }

  if (availability.status === "error") {
    return (
      <span className="inline-block text-xs text-rose-500">
        {errorLabel}
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
