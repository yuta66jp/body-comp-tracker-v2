/**
 * calendarUtils — 月間カレンダー表示用データ変換
 *
 * DailyLog[] を YYYY-MM-DD キーの Map に変換し、各日のカレンダーセル描画に必要な
 * 情報（体重差分・カロリー差分・特殊日タグ・コンディション）を導出する。
 *
 * 差分計算ルール:
 *   体重差分: ログ日付昇順で並べたとき、直前に体重記録があるエントリとの差分。
 *             欠損日をまたぐ（例: 月曜→木曜）場合も直前ログとの差分を返す。
 *   カロリー差分: 同じく直前にカロリー記録があるエントリとの差分。
 */

import type { DashboardDailyLog } from "@/lib/supabase/types";
import type { SleepSession } from "@/lib/supabase/types";
import { DAY_TAGS, DAY_TAG_LABELS, DAY_TAG_BADGE_COLORS } from "./dayTags";
import { formatConditionSummary, isValidTrainingType, isValidWorkMode, TRAINING_TYPE_LABELS, WORK_MODE_LABELS } from "./trainingType";
import { addDaysStr } from "./date";
import { extractJstHHMM } from "./sleepSession";

// ── 型定義 ──────────────────────────────────────────────────────────────────

export interface CalendarDayTagInfo {
  key: string;
  label: string;
  colorClass: string;
}

/**
 * 1日分のカレンダーセル表示データ。
 * ログが存在する日のみ Map に含まれる（ログなし日は undefined）。
 */
export interface CalendarDayData {
  log: DashboardDailyLog;
  /** 直前体重記録との差分。直前ログがないか、体重 null の場合は null */
  weightDelta: number | null;
  /** 直前カロリー記録との差分。直前ログがないか、calories null の場合は null */
  calDelta: number | null;
  /** 有効な特殊日タグ（true のものだけ） */
  dayTags: CalendarDayTagInfo[];
  /**
   * 便通・トレーニング種別・勤務形態の一行整形テキスト。
   * 後方互換用。新規表示は conditionTags を使う。
   */
  conditionSummary: string | null;
  /**
   * 便通・トレーニング種別・勤務形態を個別タグとして表現したリスト。
   * カレンダーセル内のタグ表示に使用する。
   */
  conditionTags: CalendarDayTagInfo[];
  /**
   * 断食時間（時間単位、小数点1桁）。
   * 表示日 D の断食時間 = 前日 D-1 の last_meal_end_time と 当日 D の sleep_sessions.wake_at の差分。
   * 前日ログなし・前日に last_meal_end_time なし・当日に sleep_sessions なし のいずれかで null。
   */
  fasting_hours: number | null;
  /**
   * 日次の睡眠時間（時間単位）。
   * source of truth: daily_logs.sleep_hours
   * (sleep_sessions の bed_at / wake_at から DB トリガー trg_sync_sleep_hours が自動同期する projection 値)
   * null = 睡眠記録なし。
   */
  sleep_hours: number | null;
}

/**
 * 2つの時刻文字列から断食時間（h）を算出する低レベルユーティリティ。
 *
 * - 両方の時刻が存在する場合のみ計算する。
 * - 日をまたぐ場合（wakeUpTime < lastMealEndTime）は +24h で補正する。
 * - タイムゾーン情報なし・時刻のみを扱う。
 * - 入力は "HH:MM" または "HH:MM:SS" 形式を許容する（PostgreSQL TIME 型は "HH:MM:SS" で返す）。
 *
 * 呼び出し側の責務:
 *   - lastMealEndTime には「前日 D-1 の last_meal_end_time」を渡すこと
 *   - wakeUpTime には「当日 D の sleep_sessions.wake_at を JST 変換した HH:MM」を渡すこと
 *   - 前日ログが存在しない場合は null を渡し、呼び出し側でハンドリングすること
 */
export function calcFastingHours(
  lastMealEndTime: string | null | undefined,
  wakeUpTime: string | null | undefined,
): number | null {
  if (!lastMealEndTime || !wakeUpTime) return null;
  const parseMins = (t: string): number | null => {
    const parts = t.split(":");
    const h = parseInt(parts[0] ?? "");
    const m = parseInt(parts[1] ?? "");
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };
  const lastMins  = parseMins(lastMealEndTime);
  const wakeMins = parseMins(wakeUpTime);
  if (lastMins === null || wakeMins === null) return null;
  let delta = wakeMins - lastMins;
  // delta < 0: 日またぎ（例: 前日 22:30 → 翌朝 07:00）→ +24h で正値に補正
  // delta = 0: 同時刻 → +24h で 1440 になり、次行の >= 1440 判定で null を返す
  if (delta <= 0) delta += 24 * 60;
  if (delta >= 24 * 60) return null; // 24h 以上は異常値（同時刻・delta=0 の場合も含む）として除外
  return Math.round(delta / 60 * 10) / 10; // 小数点1桁
}

// ── コンディションタグ ────────────────────────────────────────────────────────

/** 勤務モード別バッジカラー (off / office / remote の3カテゴリ) */
const WORK_MODE_COLOR: Record<string, string> = {
  off:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  office: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  remote: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
};

/**
 * 便通・training_type・work_mode をタグリストに変換する。
 *
 * - had_bowel_movement: null/undefined は除外。false は「便通なし」タグ。
 * - training_type / work_mode: 有効 enum 値のみ表示。
 */
export function buildConditionTags(params: {
  had_bowel_movement: boolean | null | undefined;
  training_type: string | null | undefined;
  work_mode: string | null | undefined;
}): CalendarDayTagInfo[] {
  const tags: CalendarDayTagInfo[] = [];

  if (params.had_bowel_movement !== null && params.had_bowel_movement !== undefined) {
    tags.push({
      key:        "bowel",
      label:      params.had_bowel_movement ? "便通" : "便通なし",
      colorClass: params.had_bowel_movement
        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
    });
  }

  if (params.training_type != null && isValidTrainingType(params.training_type)) {
    tags.push({
      key:        "training",
      label:      TRAINING_TYPE_LABELS[params.training_type],
      colorClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    });
  }

  if (params.work_mode != null && isValidWorkMode(params.work_mode)) {
    tags.push({
      key:        "work",
      label:      WORK_MODE_LABELS[params.work_mode],
      colorClass: WORK_MODE_COLOR[params.work_mode] ?? "bg-slate-100 text-slate-500",
    });
  }

  return tags;
}

// ── モバイル表示優先度ヘルパー ────────────────────────────────────────────────

/**
 * モバイル表示専用: カレンダーセルに表示するトレーニング部位ラベルを決定する。
 *
 * 優先度ルール（モバイル限定）:
 *   1. 特殊日がある場合: null を返す（dayTags 行で既に表示済み）
 *   2. 特殊日がなく training_type が有効値（off を含む）: 短縮ラベルを返す
 *   3. それ以外（null / 未記録 / 無効値）: null（表示なし）
 *
 * off も表示する（月全体のトレーニング配分を見るために必要）。
 * PC 表示（sm:flex の conditionTags）では引き続き training_type を表示する。
 */
export function getMobileTrainingLabel(
  dayTags: CalendarDayTagInfo[],
  trainingType: string | null | undefined,
): { label: string; colorClass: string } | null {
  // 特殊日がある場合は training_type を表示しない
  if (dayTags.length > 0) return null;
  // null / 無効値は表示しない（off は有効値として表示する）
  if (!trainingType || !isValidTrainingType(trainingType)) return null;
  return {
    label:      TRAINING_TYPE_LABELS[trainingType],
    colorClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  };
}

// ── 主要関数 ──────────────────────────────────────────────────────────────

/**
 * DailyLog[] を YYYY-MM-DD キーの CalendarDayData マップに変換する。
 *
 * - ログが存在しない日は Map に含まれない
 * - 差分は「直前のログ日の記録値」との差分（欠損日を跨ぐ）
 */
export function buildCalendarDayMap(
  logs: DashboardDailyLog[],
  sleepSessions: Pick<SleepSession, "wake_date" | "wake_at">[] = [],
): Map<string, CalendarDayData> {
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));

  // 体重・カロリーそれぞれの「記録ありログ」リスト（差分計算用）
  const withWeight = sorted.filter((d) => d.weight !== null);
  const withCals   = sorted.filter((d) => d.calories !== null);

  // 断食時間算出用: 日付 → ログ の高速参照テーブル
  const logByDate = new Map(sorted.map((l) => [l.log_date, l]));

  // 断食時間算出用: wake_date → wake_at (JST HH:MM) の高速参照テーブル
  const wakeTimeByDate = new Map(
    sleepSessions
      .map((s) => [s.wake_date, extractJstHHMM(s.wake_at)] as [string, string | null])
      .filter((entry): entry is [string, string] => entry[1] !== null)
  );

  const map = new Map<string, CalendarDayData>();

  for (const log of sorted) {
    // 体重差分
    let weightDelta: number | null = null;
    if (log.weight !== null) {
      const idx = withWeight.findIndex((d) => d.log_date === log.log_date);
      if (idx > 0) {
        weightDelta = Math.round((log.weight - withWeight[idx - 1]!.weight!) * 100) / 100;
      }
    }

    // カロリー差分
    let calDelta: number | null = null;
    if (log.calories !== null) {
      const idx = withCals.findIndex((d) => d.log_date === log.log_date);
      if (idx > 0) {
        calDelta = Math.round(log.calories - withCals[idx - 1]!.calories!);
      }
    }

    // 特殊日タグ（true のもののみ）
    const dayTags: CalendarDayTagInfo[] = DAY_TAGS
      .filter((tag) => log[tag])
      .map((tag) => ({
        key:        tag,
        label:      DAY_TAG_LABELS[tag],
        colorClass: DAY_TAG_BADGE_COLORS[tag],
      }));

    // コンディション情報（後方互換用テキスト）
    const conditionSummary = formatConditionSummary({
      had_bowel_movement: log.had_bowel_movement as boolean | null,
      training_type:      log.training_type,
      work_mode:          log.work_mode,
    });

    // コンディション情報（タグ形式）
    const conditionTags = buildConditionTags({
      had_bowel_movement: log.had_bowel_movement as boolean | null,
      training_type:      log.training_type,
      work_mode:          log.work_mode,
    });

    // 断食時間: 前日 D-1 の last_meal_end_time → 当日 D の sleep_sessions.wake_at (JST HH:MM)
    // 前日ログなし・前日 last_meal_end_time なし・当日 sleep_sessions なし → null
    const prevDateKey = addDaysStr(log.log_date, -1);
    const prevDayLog  = prevDateKey ? (logByDate.get(prevDateKey) ?? null) : null;
    const wakeUpTime  = wakeTimeByDate.get(log.log_date) ?? null;
    const fasting_hours = calcFastingHours(prevDayLog?.last_meal_end_time, wakeUpTime);

    map.set(log.log_date, {
      log, weightDelta, calDelta, dayTags, conditionSummary, conditionTags, fasting_hours,
      sleep_hours: log.sleep_hours,
    });
  }

  return map;
}

/**
 * Date オブジェクトを YYYY-MM-DD 文字列に変換する（ローカル日付）。
 *
 * `new Date(dateStr)` は UTC 解釈になるため使用禁止。
 * DayPicker が渡す Date は JS の new Date(year, monthIndex, day) で生成される
 * ローカル日付のため、この関数でローカル年月日を取り出す。
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
