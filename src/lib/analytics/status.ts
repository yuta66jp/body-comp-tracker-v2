/**
 * analytics_cache / enriched_logs の状態モデル
 *
 * AnalyticsStatus の意味:
 *   fresh      — 最新入力に対して整合している（バッチが rawLogs の最新日以降に実行済み）
 *   stale      — データはあるが最新入力に対して再計算未反映（値は表示継続、補助注記を付ける）
 *   unavailable— 必要な派生データが未作成（バッチ未実行または条件不足）
 *
 * 使い分け:
 *   unavailable: "—" で明示し、「未計算」理由を補助文で説明する
 *   stale:       値をそのまま表示し「再計算前データ」注記を添える
 *   fresh:       通常表示（注記なし）
 */
import { daysBetween } from "@/lib/utils/date";

export type AnalyticsStatus = "fresh" | "stale" | "unavailable";

export interface AnalyticsAvailability {
  status: AnalyticsStatus;
  /** ML バッチ最終実行日 (YYYY-MM-DD)。unavailable の場合は null */
  lastUpdatedDate: string | null;
  /** stale の場合、最新 rawLog 日からの経過日数 */
  staleDays: number | null;
}

/**
 * analytics_cache エントリの新鮮さを判定する。
 *
 * @param cacheUpdatedAt   analytics_cache.updated_at (ISO 8601 文字列)。null = バッチ未実行
 * @param latestRawLogDate rawLogs の最新 log_date (YYYY-MM-DD)。null = ログなし
 *
 * 判定ロジック:
 *   - cacheUpdatedAt が null → unavailable
 *   - cacheUpdatedAt の日付部分 < latestRawLogDate → stale（最新入力に未対応）
 *   - それ以外 → fresh
 */
export function getAnalyticsAvailability(
  cacheUpdatedAt: string | null,
  latestRawLogDate: string | null
): AnalyticsAvailability {
  if (!cacheUpdatedAt) {
    return { status: "unavailable", lastUpdatedDate: null, staleDays: null };
  }

  const lastUpdatedDate = cacheUpdatedAt.slice(0, 10); // "YYYY-MM-DD"

  if (!latestRawLogDate || lastUpdatedDate >= latestRawLogDate) {
    return { status: "fresh", lastUpdatedDate, staleDays: null };
  }

  const staleDays = daysBetween(lastUpdatedDate, latestRawLogDate) ?? 1;
  return { status: "stale", lastUpdatedDate, staleDays };
}
