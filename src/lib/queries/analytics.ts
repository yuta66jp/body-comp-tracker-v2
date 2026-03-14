/**
 * analytics_cache テーブルの read 責務と stale / unavailable 判定を集約する。
 *
 * - fetchEnrichedLogs()    : enriched_logs キャッシュ取得 + 新鮮さ判定
 * - fetchFactorAnalysis()  : xgboost_importance キャッシュ取得 + 新鮮さ判定
 *
 * stale / unavailable / error 判定はここに寄せ、呼び出し側が判定ロジックを
 * インラインで持たないようにする。
 *
 * AnalyticsStatus / AnalyticsAvailability は src/lib/analytics/status.ts の定義を再利用する。
 * UI 固有の表示文言はここに含めない。
 * write 系はここに含めない。
 */
import { createClient } from "@/lib/supabase/server";
import {
  getEnrichedLogsAvailability,
  getXgboostAvailability,
  errorAvailability,
} from "@/lib/analytics/status";
import type { AnalyticsAvailability } from "@/lib/analytics/status";
import type { AnalyticsCache, EnrichedLogPayloadRow } from "@/lib/supabase/types";
import type { FactorEntry, FactorMeta, StabilityEntry } from "@/lib/utils/factorAnalysisUtils";
import { mergeStability } from "@/lib/utils/factorAnalysisUtils";

// ── 戻り値型 ─────────────────────────────────────────────────────────────────

/**
 * enriched_logs フェッチ結果。
 *
 * status:
 *   fresh / stale / unavailable — analytics/status.ts の AnalyticsAvailability に準じる
 *   error                       — Supabase フェッチ失敗
 *
 * rows は status が fresh / stale のときのみ存在する。
 * updatedAt は analytics_cache.updated_at の値（ISO 8601）。
 */
export interface EnrichedLogsResult {
  availability: AnalyticsAvailability;
  rows: EnrichedLogPayloadRow[];
  /** analytics_cache.updated_at。unavailable / error のときは null */
  updatedAt: string | null;
}

/**
 * xgboost_importance フェッチ結果。
 *
 * status は EnrichedLogsResult と同様。
 * payload / meta は status が fresh / stale のときのみ存在する。
 */
export interface FactorAnalysisResult {
  availability: AnalyticsAvailability;
  payload: Record<string, FactorEntry> | null;
  meta: FactorMeta | null;
  /** analytics_cache.updated_at。unavailable / error のときは null */
  updatedAt: string | null;
}

// ── クエリ関数 ────────────────────────────────────────────────────────────────

/**
 * analytics_cache の enriched_logs エントリを取得し、
 * 新鮮さ（fresh / stale / unavailable / error）を判定して返す。
 *
 * @param latestRawLogDate  rawLogs の最新 log_date (YYYY-MM-DD)。stale 判定に使用する。
 *                          null を渡した場合は cacheUpdatedAt のみで判定する。
 */
export async function fetchEnrichedLogs(
  latestRawLogDate: string | null
): Promise<EnrichedLogsResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("analytics_cache")
    .select("payload, updated_at")
    .eq("metric_type", "enriched_logs")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // 行なし = バッチ未実行
      return {
        availability: getEnrichedLogsAvailability(null, latestRawLogDate),
        rows: [],
        updatedAt: null,
      };
    }
    return {
      availability: errorAvailability(),
      rows: [],
      updatedAt: null,
    };
  }

  if (!data) {
    return {
      availability: getEnrichedLogsAvailability(null, latestRawLogDate),
      rows: [],
      updatedAt: null,
    };
  }

  const row = data as Pick<AnalyticsCache, "payload" | "updated_at">;
  const updatedAt = row.updated_at;
  return {
    availability: getEnrichedLogsAvailability(updatedAt, latestRawLogDate),
    rows: row.payload as unknown as EnrichedLogPayloadRow[],
    updatedAt,
  };
}

/**
 * analytics_cache の xgboost_importance エントリを取得し、
 * 新鮮さ（fresh / stale / unavailable / error）を判定して返す。
 *
 * @param latestRawLogDate  rawLogs の最新 log_date (YYYY-MM-DD)。stale 判定に使用する。
 *                          null を渡した場合は cacheUpdatedAt のみで判定する。
 */
export async function fetchFactorAnalysis(
  latestRawLogDate: string | null
): Promise<FactorAnalysisResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("analytics_cache")
    .select("payload, updated_at")
    .eq("metric_type", "xgboost_importance")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return {
        availability: getXgboostAvailability(null, latestRawLogDate),
        payload: null,
        meta: null,
        updatedAt: null,
      };
    }
    return {
      availability: errorAvailability(),
      payload: null,
      meta: null,
      updatedAt: null,
    };
  }

  if (!data) {
    return {
      availability: getXgboostAvailability(null, latestRawLogDate),
      payload: null,
      meta: null,
      updatedAt: null,
    };
  }

  const row = data as Pick<AnalyticsCache, "payload" | "updated_at">;
  const updatedAt = row.updated_at;
  const rawPayload = row.payload as Record<string, unknown>;

  // _meta / _stability を分離して残りを FactorEntry として扱う
  const { _meta, _stability, ...entries } = rawPayload;
  const stabilityMap = (_stability ?? null) as Record<string, StabilityEntry> | null;
  const mergedEntries = mergeStability(entries as Record<string, FactorEntry>, stabilityMap);

  return {
    availability: getXgboostAvailability(updatedAt, latestRawLogDate),
    payload: mergedEntries,
    meta: (_meta ?? null) as FactorMeta | null,
    updatedAt,
  };
}
