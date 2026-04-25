/**
 * データ品質チェック (DataQualityReport)
 *
 * 直近 7日 / 14日 ウィンドウで以下を算出:
 *   - 体重・カロリーの欠損日数 (ログなし日も含む) → スコアに反映
 *   - 異常値候補 (前日比 ±3kg 超 / カロリー極端値) → スコアに反映
 *   - 必須項目の未記録日数 (表示のみ。スコアに加算しない)
 *     - 最終食事時刻 / 排便の有無 / 勤務情報 / トレーニング情報 / 睡眠セッション
 *   - 同日重複 (DBのPKで通常は防がれるが検出のみ)
 *
 * スコア計算 (0〜100):
 *   100点スタート
 *   - 体重欠損 1日につき -10 点
 *   - カロリー欠損 1日につき -5 点
 *   - 異常値 1件につき -15 点
 *   (下限: 0 点)
 *
 * 必須項目の未記録は missingFields として QualityWindow に含まれるが、スコアには反映しない。
 * 任意項目 (特殊日フラグ / note) は欠損扱いしない。
 */

import type { DailyLog } from "@/lib/supabase/types";
import { toJstDateStr, addDaysStr, dateRangeStr } from "./date";

/**
 * calcDataQuality が実際に参照する列のみを持つ軽量型。
 * fetchDailyLogsForSettings() / fetchDashboardDailyLogs() の戻り値型と対応する。
 *
 * 追加フィールド (必須項目未入力検知に使用):
 *   - last_meal_end_time: null = 未入力 (欠損扱い)
 *   - had_bowel_movement: null = 未記録 / false = 便通なし (記録あり) / true = 便通あり (記録あり)
 *   - work_mode: null = 未入力 (欠損扱い)
 *   - training_type: null = 未入力 (欠損扱い)
 */
export type DataQualityLog = Pick<
  DailyLog,
  | "log_date"
  | "weight"
  | "calories"
  | "last_meal_end_time"
  | "had_bowel_movement"
  | "work_mode"
  | "training_type"
>;

/**
 * 睡眠セッション情報の軽量型。
 * SleepSession の構造的サブタイプ (SleepSession[] をそのまま渡せる)。
 * wake_date をキーとして睡眠の記録有無を判定する。
 */
export type DataQualitySleepEntry = {
  wake_date: string; // YYYY-MM-DD
};

// ---- 閾値定数 ----
/** 前日比でこれを超えたら体重異常値 (kg) */
export const WEIGHT_JUMP_THRESHOLD_KG = 3.0;
/** これを下回ったら低カロリー異常値 (kcal). null は除く */
export const CALORIES_LOW_THRESHOLD = 500;
/** これを超えたら高カロリー異常値 (kcal) */
export const CALORIES_HIGH_THRESHOLD = 8000;

// ---- スコア減点定数 ----
const PENALTY_WEIGHT_MISSING = 10;
const PENALTY_CALORIES_MISSING = 5;
const PENALTY_ANOMALY = 15;
// 必須項目の未記録 (各 -2/日)
// 体重・カロリーより軽微だが、分析・予測の精度に影響するため減点対象とする
const PENALTY_REQUIRED_FIELD_MISSING = 2;

export interface AnomalyEntry {
  date: string;
  type: "weight_jump" | "calories_low" | "calories_high";
  value: number;
  detail: string;
}

/**
 * 必須項目の未記録日数。スコアにも反映される (PENALTY_REQUIRED_FIELD_MISSING = -2/日)。
 *
 * false / 0 / "" は「記録済み」として欠損扱いしない。
 * null のみを「未記録」と判定する。
 * ログ自体が存在しない日はすべての項目が未記録として計上する。
 */
export interface MissingFields {
  /** last_meal_end_time が null の日数 */
  lastMealEndTimeDays: number;
  /**
   * had_bowel_movement が null の日数。
   * false (便通なし) は記録済みのため欠損扱いしない。
   */
  bowelMovementDays: number;
  /** work_mode が null の日数 */
  workModeDays: number;
  /** training_type が null の日数 */
  trainingTypeDays: number;
  /** sleep_sessions に wake_date が記録されていない日数 */
  sleepUnloggedDays: number;
}

export interface QualityWindow {
  /** ウィンドウの暦日数 */
  totalDays: number;
  /** 体重が欠損している日数 (ログなし日も含む) */
  weightMissingDays: number;
  /** カロリーが欠損している日数 (ログなし日も含む) */
  caloriesMissingDays: number;
  /** 異常値候補一覧 */
  anomalies: AnomalyEntry[];
  /** 品質スコア (0〜100) */
  score: number;
  /** 必須項目の未記録日数 (スコア計算に含まれない表示専用の補助情報) */
  missingFields: MissingFields;
}

export interface DataQualityReport {
  period7: QualityWindow;
  period14: QualityWindow;
  /** 同一 log_date が複数存在する場合の日付リスト */
  duplicateDates: string[];
}

/** ウィンドウ内のスコアを計算 */
function calcScore(
  window: Pick<QualityWindow, "weightMissingDays" | "caloriesMissingDays" | "anomalies" | "missingFields">
): number {
  const { missingFields: mf } = window;
  const deductions =
    window.weightMissingDays * PENALTY_WEIGHT_MISSING +
    window.caloriesMissingDays * PENALTY_CALORIES_MISSING +
    window.anomalies.length * PENALTY_ANOMALY +
    (mf.lastMealEndTimeDays + mf.bowelMovementDays + mf.workModeDays + mf.trainingTypeDays + mf.sleepUnloggedDays) *
      PENALTY_REQUIRED_FIELD_MISSING;
  return Math.max(0, 100 - deductions);
}

/** ウィンドウ期間 (dates) の品質を集計 */
function buildWindow(
  dates: string[],
  logByDate: Map<string, DataQualityLog>,
  sortedWithWeight: Array<{ date: string; weight: number }>,
  sleepDateSet: Set<string> | null // null = 睡眠データ未提供 → sleepUnloggedDays は 0 のまま
): QualityWindow {
  const totalDays = dates.length;

  // 欠損カウント (スコアに反映)
  let weightMissingDays = 0;
  let caloriesMissingDays = 0;

  // 必須項目未記録カウント (表示専用)
  let lastMealEndTimeDays = 0;
  let bowelMovementDays = 0;
  let workModeDays = 0;
  let trainingTypeDays = 0;
  let sleepUnloggedDays = 0;

  for (const d of dates) {
    const log = logByDate.get(d);

    // スコア反映: 体重・カロリー
    if (!log || log.weight === null) weightMissingDays++;
    if (!log || log.calories === null) caloriesMissingDays++;

    // 必須項目未記録: ログ自体がなければすべて未記録として計上
    if (!log || log.last_meal_end_time === null) lastMealEndTimeDays++;
    // had_bowel_movement: null = 未記録。false (便通なし) は記録済み扱い
    if (!log || log.had_bowel_movement === null) bowelMovementDays++;
    if (!log || log.work_mode === null) workModeDays++;
    if (!log || log.training_type === null) trainingTypeDays++;

    // 睡眠セッション: sleepDateSet が提供されている場合のみチェック
    // sleepDateSet === null (未提供) のときはスキップ → sleepUnloggedDays = 0 のまま
    if (sleepDateSet !== null && !sleepDateSet.has(d)) sleepUnloggedDays++;
  }

  // 異常値: カロリー極端値
  const anomalies: AnomalyEntry[] = [];
  for (const d of dates) {
    const log = logByDate.get(d);
    if (!log) continue;

    if (log.calories !== null) {
      if (log.calories < CALORIES_LOW_THRESHOLD) {
        anomalies.push({
          date: d,
          type: "calories_low",
          value: log.calories,
          detail: `${log.calories} kcal (閾値: ${CALORIES_LOW_THRESHOLD} kcal 未満)`,
        });
      } else if (log.calories > CALORIES_HIGH_THRESHOLD) {
        anomalies.push({
          date: d,
          type: "calories_high",
          value: log.calories,
          detail: `${log.calories} kcal (閾値: ${CALORIES_HIGH_THRESHOLD} kcal 超)`,
        });
      }
    }
  }

  // 異常値: 前日比体重ジャンプ
  // sortedWithWeight は全期間のデータ (ウィンドウより広い範囲が渡されることを想定)
  const datesSet = new Set(dates);
  for (let i = 1; i < sortedWithWeight.length; i++) {
    const cur = sortedWithWeight[i]!;
    const prev = sortedWithWeight[i - 1]!;
    // 両日がウィンドウ内でなくても、ウィンドウ内の日が cur なら検出する
    if (!datesSet.has(cur.date)) continue;
    const delta = Math.abs(cur.weight - prev.weight);
    if (delta > WEIGHT_JUMP_THRESHOLD_KG) {
      anomalies.push({
        date: cur.date,
        type: "weight_jump",
        value: cur.weight,
        detail: `前日比 ${cur.weight - prev.weight > 0 ? "+" : ""}${(cur.weight - prev.weight).toFixed(1)} kg (${prev.date} ${prev.weight.toFixed(1)} → ${cur.date} ${cur.weight.toFixed(1)})`,
      });
    }
  }

  // 同一日付に複数の異常が重複しないよう date+type でユニーク化
  const seen = new Set<string>();
  const uniqueAnomalies = anomalies.filter((a) => {
    const key = `${a.date}:${a.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const missingFields: MissingFields = {
    lastMealEndTimeDays,
    bowelMovementDays,
    workModeDays,
    trainingTypeDays,
    sleepUnloggedDays,
  };

  const scoreInput = { weightMissingDays, caloriesMissingDays, anomalies: uniqueAnomalies, missingFields };
  return { totalDays, ...scoreInput, score: calcScore(scoreInput) };
}

/**
 * データ品質レポートを生成する。
 *
 * @param logs         daily_logs 全件
 * @param today        基準日 (YYYY-MM-DD JST). 省略時は JST 今日
 * @param sleepSessions sleep_sessions の配列 (wake_date のみ参照)。
 *                     省略時は睡眠セッション未記録チェックをスキップ (全日 sleepUnloggedDays = 0)
 */
export function calcDataQuality(
  logs: DataQualityLog[],
  today?: string,
  sleepSessions?: DataQualitySleepEntry[]
): DataQualityReport {
  const todayStr = today ?? toJstDateStr(new Date());

  // ---- 日付→ログ Map ----
  const logByDate = new Map<string, DataQualityLog>();
  const dateCount = new Map<string, number>();

  for (const log of logs) {
    logByDate.set(log.log_date, log);
    dateCount.set(log.log_date, (dateCount.get(log.log_date) ?? 0) + 1);
  }

  // ---- 重複日付 ----
  const duplicateDates = Array.from(dateCount.entries())
    .filter(([, count]) => count > 1)
    .map(([date]) => date)
    .sort();

  // ---- 体重あり日付を昇順で保持 (ジャンプ検出用) ----
  const sortedWithWeight = [...logs]
    .filter((l) => l.weight !== null)
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
    .map((l) => ({ date: l.log_date, weight: l.weight! }));

  // ---- 睡眠セッションの wake_date セット ----
  // sleepSessions が undefined の場合は null を渡して睡眠チェックをスキップ。
  // 空配列が渡された場合はチェックを行い、全日 sleepUnloggedDays を計上する。
  const sleepDateSet: Set<string> | null =
    sleepSessions !== undefined
      ? new Set<string>(sleepSessions.map((s) => s.wake_date))
      : null;

  // ---- 7日・14日ウィンドウの暦日リスト ----
  // JST 基準で今日を含む直近 N 日を計算する。
  // addDaysStr は parseLocalDateStr 経由で date-only を安全に解釈する。
  const d7Start = addDaysStr(todayStr, -6) ?? todayStr;   // 7日間 (today-6 〜 today)
  const d14Start = addDaysStr(todayStr, -13) ?? todayStr; // 14日間 (today-13 〜 today)

  const dates7 = dateRangeStr(d7Start, todayStr);
  const dates14 = dateRangeStr(d14Start, todayStr);

  const period7 = buildWindow(dates7, logByDate, sortedWithWeight, sleepDateSet);
  const period14 = buildWindow(dates14, logByDate, sortedWithWeight, sleepDateSet);

  return { period7, period14, duplicateDates };
}
