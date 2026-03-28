/**
 * backtestExclusion.ts — バックテスト除外日一覧の再導出ユーティリティ
 *
 * Python の backtest.py `build_exclusion_dates()` を TypeScript に移植したもの。
 * forecast_backtest_runs.config と daily_logs のフラグから除外日一覧を再構築する。
 *
 * 除外日は DB に保存されていないため、フロント側で再導出する方式を採用している。
 * Python 側のロジックと一致を保つこと。
 *
 * 優先度 (同日が複数理由に該当する場合):
 *   cheat_day > travel_day > manual_event_period > recovery_day
 */

import type { Json } from "@/lib/supabase/types";

// ── 型定義 ──────────────────────────────────────────────────────────────────

export type ExcludedReason =
  | "cheat_day"
  | "travel_day"
  | "manual_event_period"
  | "recovery_day";

export type ExcludedSource =
  | "daily_logs"   // daily_logs の is_cheat_day / is_travel_day フラグ由来
  | "derived"      // イベント日後の回復日として自動付与
  | "manual";      // --event-periods 引数で手動指定された期間

export type ExcludedDateEntry = {
  date: string;          // "YYYY-MM-DD"
  reason: ExcludedReason;
  source: ExcludedSource;
};

// ── run.config パース ──────────────────────────────────────────────────────

const DEFAULT_RECOVERY_DAYS = 2;

export type ParsedRunConfig = {
  recoveryDays: number;
  manualEventPeriods: Array<{ start: string; end: string }>;
  evalPolicies: string[];
};

/**
 * forecast_backtest_runs.config から除外日計算に必要なフィールドを安全に取り出す。
 * フィールド不在や型不整合は graceful fallback する。
 */
export function parseRunConfig(config: Json): ParsedRunConfig {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return {
      recoveryDays: DEFAULT_RECOVERY_DAYS,
      manualEventPeriods: [],
      evalPolicies: [],
    };
  }
  const obj = config as Record<string, Json>;

  const recoveryDays =
    typeof obj["recovery_days"] === "number"
      ? obj["recovery_days"]
      : DEFAULT_RECOVERY_DAYS;

  const manualEventPeriods: Array<{ start: string; end: string }> = [];
  const rawPeriods = obj["manual_event_periods"];
  if (Array.isArray(rawPeriods)) {
    for (const p of rawPeriods) {
      if (p !== null && typeof p === "object" && !Array.isArray(p)) {
        const po = p as Record<string, Json>;
        if (typeof po["start"] === "string" && typeof po["end"] === "string") {
          manualEventPeriods.push({ start: po["start"], end: po["end"] });
        }
      }
    }
  }

  const rawPolicies = obj["eval_policies"];
  const evalPolicies: string[] = Array.isArray(rawPolicies)
    ? rawPolicies.filter((p): p is string => typeof p === "string")
    : [];

  return { recoveryDays, manualEventPeriods, evalPolicies };
}

// ── 日付計算ヘルパー ──────────────────────────────────────────────────────

/** YYYY-MM-DD 文字列に n 日加算した文字列を返す。タイムゾーン非依存。 */
function addDays(dateStr: string, n: number): string {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 2000;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(y, m - 1, d + n);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** start から end（含む）まで 1 日刻みで日付文字列を yield する。 */
function* dateRange(start: string, end: string): Generator<string> {
  let cur = start;
  while (cur <= end) {
    yield cur;
    cur = addDays(cur, 1);
  }
}

// ── メイン関数 ────────────────────────────────────────────────────────────

const REASON_PRIORITY: ExcludedReason[] = [
  "cheat_day",
  "travel_day",
  "manual_event_period",
  "recovery_day",
];

/**
 * Python の build_exclusion_dates() と同等のロジックで除外日一覧を構築する。
 *
 * 除外対象:
 *   1. is_cheat_day=true の日 + 後続 recoveryDays 日間
 *   2. is_travel_day=true の日 + 後続 recoveryDays 日間
 *   3. manualEventPeriods の各期間 + end 後 recoveryDays 日間
 *
 * 同日が複数の理由に該当する場合は REASON_PRIORITY の昇順（優先度高）で記録する。
 */
export function buildExclusionList(
  dailyLogs: Array<{
    log_date: string;
    is_cheat_day: boolean | null;
    is_travel_day: boolean | null;
  }>,
  recoveryDays: number,
  manualEventPeriods: Array<{ start: string; end: string }>,
): ExcludedDateEntry[] {
  const map = new Map<string, ExcludedDateEntry>();

  function set(date: string, reason: ExcludedReason, source: ExcludedSource) {
    const existing = map.get(date);
    if (
      !existing ||
      REASON_PRIORITY.indexOf(reason) < REASON_PRIORITY.indexOf(existing.reason)
    ) {
      map.set(date, { date, reason, source });
    }
  }

  function addWithRecovery(
    eventDate: string,
    eventReason: Exclude<ExcludedReason, "recovery_day">,
    eventSource: ExcludedSource,
  ) {
    set(eventDate, eventReason, eventSource);
    for (let i = 1; i <= recoveryDays; i++) {
      set(addDays(eventDate, i), "recovery_day", "derived");
    }
  }

  // 1. is_cheat_day 由来
  for (const log of dailyLogs) {
    if (log.is_cheat_day) {
      addWithRecovery(log.log_date, "cheat_day", "daily_logs");
    }
  }

  // 2. is_travel_day 由来
  for (const log of dailyLogs) {
    if (log.is_travel_day) {
      addWithRecovery(log.log_date, "travel_day", "daily_logs");
    }
  }

  // 3. 手動 event period 由来
  for (const ep of manualEventPeriods) {
    for (const d of dateRange(ep.start, ep.end)) {
      set(d, "manual_event_period", "manual");
    }
    for (let i = 1; i <= recoveryDays; i++) {
      set(addDays(ep.end, i), "recovery_day", "derived");
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
