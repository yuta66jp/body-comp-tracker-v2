/**
 * analytics_cache / enriched_logs の状態モデル
 *
 * AnalyticsStatus の意味:
 *   fresh      — 最新入力に対して整合している（バッチが rawLogs の最新日以降に実行済み）
 *   stale      — データはあるが最新入力に対して再計算未反映（値は表示継続、補助注記を付ける）
 *   unavailable— 必要な派生データが未作成（バッチ未実行または条件不足）
 *   error      — Supabase フェッチで予期しないエラー発生（PGRST116 以外）
 *
 * 使い分け:
 *   unavailable: "—" で明示し、「未計算」理由を補助文で説明する
 *   stale:       値をそのまま表示し「再計算前データ」注記を添える
 *   fresh:       通常表示（注記なし）
 *   error:       エラー表示を行い、再試行を案内する
 */
import { daysBetween } from "@/lib/utils/date";

export type AnalyticsStatus = "fresh" | "stale" | "unavailable" | "error";

export interface AnalyticsAvailability {
  status: AnalyticsStatus;
  /** ML バッチ最終実行日 (YYYY-MM-DD)。unavailable / error の場合は null */
  lastUpdatedDate: string | null;
  /** stale の場合、最新依存データ日からの経過日数 */
  staleDays: number | null;
}

// ─── ヘルパー ──────────────────────────────────────────────────────────────

export function unavailableAvailability(): AnalyticsAvailability {
  return { status: "unavailable", lastUpdatedDate: null, staleDays: null };
}

export function errorAvailability(): AnalyticsAvailability {
  return { status: "error", lastUpdatedDate: null, staleDays: null };
}

// ─── コア判定関数 ────────────────────────────────────────────────────────────

/**
 * analytics_cache エントリの新鮮さを判定する汎用関数。
 *
 * @param cacheUpdatedAt             analytics_cache.updated_at (ISO 8601)。null = バッチ未実行
 * @param latestDependencyUpdatedAt  依存データの最新日 (YYYY-MM-DD)。null = 依存データなし
 *
 * 判定ロジック:
 *   - cacheUpdatedAt が null → unavailable
 *   - cacheUpdatedAt の日付部分 < latestDependencyUpdatedAt → stale
 *   - それ以外 → fresh
 */
export function getAnalyticsAvailability(
  cacheUpdatedAt: string | null,
  latestDependencyUpdatedAt: string | null
): AnalyticsAvailability {
  if (!cacheUpdatedAt) {
    return unavailableAvailability();
  }

  const lastUpdatedDate = cacheUpdatedAt.slice(0, 10); // "YYYY-MM-DD" (表示用)

  if (!latestDependencyUpdatedAt) {
    return { status: "fresh", lastUpdatedDate, staleDays: null };
  }

  // タイムスタンプ全体で比較することで、同日中の intraday 修正（バッチ実行後・同日中の過去日編集）も検知できる。
  // YYYY-MM-DD 文字列を渡した場合は UTC 0:00 として解釈される (new Date("YYYY-MM-DD"))。
  const cacheTs = new Date(cacheUpdatedAt).getTime();
  const latestTs = new Date(latestDependencyUpdatedAt).getTime();

  if (cacheTs >= latestTs) {
    return { status: "fresh", lastUpdatedDate, staleDays: null };
  }

  // staleDays は表示用のため日付粒度で計算する（分単位の差分は不要）
  const staleDays = daysBetween(lastUpdatedDate, latestDependencyUpdatedAt.slice(0, 10)) ?? 1;
  return { status: "stale", lastUpdatedDate, staleDays };
}

// ─── 用途別ラッパー ──────────────────────────────────────────────────────────

/**
 * enriched_logs キャッシュの新鮮さを判定する。
 * 依存: rawLogs の MAX(updated_at) の日付部分 (YYYY-MM-DD)
 *
 * latestRawLogDate ではなく MAX(updated_at) を使うことで、
 * 過去日の行を編集した場合でも stale を正しく検知できる。
 */
export function getEnrichedLogsAvailability(
  cacheUpdatedAt: string | null,
  latestRawLogDate: string | null
): AnalyticsAvailability {
  return getAnalyticsAvailability(cacheUpdatedAt, latestRawLogDate);
}

/**
 * xgboost_importance キャッシュの新鮮さを判定する。
 * 依存: rawLogs の MAX(updated_at) の日付部分 (YYYY-MM-DD)
 *
 * latestRawLogDate ではなく MAX(updated_at) を使うことで、
 * 過去日の行を編集した場合でも stale を正しく検知できる。
 */
export function getXgboostAvailability(
  cacheUpdatedAt: string | null,
  latestRawLogDate: string | null
): AnalyticsAvailability {
  return getAnalyticsAvailability(cacheUpdatedAt, latestRawLogDate);
}
