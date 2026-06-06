/**
 * 週次レビュー集計 + 停滞検知 (calcWeeklyReview)
 *
 * 設計方針:
 *   - Phase 1 の ReadinessMetrics / DataQualityReport を受け取って二重計算を避ける
 *   - 暦日ベース集計 (sorted.slice(-7) ではなく todayStr-6 〜 today)
 *   - 停滞検知は 14日線形回帰 (trendKgPerWeek) を主軸とし、
 *     7日平均前週比 (weight_change_7d) を補助に使う
 *   - 単日体重ノイズ (水分・食事重量) は 7日平均でキャンセルされる前提
 *   - 断定を避け「停滞疑い / 要観察 / 順調」の 3段階 + データ不足 で表現
 *
 * Cheat/Refeed タグが追加された場合の拡張ポイント:
 *   - calcStagnation の引数に cheatDays?: string[] を追加
 *   - cheat/refeed 日を除いた体重ウィンドウで再計算し、通常トレンドを補正
 *   - generateFindings で「チートデイ後の水分増加の可能性」を注記
 */

import type { DashboardDailyLog } from "@/lib/supabase/types";
import type { GoogleHealthDailyMetricForDisplay } from "@/lib/googleHealth/displayMetrics";
import type { ReadinessMetrics } from "./calcReadiness";
import type { DataQualityReport } from "./calcDataQuality";
import { addDaysStr, dateRangeStr, toJstDateStr } from "./date";
import { DAY_TAG_LABELS } from "./dayTags";
import {
  WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE,
  WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE,
} from "./weeklyNutritionRanges";

// ─── 公開型 ─────────────────────────────────────────────────────────────────

/**
 * 停滞レベル。
 * - advancing       : 適切なペースで進んでいる (|trend| ≥ 0.2 kg/週 かつ正方向)
 * - watching        : 方向は正しいが緩め (0.1〜0.2 kg/週)
 * - suspected       : ほぼ横ばい (<0.1) または逆方向 (≥0.1)
 * - data_insufficient: trendKgPerWeek が null (データ不足)
 */
export type StagnationLevel =
  | "advancing"
  | "watching"
  | "suspected"
  | "data_insufficient";

export interface StagnationResult {
  level: StagnationLevel;
  /** 7日移動平均の前週比 (kg). ReadinessMetrics.weight_change_7d */
  weightChange7d: number | null;
  /** 14日線形回帰 slope × 7 (kg/週). ReadinessMetrics.weekly_rate_kg */
  trendKgPerWeek: number | null;
  /**
   * 判断の確度に影響する補足テキスト。
   * null = 特記事項なし。
   * 例: "データに欠損あり" / "直近に体重の急変あり"
   */
  qualityNote: string | null;
}

export interface WeeklyNutrition {
  avgCalories: number | null;
  avgProtein: number | null;
  avgFat: number | null;
  avgCarbs: number | null;
  /** calories が非 null の日数 */
  daysLogged: number;
  /** タンパク質エネルギー比 (%) = avgProtein × 4 / avgCalories × 100 */
  proteinRatioPct: number | null;
  /** タンパク質摂取量 (g/kg BW) = avgProtein / avgWeight */
  proteinGPerKgBw: number | null;
  /** 脂質カロリー比 (%) = avgFat × 9 / avgCalories × 100 */
  fatCaloriesRatioPct: number | null;
}

export interface WeeklyWeight {
  /** 直近 7 暦日の体重平均 (kg) */
  avg: number | null;
  /** 前 7 日 (7〜13 日前) の体重平均 (kg) */
  prevAvg: number | null;
  /** 週平均体重の変化: avg − prevAvg (kg) */
  change: number | null;
  /** 14 日線形回帰 slope × 7 (kg/週) */
  trendKgPerWeek: number | null;
  /**
   * 14 日トレンドを体重比で表した週あたり変化率 (%BW/週)。
   * = -(trendKgPerWeek / avg) × 100
   * 正 = 減量方向 / 負 = 増加方向 / null = avg または trend が null
   *
   * Cut フェーズの推奨レンジは 0.5〜1.0%BW/週 (Helms 2014)。
   */
  bwRatePctPerWeek: number | null;
}

export interface WeeklyTdee {
  /**
   * 推定 TDEE の基準値 (kcal)。
   * canonical は enrich.py の avg_tdee_14d（14日ローリング平均）最終値。
   * 日次ノイズに強い基準線を判断 KPI に使う。
   */
  avgEstimated: number | null;
  /** 摂取 - 基準 TDEE = エネルギーバランス (kcal/日). 負 = 赤字 */
  balancePerDay: number | null;
}

export interface WeeklySleep {
  /**
   * 直近 7 暦日のうち Google Health sleep_minutes が記録されている日の平均 (h)。
   */
  avgSleepHours: number | null;
  /** sleep_minutes が非 null の日数 */
  sleepDaysLogged: number;
  /**
   * 直近 7 暦日の平均就寝時刻 "HH:MM" (JST)。
   * Google Health sleep_bed_at がない場合は null。
   */
  avgBedTime: string | null;
  /**
   * 直近 7 暦日の平均起床時刻 "HH:MM" (JST)。
   * Google Health sleep_wake_at がない場合は null。
   */
  avgWakeTime: string | null;
  /**
   * 就寝時刻の前週比（分）。正=遅くなった、負=早くなった。
   * 前週データが不足している場合は null。
   */
  avgBedTimeDeltaMins: number | null;
  /**
   * 起床時刻の前週比（分）。正=遅くなった、負=早くなった。
   * 前週データが不足している場合は null。
   */
  avgWakeTimeDeltaMins: number | null;
  /** 直近 7 日のうち bed_at / wake_at がある日数 */
  timeDaysLogged: number;
}

export interface WeeklyCardioMetric {
  /** 直近 7 暦日の平均 */
  avg7d: number | null;
  /** 直近 7 暦日の記録日数 */
  daysLogged7d: number;
  /** 直近 14 暦日の平均 */
  baselineAvg14d: number | null;
  /** 直近 14 暦日の標準偏差。記録が 2 件未満なら null */
  baselineStdDev14d: number | null;
  /** 直近 7 日平均の 14 日平均との差分 (%) */
  deviationPct: number | null;
}

export interface WeeklyCardio {
  hrv: WeeklyCardioMetric;
  rhr: WeeklyCardioMetric;
}

/** 直近 7 日の特殊日集計 */
export interface SpecialDaySummary {
  cheatDays: number;
  refeedDays: number;
  eatingOutDays: number;
  travelDays: number;
  /** いずれかのタグが付いた日数 */
  totalTaggedDays: number;
}

export interface WeeklyReviewData {
  /** 集計期間ラベル。例: "2026-03-04〜2026-03-10" */
  weekLabel: string;
  weight: WeeklyWeight;
  nutrition: WeeklyNutrition;
  tdee: WeeklyTdee;
  sleep: WeeklySleep;
  cardio: WeeklyCardio;
  quality: {
    score: number;
    weightMissingDays: number;
    caloriesMissingDays: number;
  };
  stagnation: StagnationResult;
  specialDays: SpecialDaySummary;
  /** ルールベースの日本語所見 (箇条書き) */
  findings: string[];
}

// ─── 停滞検知 ────────────────────────────────────────────────────────────────

/**
 * 停滞レベルを判定する。
 *
 * 判定の優先順位:
 *   1. trendKgPerWeek が null → data_insufficient
 *   2. phase を考慮した方向チェック + 規模チェック
 *      - 正方向 ≥ 0.2 kg/週 → advancing
 *      - 正方向 0.1〜0.2    → watching
 *      - |trend| < 0.1      → suspected (横ばい)
 *      - 逆方向 ≥ 0.1       → suspected (逆行)
 *   3. qualityNote: 品質スコア低 / 異常値あり の場合に補足テキストを付与
 *
 * 水分ノイズについて:
 *   - trendKgPerWeek は 14 日線形回帰なのでグリコーゲン・水分の単日ノイズが平滑化される
 *   - weight_change_7d も 7 日平均同士の差なので同様
 *   - 真の停滞は「両指標ともほぼゼロ」で現れる
 *
 * Cheat/Refeed タグ拡張ポイント:
 *   - 引数に cheatDays?: string[] を追加し、除外したウィンドウで再計算
 */
export function calcStagnation(
  weightChange7d: number | null,
  trendKgPerWeek: number | null,
  qualityScore: number,
  hasAnomalies: boolean,
  phase?: string
): StagnationResult {
  // データ不足
  if (trendKgPerWeek === null) {
    return {
      level: "data_insufficient",
      weightChange7d,
      trendKgPerWeek,
      qualityNote: "14 日分のデータが不足しています。記録を続けると精度が上がります。",
    };
  }

  const isCut = phase === undefined ? null : phase !== "Bulk";
  const magnitude = Math.abs(trendKgPerWeek);

  // 正しい方向に動いているか
  const movingCorrectly: boolean =
    isCut === null
      ? true // phase 不明: 方向問わず大きさのみ
      : isCut
      ? trendKgPerWeek < 0  // Cut: 体重が減っている
      : trendKgPerWeek > 0; // Bulk: 体重が増えている

  let level: StagnationLevel;

  if (!movingCorrectly && magnitude >= 0.1) {
    // 明らかに逆方向に動いている
    level = "suspected";
  } else if (magnitude < 0.1) {
    // 方向を問わずほぼフラット
    level = "suspected";
  } else if (magnitude < 0.2) {
    // 正方向だが緩い
    level = "watching";
  } else {
    // 正方向 ≥ 0.2 kg/週
    level = "advancing";
  }

  // 補足注記の構成
  const notes: string[] = [];

  if (qualityScore < 70) {
    notes.push("体重記録に欠損があり、判断の確度が低めです");
  }
  if (hasAnomalies) {
    notes.push(
      "直近に体重の急変が検出されており、7日平均が影響を受けている可能性があります"
    );
  }
  // 2 指標が相反する場合の注記
  if (
    level === "advancing" &&
    weightChange7d !== null &&
    Math.abs(weightChange7d) < 0.1
  ) {
    notes.push("7日平均前週比は小さいため、来週も観察してください");
  }

  return {
    level,
    weightChange7d,
    trendKgPerWeek,
    qualityNote: notes.length > 0 ? notes.join("、") : null,
  };
}

// ─── ルールベース所見生成 ────────────────────────────────────────────────────

function fmt0(v: number): string {
  return Math.round(v).toLocaleString();
}

function generateFindings(
  weight: WeeklyWeight,
  nutrition: WeeklyNutrition,
  tdee: WeeklyTdee,
  quality: { score: number; weightMissingDays: number; caloriesMissingDays: number },
  stagnation: StagnationResult,
  specialDays: SpecialDaySummary,
  phase: string
): string[] {
  const findings: string[] = [];
  const isCut = phase !== "Bulk";

  // ── 1. 体重トレンド ──
  if (weight.avg !== null) {
    const avgStr = weight.avg.toFixed(1);
    if (weight.change !== null) {
      const sign = weight.change > 0 ? "+" : "";
      const changeStr = `${sign}${weight.change.toFixed(2)} kg`;
      let dirNote: string;
      if (Math.abs(weight.change) < 0.05) {
        dirNote = "ほぼ横ばい";
      } else if (weight.change < 0) {
        dirNote = isCut ? "順調に減量" : "減少傾向";
      } else {
        dirNote = isCut ? "増加傾向" : "順調に増量";
      }
      findings.push(
        `今週の 7 日平均体重 ${avgStr} kg（前週比 ${changeStr}、${dirNote}）`
      );
    } else {
      findings.push(`今週の 7 日平均体重 ${avgStr} kg（前週比データなし）`);
    }
  } else {
    findings.push("体重データが不足しており、週平均を算出できませんでした");
  }

  // ── 2. カロリーバランス ──
  if (nutrition.avgCalories !== null) {
    const calStr = fmt0(nutrition.avgCalories);
    if (tdee.avgEstimated !== null && tdee.balancePerDay !== null) {
      const tdeeStr = fmt0(tdee.avgEstimated);
      const bal = tdee.balancePerDay;
      const balSign = bal > 0 ? "+" : "";
      let balNote: string;
      if (Math.abs(bal) < 100) {
        balNote = "ほぼ維持カロリーで推移";
      } else if (bal < 0) {
        balNote = isCut
          ? `赤字 ${balSign}${fmt0(bal)} kcal / 日`
          : `赤字 ${balSign}${fmt0(bal)} kcal / 日（Bulk 期は増量が難しい可能性）`;
      } else {
        balNote = isCut
          ? `余剰 +${fmt0(bal)} kcal / 日（摂取量の見直しを検討）`
          : `余剰 +${fmt0(bal)} kcal / 日`;
      }
      findings.push(`摂取 ${calStr} kcal / 推定 TDEE ${tdeeStr} kcal（14日平均）→ ${balNote}`);
    } else {
      findings.push(
        `平均摂取 ${calStr} kcal（TDEE 未推定のためバランス算出不可）`
      );
    }
  } else {
    findings.push("カロリーデータが不足しており、摂取量を算出できませんでした");
  }

  // ── 3. タンパク質 / 脂質 ──
  if (nutrition.avgProtein !== null) {
    const pStr = fmt0(nutrition.avgProtein);
    if (nutrition.proteinGPerKgBw !== null) {
      const gPerKg = nutrition.proteinGPerKgBw.toFixed(2);
      if (
        nutrition.proteinGPerKgBw >= WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE.min &&
        nutrition.proteinGPerKgBw <= WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE.max
      ) {
        findings.push(
          `平均タンパク質 ${pStr} g（${gPerKg} g/kg BW）― 推奨レンジ内`
        );
      } else {
        findings.push(
          nutrition.proteinGPerKgBw < WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE.min
            ? `平均タンパク質 ${pStr} g（${gPerKg} g/kg BW）― やや低め（目安: 1.8〜2.7 g/kg BW）`
            : `平均タンパク質 ${pStr} g（${gPerKg} g/kg BW）― 高め（目安: 1.8〜2.7 g/kg BW）`
        );
      }
    } else {
      findings.push(`平均タンパク質 ${pStr} g`);
    }
  }
  if (nutrition.fatCaloriesRatioPct !== null) {
    const fatPct = nutrition.fatCaloriesRatioPct.toFixed(0);
    if (
      nutrition.fatCaloriesRatioPct >= WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE.min &&
      nutrition.fatCaloriesRatioPct <= WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE.max
    ) {
      findings.push(`脂質比 ${fatPct}% ― 推奨レンジ内`);
    } else {
      findings.push(
        nutrition.fatCaloriesRatioPct < WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE.min
          ? `脂質比 ${fatPct}% ― やや低め（目安: 15〜30%）`
          : `脂質比 ${fatPct}% ― やや高め（目安: 15〜30%）`
      );
    }
  }

  // ── 4. データ品質 ──
  if (quality.weightMissingDays > 0) {
    findings.push(
      `体重の記録が ${quality.weightMissingDays} 日未入力 ― 週次精度に影響する可能性があります`
    );
  }
  if (quality.caloriesMissingDays >= 2) {
    findings.push(
      `カロリーの記録が ${quality.caloriesMissingDays} 日未入力です`
    );
  }

  // ── 5. 特殊日 ──
  if (specialDays.totalTaggedDays > 0) {
    const parts: string[] = [];
    if (specialDays.cheatDays   > 0) parts.push(`${DAY_TAG_LABELS.is_cheat_day} ${specialDays.cheatDays} 日`);
    if (specialDays.refeedDays  > 0) parts.push(`${DAY_TAG_LABELS.is_refeed_day} ${specialDays.refeedDays} 日`);
    if (specialDays.eatingOutDays > 0) parts.push(`${DAY_TAG_LABELS.is_eating_out} ${specialDays.eatingOutDays} 日`);
    if (specialDays.travelDays  > 0) parts.push(`${DAY_TAG_LABELS.is_travel_day} ${specialDays.travelDays} 日`);
    findings.push(`今週の特殊日: ${parts.join("、")}。体重変動の一因として参考にしてください`);

    // チート/リフィードがあり停滞疑いの場合、追加注記
    if (
      stagnation.level === "suspected" &&
      specialDays.cheatDays + specialDays.refeedDays > 0
    ) {
      findings.push(
        `チートデイ/リフィードによる一時的な水分増加が停滞に見えている可能性があります`
      );
    }
  }

  // ── 6. 停滞 ──
  if (stagnation.level === "suspected") {
    const trendStr =
      stagnation.trendKgPerWeek !== null
        ? `（14 日トレンド: ${stagnation.trendKgPerWeek > 0 ? "+" : ""}${stagnation.trendKgPerWeek.toFixed(2)} kg/週）`
        : "";
    const action = isCut
      ? "カロリー設定・活動量の見直しを検討してください"
      : "摂取カロリーを増やすことを検討してください";
    findings.push(
      `7 日平均体重がほぼ横ばいで、停滞している可能性があります${trendStr}。` +
        `7 日平均を用いているため単日の水分変動は除去済みです。${action}`
    );
  } else if (stagnation.level === "watching") {
    const dir = isCut ? "減量" : "増量";
    const trendStr =
      stagnation.trendKgPerWeek !== null
        ? `（${stagnation.trendKgPerWeek.toFixed(2)} kg/週）`
        : "";
    findings.push(
      `${dir}ペースがやや緩め${trendStr}です。来週も引き続き観察してください`
    );
  }

  // ── 7. 品質注記 (suspected/watching のとき) ──
  if (
    stagnation.qualityNote &&
    (stagnation.level === "suspected" || stagnation.level === "watching")
  ) {
    findings.push(`※ ${stagnation.qualityNote}`);
  }

  return findings;
}

// ─── 睡眠時刻ヘルパー ─────────────────────────────────────────────────────────

/**
 * TIMESTAMPTZ 文字列を JST の深夜 0 時からの経過分 (0–1439) に変換する。
 * 不正な入力は null を返す。
 */
function timestampToJstMinutes(ts: string): number | null {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  // UTC 時刻 + JST オフセット (+9h = +540min) → 1440 で剰余
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 9 * 60) % (24 * 60);
}

/**
 * 経過分数 (任意の実数) を "HH:MM" 形式に変換する。
 * 1440 以上や負数は折り返し処理する。
 */
function minutesToHHMM(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 就寝時刻の日付越え補正。
 * 0:00–11:59 (0–719 分) の時刻は「翌朝の時刻（前日夜の延長）」として 1440 分を加算する。
 * これにより 23:30 と 0:30 の平均が 0:00 になる。
 */
function applyBedTimeCrossing(mins: number): number {
  return mins < 12 * 60 ? mins + 1440 : mins;
}

type AvgTimeResult = { avgMins: number; count: number };

type GoogleHealthMetricDateKey = Pick<
  GoogleHealthDailyMetricForDisplay,
  "metric_date" | "sleep_bed_at" | "sleep_wake_at"
>;

function computeAvgBedTime(
  metrics: GoogleHealthMetricDateKey[],
  dateSet: Set<string>
): AvgTimeResult | null {
  const vals: number[] = [];
  for (const metric of metrics) {
    if (!dateSet.has(metric.metric_date) || metric.sleep_bed_at === null) continue;
    const mins = timestampToJstMinutes(metric.sleep_bed_at);
    if (mins === null) continue;
    vals.push(applyBedTimeCrossing(mins));
  }
  if (vals.length === 0) return null;
  return { avgMins: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length };
}

function computeAvgWakeTime(
  metrics: GoogleHealthMetricDateKey[],
  dateSet: Set<string>
): AvgTimeResult | null {
  const vals: number[] = [];
  for (const metric of metrics) {
    if (!dateSet.has(metric.metric_date) || metric.sleep_wake_at === null) continue;
    const mins = timestampToJstMinutes(metric.sleep_wake_at);
    if (mins === null) continue;
    vals.push(mins);
  }
  if (vals.length === 0) return null;
  return { avgMins: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length };
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = average(values);
  if (avg === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function buildCardioMetric(args: {
  metrics: GoogleHealthDailyMetricForDisplay[];
  currentDateSet: Set<string>;
  baselineDateSet: Set<string>;
  field: "hrv_ms" | "rhr_bpm";
}): WeeklyCardioMetric {
  const currentValues = args.metrics
    .filter((metric) => args.currentDateSet.has(metric.metric_date))
    .map((metric) => metric[args.field])
    .filter((value): value is number => value !== null);
  const baselineValues = args.metrics
    .filter((metric) => args.baselineDateSet.has(metric.metric_date))
    .map((metric) => metric[args.field])
    .filter((value): value is number => value !== null);

  const avg7d = average(currentValues);
  const baselineAvg14d = average(baselineValues);

  return {
    avg7d,
    daysLogged7d: currentValues.length,
    baselineAvg14d,
    baselineStdDev14d: stdDev(baselineValues),
    deviationPct:
      avg7d !== null && baselineAvg14d !== null && baselineAvg14d > 0
        ? ((avg7d - baselineAvg14d) / baselineAvg14d) * 100
        : null,
  };
}

// ─── メイン関数 ──────────────────────────────────────────────────────────────

/**
 * 週次レビューデータを生成する。
 *
 * @param logs           daily_logs 全件
 * @param metrics        calcReadiness の結果を再利用 (weight_7d_avg など)
 * @param qualityReport  calcDataQuality の結果を再利用 (period7 スコアなど)
 * @param options.avgTdee14d  enrich.py の avg_tdee_14d 最終値（kcal）。判断用 KPI の基準 TDEE。
 *                            未指定のときは WeeklyTdee.avgEstimated / balancePerDay が null になる。
 * @param options.phase  "Cut" | "Bulk" (デフォルト "Cut")
 * @param options.today  基準日 YYYY-MM-DD (省略時 JST 今日)
 * @param options.googleHealthMetrics  google_health_daily_metrics の行。睡眠・心肺機能の算出に使う。
 */
export function calcWeeklyReview(
  logs: DashboardDailyLog[],
  metrics: ReadinessMetrics,
  qualityReport: DataQualityReport,
  options: {
    avgTdee14d?: number | null;
    phase?: string;
    today?: string;
    googleHealthMetrics?: GoogleHealthDailyMetricForDisplay[];
  } = {}
): WeeklyReviewData {
  const { avgTdee14d, phase = "Cut", today, googleHealthMetrics = [] } = options;
  const todayStr = today ?? toJstDateStr(new Date());

  // ── 7 暦日リスト ──
  const d7Start = addDaysStr(todayStr, -6) ?? todayStr;
  const last7Dates = dateRangeStr(d7Start, todayStr);
  const weekLabel = `${d7Start}〜${todayStr}`;

  // ── ログ日付 Map ──
  const logByDate = new Map<string, DashboardDailyLog>();
  for (const log of logs) {
    logByDate.set(log.log_date, log);
  }

  // ── Weight (ReadinessMetrics から再利用) ──
  // prev7d_avg = weight_7d_avg − weight_change_7d (by definition)
  const prevAvg =
    metrics.weight_7d_avg !== null && metrics.weight_change_7d !== null
      ? metrics.weight_7d_avg - metrics.weight_change_7d
      : null;

  const trendKgPerWeek = metrics.weekly_rate_kg;
  const avgWeight = metrics.weight_7d_avg;
  // %BW/週: 14日線形回帰ベース。正=減量方向。avg > 0 でなければ算出しない
  const bwRatePctPerWeek =
    trendKgPerWeek !== null && avgWeight !== null && avgWeight > 0
      ? (-trendKgPerWeek / avgWeight) * 100
      : null;

  const weight: WeeklyWeight = {
    avg: avgWeight,
    prevAvg,
    change: metrics.weight_change_7d,
    trendKgPerWeek,
    bwRatePctPerWeek,
  };

  // ── Nutrition (直近 7 暦日) ──
  const windowLogs = last7Dates
    .map((d) => logByDate.get(d))
    .filter((l): l is DashboardDailyLog => l !== undefined);

  function fieldAvg(
    field: keyof Pick<DashboardDailyLog, "calories" | "protein" | "fat" | "carbs">
  ): number | null {
    const vals = windowLogs
      .filter((l) => l[field] !== null)
      .map((l) => l[field] as number);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  const avgCalories = fieldAvg("calories");
  const avgProtein = fieldAvg("protein");
  const avgFat = fieldAvg("fat");
  const avgCarbs = fieldAvg("carbs");
  const daysLogged = windowLogs.filter((l) => l.calories !== null).length;
  const proteinRatioPct =
    avgCalories !== null && avgCalories > 0 && avgProtein !== null
      ? (avgProtein * 4) / avgCalories * 100
      : null;
  const proteinGPerKgBw =
    avgProtein !== null && avgWeight !== null && avgWeight > 0
      ? avgProtein / avgWeight
      : null;
  const fatCaloriesRatioPct =
    avgCalories !== null && avgCalories > 0 && avgFat !== null
      ? (avgFat * 9) / avgCalories * 100
      : null;

  const nutrition: WeeklyNutrition = {
    avgCalories,
    avgProtein,
    avgFat,
    avgCarbs,
    daysLogged,
    proteinRatioPct,
    proteinGPerKgBw,
    fatCaloriesRatioPct,
  };

  // ── Sleep ──

  // 前週比のため、前の 7 暦日 (today-13 〜 today-7) も集計する
  const d7DateSet = new Set(last7Dates);
  const prevD14Start = addDaysStr(todayStr, -13) ?? todayStr;
  const prevD7End    = addDaysStr(todayStr, -7)  ?? todayStr;
  const prev7DateSet = new Set(dateRangeStr(prevD14Start, prevD7End));
  const d14DateSet = new Set(dateRangeStr(prevD14Start, todayStr));

  const sleepVals = googleHealthMetrics
    .filter((metric) => d7DateSet.has(metric.metric_date))
    .map((metric) => metric.sleep_minutes)
    .filter((value): value is number => value !== null)
    .map((minutes) => minutes / 60);

  let avgBedTime: string | null = null;
  let avgWakeTime: string | null = null;
  let avgBedTimeDeltaMins: number | null = null;
  let avgWakeTimeDeltaMins: number | null = null;
  let timeDaysLogged = 0;

  if (googleHealthMetrics.length > 0) {
    const currBed  = computeAvgBedTime(googleHealthMetrics, d7DateSet);
    const currWake = computeAvgWakeTime(googleHealthMetrics, d7DateSet);
    const prevBed  = computeAvgBedTime(googleHealthMetrics, prev7DateSet);
    const prevWake = computeAvgWakeTime(googleHealthMetrics, prev7DateSet);

    avgBedTime  = currBed  ? minutesToHHMM(currBed.avgMins)  : null;
    avgWakeTime = currWake ? minutesToHHMM(currWake.avgMins) : null;
    avgBedTimeDeltaMins =
      currBed && prevBed
        ? Math.round(currBed.avgMins - prevBed.avgMins)
        : null;
    avgWakeTimeDeltaMins =
      currWake && prevWake
        ? Math.round(currWake.avgMins - prevWake.avgMins)
        : null;
    timeDaysLogged = currBed?.count ?? currWake?.count ?? 0;
  }

  const sleep: WeeklySleep = {
    avgSleepHours: average(sleepVals),
    sleepDaysLogged: sleepVals.length,
    avgBedTime,
    avgWakeTime,
    avgBedTimeDeltaMins,
    avgWakeTimeDeltaMins,
    timeDaysLogged,
  };

  const cardio: WeeklyCardio = {
    hrv: buildCardioMetric({
      metrics: googleHealthMetrics,
      currentDateSet: d7DateSet,
      baselineDateSet: d14DateSet,
      field: "hrv_ms",
    }),
    rhr: buildCardioMetric({
      metrics: googleHealthMetrics,
      currentDateSet: d7DateSet,
      baselineDateSet: d14DateSet,
      field: "rhr_bpm",
    }),
  };

  // ── TDEE (14日平均 TDEE を基準線として参照) ──
  // canonical は enrich.py の avg_tdee_14d 最終値。日次ノイズに強く、判断用 KPI に適する。
  // フロントで 7日平均を再集計すると短期ノイズに引きずられるため、ここでは再計算しない。
  const avgTdeeRef: number | null = avgTdee14d ?? null;
  const balancePerDay =
    avgCalories !== null && avgTdeeRef !== null ? avgCalories - avgTdeeRef : null;

  const tdee: WeeklyTdee = {
    avgEstimated: avgTdeeRef,
    balancePerDay,
  };

  // ── Quality ──
  const quality = {
    score: qualityReport.period7.score,
    weightMissingDays: qualityReport.period7.weightMissingDays,
    caloriesMissingDays: qualityReport.period7.caloriesMissingDays,
  };

  // ── Special Days (直近 7 暦日の特殊日集計) ──
  const cheatDays     = windowLogs.filter((l) => l.is_cheat_day).length;
  const refeedDays    = windowLogs.filter((l) => l.is_refeed_day).length;
  const eatingOutDays = windowLogs.filter((l) => l.is_eating_out).length;
  const travelDays    = windowLogs.filter((l) => l.is_travel_day).length;
  const specialDays: SpecialDaySummary = {
    cheatDays,
    refeedDays,
    eatingOutDays,
    travelDays,
    totalTaggedDays: windowLogs.filter(
      (l) => l.is_cheat_day || l.is_refeed_day || l.is_eating_out || l.is_travel_day
    ).length,
  };

  // ── Stagnation ──
  const hasAnomalies = qualityReport.period7.anomalies.length > 0;
  const stagnation = calcStagnation(
    metrics.weight_change_7d,
    metrics.weekly_rate_kg,
    qualityReport.period7.score,
    hasAnomalies,
    phase
  );

  // ── Findings ──
  const findings = generateFindings(
    weight,
    nutrition,
    tdee,
    quality,
    stagnation,
    specialDays,
    phase
  );

  return {
    weekLabel,
    weight,
    nutrition,
    tdee,
    sleep,
    cardio,
    quality,
    stagnation,
    specialDays,
    findings,
  };
}
