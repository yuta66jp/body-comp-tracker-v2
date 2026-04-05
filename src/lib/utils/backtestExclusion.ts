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
  | "recovery_day"
  // 長期イベントブロック除外ポリシー用 (#480)
  | "long_event_block"    // 連続 LONG_EVENT_THRESHOLD 日以上のイベント区間本体
  | "long_event_recovery"; // ブロック終了後の回復期間

export type ExcludedSource =
  | "daily_logs"   // daily_logs の is_cheat_day / is_travel_day フラグ由来
  | "derived"      // イベント日後の回復日として自動付与
  | "manual";      // --event-periods 引数で手動指定された期間

export type ExcludedDateEntry = {
  date: string;          // "YYYY-MM-DD"
  reason: ExcludedReason;
  source: ExcludedSource;
};

// ── 長期イベントブロック除外ポリシー定数 (#480 初期仮説値) ──────────────────────
// Python の backtest.py の _DEFAULT_LONG_EVENT_THRESHOLD / _DEFAULT_LONG_EVENT_RECOVERY_DAYS と同期すること。

/** 連続イベント日数がこの値以上のブロックを「長期イベントブロック」とみなす。 */
export const LONG_EVENT_THRESHOLD = 5;

/** 長期イベントブロック終了後の回復期間 (日数)。 */
export const LONG_EVENT_RECOVERY_DAYS = 5;

/** 検出された長期イベントブロック。 */
export type LongEventBlock = {
  start: string; // "YYYY-MM-DD"
  end: string;   // "YYYY-MM-DD"
  days: number;  // ブロック長 (start〜end の日数)
};

// ── run.config パース ──────────────────────────────────────────────────────

const DEFAULT_RECOVERY_DAYS = 2;

export type ParsedRunConfig = {
  recoveryDays: number;
  /** reason は #371 で追加された任意フィールド。旧 run には存在しない場合がある。 */
  manualEventPeriods: Array<{ start: string; end: string; reason?: string }>;
  evalPolicies: string[];
  /** #480 で追加。旧 run には存在しない場合がある → LONG_EVENT_THRESHOLD にフォールバック。 */
  longEventThreshold: number;
  /** #480 で追加。旧 run には存在しない場合がある → LONG_EVENT_RECOVERY_DAYS にフォールバック。 */
  longEventRecoveryDays: number;
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
      longEventThreshold: LONG_EVENT_THRESHOLD,
      longEventRecoveryDays: LONG_EVENT_RECOVERY_DAYS,
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
          manualEventPeriods.push({
            start: po["start"],
            end: po["end"],
            ...(typeof po["reason"] === "string" && po["reason"] ? { reason: po["reason"] } : {}),
          });
        }
      }
    }
  }

  const rawPolicies = obj["eval_policies"];
  const evalPolicies: string[] = Array.isArray(rawPolicies)
    ? rawPolicies.filter((p): p is string => typeof p === "string")
    : [];

  const longEventThreshold =
    typeof obj["long_event_threshold"] === "number"
      ? obj["long_event_threshold"]
      : LONG_EVENT_THRESHOLD;

  const longEventRecoveryDays =
    typeof obj["long_event_recovery_days"] === "number"
      ? obj["long_event_recovery_days"]
      : LONG_EVENT_RECOVERY_DAYS;

  return { recoveryDays, manualEventPeriods, evalPolicies, longEventThreshold, longEventRecoveryDays };
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
  manualEventPeriods: Array<{ start: string; end: string; reason?: string }>,
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

// ── 長期イベントブロック: 検出と除外リスト構築 (#480) ─────────────────────────

/**
 * イベント候補日 (is_cheat_day / is_travel_day / manualEventPeriods) から
 * 連続 LONG_EVENT_THRESHOLD 日以上のブロックを検出して返す。
 *
 * Python の build_long_event_exclusion_dates() と同じロジックで
 * ブロック検出を行う。
 */
export function buildLongEventBlocks(
  dailyLogs: Array<{
    log_date: string;
    is_cheat_day: boolean | null;
    is_travel_day: boolean | null;
  }>,
  manualEventPeriods: Array<{ start: string; end: string }>,
  threshold: number = LONG_EVENT_THRESHOLD,
): LongEventBlock[] {
  // イベント候補日を収集
  const eventDays = new Set<string>();
  for (const log of dailyLogs) {
    if (log.is_cheat_day) eventDays.add(log.log_date);
    if (log.is_travel_day) eventDays.add(log.log_date);
  }
  for (const ep of manualEventPeriods) {
    for (const d of dateRange(ep.start, ep.end)) {
      eventDays.add(d);
    }
  }

  if (eventDays.size === 0) return [];

  // 連続ブロックを検出
  const sorted = Array.from(eventDays).sort();
  const blocks: LongEventBlock[] = [];
  let blockStart = sorted[0]!;
  let blockEnd   = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i]!;
    if (d === addDays(blockEnd, 1)) {
      blockEnd = d;
    } else {
      const days = daysCount(blockStart, blockEnd);
      if (days >= threshold) {
        blocks.push({ start: blockStart, end: blockEnd, days });
      }
      blockStart = d;
      blockEnd   = d;
    }
  }
  // 最後のブロック
  const days = daysCount(blockStart, blockEnd);
  if (days >= threshold) {
    blocks.push({ start: blockStart, end: blockEnd, days });
  }

  return blocks;
}

/** start〜end (含む) の日数カウント。 */
function daysCount(start: string, end: string): number {
  const s = start.split("-").map(Number);
  const e = end.split("-").map(Number);
  const ds = new Date(s[0]!, s[1]! - 1, s[2]!);
  const de = new Date(e[0]!, e[1]! - 1, e[2]!);
  return Math.round((de.getTime() - ds.getTime()) / 86400000) + 1;
}

/**
 * 長期イベントブロック除外ポリシー (exclude_long_event_blocks) の除外日リストを構築する。
 *
 * Python の build_long_event_exclusion_dates() と同等のロジック。
 * ブロック本体全日 + ブロック終了後 recoveryDays 日間を除外する。
 */
export function buildLongEventExclusionList(
  dailyLogs: Array<{
    log_date: string;
    is_cheat_day: boolean | null;
    is_travel_day: boolean | null;
  }>,
  manualEventPeriods: Array<{ start: string; end: string; reason?: string }>,
  threshold: number = LONG_EVENT_THRESHOLD,
  recoveryDays: number = LONG_EVENT_RECOVERY_DAYS,
): ExcludedDateEntry[] {
  const blocks = buildLongEventBlocks(dailyLogs, manualEventPeriods, threshold);
  if (blocks.length === 0) return [];

  const map = new Map<string, ExcludedDateEntry>();

  function set(date: string, reason: ExcludedReason, source: ExcludedSource) {
    if (!map.has(date)) {
      map.set(date, { date, reason, source });
    }
  }

  for (const block of blocks) {
    // ブロック本体
    for (const d of dateRange(block.start, block.end)) {
      set(d, "long_event_block", "daily_logs");
    }
    // ブロック終了後の回復期間
    for (let i = 1; i <= recoveryDays; i++) {
      set(addDays(block.end, i), "long_event_recovery", "derived");
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
