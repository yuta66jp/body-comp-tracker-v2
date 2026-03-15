/**
 * データ品質チェック (DataQualityReport)
 *
 * 直近 7日 / 14日 ウィンドウで以下を算出:
 *   - 体重・カロリーの欠損日数 (ログなし日も含む)
 *   - 異常値候補 (前日比 ±3kg 超 / カロリー極端値)
 *   - 同日重複 (DBのPKで通常は防がれるが検出のみ)
 *
 * スコア計算 (0〜100):
 *   100点スタート
 *   - 体重欠損 1日につき -10 点
 *   - カロリー欠損 1日につき -5 点
 *   - 異常値 1件につき -15 点
 *   (下限: 0 点)
 */

import type { DailyLog } from "@/lib/supabase/types";
import { toJstDateStr, addDaysStr, dateRangeStr } from "./date";

/**
 * calcDataQuality が実際に参照する列のみを持つ軽量型。
 * fetchDailyLogsForSettings() の戻り値型と対応する。
 * DailyLog はこの型のスーパータイプなので、DailyLog[] を渡してもエラーにならない。
 */
export type DataQualityLog = Pick<DailyLog, "log_date" | "weight" | "calories">;

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

export interface AnomalyEntry {
  date: string;
  type: "weight_jump" | "calories_low" | "calories_high";
  value: number;
  detail: string;
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
}

export interface DataQualityReport {
  period7: QualityWindow;
  period14: QualityWindow;
  /** 同一 log_date が複数存在する場合の日付リスト */
  duplicateDates: string[];
}

/** ウィンドウ内のスコアを計算 */
function calcScore(window: Omit<QualityWindow, "score">): number {
  const deductions =
    window.weightMissingDays * PENALTY_WEIGHT_MISSING +
    window.caloriesMissingDays * PENALTY_CALORIES_MISSING +
    window.anomalies.length * PENALTY_ANOMALY;
  return Math.max(0, 100 - deductions);
}

/** ウィンドウ期間 (dates) の品質を集計 */
function buildWindow(
  dates: string[],
  logByDate: Map<string, DataQualityLog>,
  sortedWithWeight: Array<{ date: string; weight: number }>
): QualityWindow {
  const totalDays = dates.length;

  // 欠損カウント
  let weightMissingDays = 0;
  let caloriesMissingDays = 0;
  for (const d of dates) {
    const log = logByDate.get(d);
    if (!log || log.weight === null) weightMissingDays++;
    if (!log || log.calories === null) caloriesMissingDays++;
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
    const cur = sortedWithWeight[i];
    const prev = sortedWithWeight[i - 1];
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

  const windowPartial = { totalDays, weightMissingDays, caloriesMissingDays, anomalies: uniqueAnomalies };
  return { ...windowPartial, score: calcScore(windowPartial) };
}

/**
 * データ品質レポートを生成する。
 *
 * @param logs  daily_logs 全件
 * @param today 基準日 (YYYY-MM-DD JST). 省略時は JST 今日
 */
export function calcDataQuality(
  logs: DataQualityLog[],
  today?: string
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

  // ---- 7日・14日ウィンドウの暦日リスト ----
  // addDaysStr は parseLocalDateStr 経由で date-only を安全に解釈する
  const d7Start = addDaysStr(todayStr, -6) ?? todayStr;   // 7日間
  const d14Start = addDaysStr(todayStr, -13) ?? todayStr; // 14日間

  const dates7 = dateRangeStr(d7Start, todayStr);
  const dates14 = dateRangeStr(d14Start, todayStr);

  const period7 = buildWindow(dates7, logByDate, sortedWithWeight);
  const period14 = buildWindow(dates14, logByDate, sortedWithWeight);

  return { period7, period14, duplicateDates };
}

