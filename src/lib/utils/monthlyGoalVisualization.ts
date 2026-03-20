/**
 * monthlyGoalVisualization.ts
 *
 * ForecastChart / 月別サマリー向けのデータ整形 selector / adapter。
 * UI 側での月次計画ロジック再実装を避けるための canonical interface として設計する。
 *
 * #101 の MonthlyGoalPlan を入力として受け取り、表示用データに変換する純粋関数群。
 * 計算ロジックは buildMonthlyGoalPlan (#101) に委譲し、ここでは整形のみ行う。
 */

import type { MonthlyGoalEntry, MonthlyGoalPlan } from "@/lib/utils/monthlyGoalPlan";

// ─── 比較表示用定数 ────────────────────────────────────────────────────────────

/**
 * 月次計画の進捗判定閾値 (kg)。
 * 差分の絶対値がこの値以内なら「計画内」とみなす。
 * 月レベルの計画管理として 0.2 kg を許容範囲に設定。
 */
export const PLAN_GAP_THRESHOLD_KG = 0.2;

// ─── 入力型 ──────────────────────────────────────────────────────────────────

/** buildMonthlyGoalSummaryRows が必要とする最小限の log フィールド */
type LogForSummary = {
  log_date: string;
  weight: number | null;
};

// ─── 型定義 ──────────────────────────────────────────────────────────────────

/**
 * 月別サマリー表 1 行分のデータ。
 *
 * - monthEndTarget    : #101 plan entry の targetWeight (月末目標)
 * - monthStartWeight  : 前月末実績優先、なければ当月最初の実測値
 * - actualMonthEndWeight:
 *     過去月 = 月内最終 log 体重
 *     当月   = 直近実測値 (isPartialActual = true)
 *     未来月 = null
 * - diffKg            : 過去月の完全実績のみ算出 (isPartialActual / isFutureMonth は null)
 * - nextRequiredDeltaKg: 次月エントリーの requiredDeltaKg (最終月は null)
 */
export interface MonthlyGoalSummaryRow {
  /** "YYYY-MM" */
  month: string;
  /** 月末目標体重 (kg) — buildMonthlyGoalPlan entry.targetWeight */
  monthEndTarget: number;
  /**
   * 月初体重 (kg)。
   * 前月末実績がある場合はそれを優先し、なければ当月最初の実測値を使う。
   * どちらもなければ null。
   */
  monthStartWeight: number | null;
  /**
   * 実績月末体重 (kg)。
   * - 過去月: その月の最終 log の weight (記録なしなら null)
   * - 当月: 直近実測値 (isPartialActual = true)
   * - 未来月: null
   */
  actualMonthEndWeight: number | null;
  /** true = 今月 */
  isCurrentMonth: boolean;
  /** true = 今月より未来 */
  isFutureMonth: boolean;
  /**
   * true = 当月で月末未到達。
   * actualMonthEndWeight は「直近実測値」であり「月末実績」ではない。
   */
  isPartialActual: boolean;
  /**
   * 差分 = actualMonthEndWeight - monthEndTarget (0.01 kg 丸め)。
   * isPartialActual / isFutureMonth / actualMonthEndWeight が null なら null。
   */
  diffKg: number | null;
  /**
   * 翌月の requiredDeltaKg (次月エントリーの値)。
   * 最終月または次月エントリーが存在しない場合は null。
   */
  nextRequiredDeltaKg: number | null;
}

// ─── 型定義 (比較表示) ────────────────────────────────────────────────────────

/**
 * 月次計画の進捗状態。
 * - "ahead"    : 計画より先行 (Cut: 体重が目標より軽い / Bulk: 目標より重い)
 * - "on_track" : 計画内 (±PLAN_GAP_THRESHOLD_KG 以内)
 * - "behind"   : 計画より遅れ
 * - "pending"  : 未確定 (当月 partial / 未来月 / データなし)
 */
export type MonthlyPlanProgressState =
  | "ahead"
  | "on_track"
  | "behind"
  | "pending";

/**
 * 月次計画 vs 実績の比較行。
 * MonthlyGoalSummaryRow を extends し、状態・累積ズレを追加する。
 */
export interface MonthlyGoalComparisonRow extends MonthlyGoalSummaryRow {
  /**
   * 月ごとの進捗状態。
   * diffKg = null / isPartialActual / isFutureMonth の場合は "pending"。
   */
  progressState: MonthlyPlanProgressState;
  /**
   * 過去完全実績月の diffKg の累積合計 (0.01 kg 丸め)。
   * - 過去完全実績月かつ diffKg が non-null: 累積合計を返す
   * - 過去完全実績月かつ diffKg が null (データなし): null を返す (累積に加算しない)
   * - 当月 partial / 未来月: null
   */
  cumulativeGapKg: number | null;
}

// ─── プライベートヘルパー ─────────────────────────────────────────────────────

/** "YYYY-MM" 形式の前月を返す */
function getPrevMonth(month: string): string {
  const year = parseInt(month.slice(0, 4), 10);
  const mon  = parseInt(month.slice(5, 7), 10);
  if (mon === 1) return `${year - 1}-12`;
  return `${year}-${String(mon - 1).padStart(2, "0")}`;
}

/** weight !== null の最後の log の weight を返す (log_date 降順) */
function lastWeight(logs: LogForSummary[]): number | null {
  const sorted = [...logs]
    .filter((l) => l.weight !== null)
    .sort((a, b) => b.log_date.localeCompare(a.log_date));
  return sorted[0]?.weight ?? null;
}

/** weight !== null の最初の log の weight を返す (log_date 昇順) */
function firstWeight(logs: LogForSummary[]): number | null {
  const sorted = [...logs]
    .filter((l) => l.weight !== null)
    .sort((a, b) => a.log_date.localeCompare(b.log_date));
  return sorted[0]?.weight ?? null;
}

// ─── メイン関数 ──────────────────────────────────────────────────────────────

/**
 * buildMonthlyGoalDateMap
 *
 * ForecastChart 向け selector。
 * 各日付を「その日が属する月の月末目標体重」にマップする。
 *
 * - allDates の各要素について、その日が属する月のエントリーが存在する場合のみ値を返す
 * - plan に含まれない過去月はマップに含まれない → chart で step line が過去に伸びない
 * - 同一月内の全日付が同じ値を持つ → 月内はフラット、月境界でステップ変化
 *
 * @param entries - buildMonthlyGoalPlan の entries (MonthlyGoalEntry[])
 * @param allDates - chart の表示対象日付リスト (YYYY-MM-DD)
 */
export function buildMonthlyGoalDateMap(
  entries: MonthlyGoalEntry[],
  allDates: string[]
): Map<string, number> {
  const entryMap = new Map(entries.map((e) => [e.month, e.targetWeight]));
  const result   = new Map<string, number>();
  for (const date of allDates) {
    const month  = date.slice(0, 7);
    const target = entryMap.get(month);
    if (target !== undefined) result.set(date, target);
  }
  return result;
}

/**
 * buildMonthlyGoalSummaryRows
 *
 * 月別サマリー表向け selector。
 * #101 の MonthlyGoalPlan と daily_logs を結合し、計画 vs 実績の比較データを生成する。
 *
 * - plan.entries の月順 (currentMonth 〜 deadlineMonth) に 1 行ずつ生成する
 * - 月初体重: 前月末実績優先、なければ当月最初の実測値
 * - 実績月末体重: 当月は直近値 (isPartialActual=true)、未来月は null
 * - 差分: 過去の完全実績月のみ算出 (isPartialActual / isFutureMonth は null を返す)
 * - plan が無効または entries が空の場合は空配列を返す (クラッシュしない)
 *
 * @param plan   - buildMonthlyGoalPlan の戻り値
 * @param logs   - daily_logs (log_date / weight のみ使用)
 * @param today  - 今日の JST 日付 (toJstDateStr() の値)
 */
export function buildMonthlyGoalSummaryRows(
  plan: MonthlyGoalPlan,
  logs: LogForSummary[],
  today: string
): MonthlyGoalSummaryRow[] {
  if (!plan.isValid || plan.entries.length === 0) return [];

  const todayMonth = today.slice(0, 7);

  // 月ごとに logs をグループ化
  const logsByMonth = new Map<string, LogForSummary[]>();
  for (const log of logs) {
    const month = log.log_date.slice(0, 7);
    if (!logsByMonth.has(month)) logsByMonth.set(month, []);
    logsByMonth.get(month)!.push(log);
  }

  return plan.entries.map((entry, i) => {
    const { month, targetWeight } = entry;
    const prevMonth      = getPrevMonth(month);
    const prevMonthLogs  = logsByMonth.get(prevMonth) ?? [];
    const thisMonthLogs  = logsByMonth.get(month)     ?? [];

    const isFutureMonth  = month > todayMonth;
    const isCurrentMonth = month === todayMonth;

    // 月初体重: 前月末実績優先、なければ当月最初の実測値
    const monthStartWeight =
      lastWeight(prevMonthLogs) ?? firstWeight(thisMonthLogs);

    // 実績月末体重
    let actualMonthEndWeight: number | null = null;
    let isPartialActual = false;
    if (isFutureMonth) {
      actualMonthEndWeight = null;
      isPartialActual      = false;
    } else if (isCurrentMonth) {
      actualMonthEndWeight = lastWeight(thisMonthLogs); // 直近実測値 (月末ではない)
      isPartialActual      = true;
    } else {
      actualMonthEndWeight = lastWeight(thisMonthLogs); // 過去月: 最終実測値
      isPartialActual      = false;
    }

    // 差分: 過去月の完全実績のみ算出
    const diffKg =
      !isPartialActual && !isFutureMonth && actualMonthEndWeight !== null
        ? Math.round((actualMonthEndWeight - targetWeight) * 100) / 100
        : null;

    // 翌月必要変化量
    const nextEntry            = plan.entries[i + 1];
    const nextRequiredDeltaKg  = nextEntry?.requiredDeltaKg ?? null;

    return {
      month,
      monthEndTarget: targetWeight,
      monthStartWeight,
      actualMonthEndWeight,
      isCurrentMonth,
      isFutureMonth,
      isPartialActual,
      diffKg,
      nextRequiredDeltaKg,
    };
  });
}

// ─── 比較表示 adapter ─────────────────────────────────────────────────────────

/**
 * classifyMonthlyPlanGap
 *
 * diffKg から月ごとの進捗状態を分類する純粋関数。
 *
 * - diffKg = null / isPartialActual / isFutureMonth → "pending"
 * - |diffKg| <= PLAN_GAP_THRESHOLD_KG → "on_track"
 * - Cut:  diffKg < 0 → "ahead" (目標より軽い), diffKg > 0 → "behind"
 * - Bulk: diffKg > 0 → "ahead" (目標より重い), diffKg < 0 → "behind"
 */
export function classifyMonthlyPlanGap(
  diffKg: number | null,
  isCut: boolean,
  isPartialActual: boolean,
  isFutureMonth: boolean
): MonthlyPlanProgressState {
  if (isPartialActual || isFutureMonth || diffKg === null) return "pending";
  if (Math.abs(diffKg) <= PLAN_GAP_THRESHOLD_KG) return "on_track";
  const isAhead = isCut ? diffKg < 0 : diffKg > 0;
  return isAhead ? "ahead" : "behind";
}

/**
 * buildMonthlyGoalComparisonRows
 *
 * MonthlyGoalSummaryRow[] に progressState と cumulativeGapKg を付与する adapter。
 * UI 側でロジックを散らさないための selector 層。
 *
 * - progressState: Cut/Bulk を考慮した月ごとの状態分類
 * - cumulativeGapKg: 過去完全実績月の diffKg の累積合計
 *   - データなし月 (diffKg=null) は累積に加算しない。その月は null を返す。
 *   - 当月 partial / 未来月は null
 *
 * @param rows  - buildMonthlyGoalSummaryRows の戻り値
 * @param phase - "Cut" | "Bulk"
 */
export function buildMonthlyGoalComparisonRows(
  rows: MonthlyGoalSummaryRow[],
  phase: string
): MonthlyGoalComparisonRow[] {
  const isCut = phase !== "Bulk";
  let runningSum = 0;

  return rows.map((row) => {
    const progressState = classifyMonthlyPlanGap(
      row.diffKg,
      isCut,
      row.isPartialActual,
      row.isFutureMonth
    );

    let cumulativeGapKg: number | null = null;
    if (!row.isPartialActual && !row.isFutureMonth) {
      if (row.diffKg !== null) {
        runningSum += row.diffKg;
        cumulativeGapKg = Math.round(runningSum * 100) / 100;
      }
      // diffKg === null: データなし。runningSum は変えず、null を返す。
    }
    // 当月 partial / 未来月: null のまま

    return { ...row, progressState, cumulativeGapKg };
  });
}
