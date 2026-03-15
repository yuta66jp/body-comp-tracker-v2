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

import type { DailyLog } from "@/lib/supabase/types";
import type { ReadinessMetrics } from "./calcReadiness";
import type { DataQualityReport } from "./calcDataQuality";
import { addDaysStr, dateRangeStr, toJstDateStr } from "./date";
import { DAY_TAG_LABELS } from "./dayTags";

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
}

export interface WeeklyWeight {
  /** 直近 7 暦日の体重平均 (kg) */
  avg: number | null;
  /** 前 7 日 (8〜14 日前) の体重平均 (kg) */
  prevAvg: number | null;
  /** 週平均体重の変化: avg − prevAvg (kg) */
  change: number | null;
  /** 14 日線形回帰 slope × 7 (kg/週) */
  trendKgPerWeek: number | null;
}

export interface WeeklyTdee {
  /** 直近 7 日の推定 TDEE 平均 (kcal) */
  avgEstimated: number | null;
  /** 摂取 - TDEE = エネルギーバランス (kcal/日). 負 = 赤字 */
  balancePerDay: number | null;
}

/** 直近 7 日の特殊日集計 */
export interface SpecialDaySummary {
  cheatDays: number;
  refeedDays: number;
  eatingOutDays: number;
  travelDays: number;
  poorSleepDays: number;
  /** いずれかのタグが付いた日数 */
  totalTaggedDays: number;
}

export interface WeeklyReviewData {
  /** 集計期間ラベル。例: "2026-03-04〜2026-03-10" */
  weekLabel: string;
  weight: WeeklyWeight;
  nutrition: WeeklyNutrition;
  tdee: WeeklyTdee;
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
      findings.push(`摂取 ${calStr} kcal / 推定 TDEE ${tdeeStr} kcal → ${balNote}`);
    } else {
      findings.push(
        `平均摂取 ${calStr} kcal（TDEE 未推定のためバランス算出不可）`
      );
    }
  } else {
    findings.push("カロリーデータが不足しており、摂取量を算出できませんでした");
  }

  // ── 3. タンパク質 ──
  if (nutrition.avgProtein !== null) {
    const pStr = fmt0(nutrition.avgProtein);
    if (nutrition.proteinRatioPct !== null) {
      const pct = nutrition.proteinRatioPct.toFixed(0);
      if (nutrition.proteinRatioPct >= 25) {
        findings.push(
          `平均タンパク質 ${pStr} g（摂取比 ${pct}%）― 適切な水準を維持`
        );
      } else {
        findings.push(
          `平均タンパク質 ${pStr} g（摂取比 ${pct}%）― やや低め（目安: 25% 以上）`
        );
      }
    } else {
      findings.push(`平均タンパク質 ${pStr} g`);
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
    if (specialDays.poorSleepDays > 0) parts.push(`${DAY_TAG_LABELS.is_poor_sleep} ${specialDays.poorSleepDays} 日`);
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

// ─── メイン関数 ──────────────────────────────────────────────────────────────

/**
 * 週次レビューデータを生成する。
 *
 * @param logs           daily_logs 全件
 * @param metrics        calcReadiness の結果を再利用 (weight_7d_avg など)
 * @param qualityReport  calcDataQuality の結果を再利用 (period7 スコアなど)
 * @param options.enrichedTdeeMap  log_date → tdee_estimated の Map
 * @param options.phase  "Cut" | "Bulk" (デフォルト "Cut")
 * @param options.today  基準日 YYYY-MM-DD (省略時 JST 今日)
 */
export function calcWeeklyReview(
  logs: DailyLog[],
  metrics: ReadinessMetrics,
  qualityReport: DataQualityReport,
  options: {
    enrichedTdeeMap?: Map<string, number>;
    phase?: string;
    today?: string;
  } = {}
): WeeklyReviewData {
  const { enrichedTdeeMap, phase = "Cut", today } = options;
  const todayStr = today ?? toJstDateStr(new Date());

  // ── 7 暦日リスト ──
  const d7Start = addDaysStr(todayStr, -6) ?? todayStr;
  const last7Dates = dateRangeStr(d7Start, todayStr);
  const weekLabel = `${d7Start}〜${todayStr}`;

  // ── ログ日付 Map ──
  const logByDate = new Map<string, DailyLog>();
  for (const log of logs) {
    logByDate.set(log.log_date, log);
  }

  // ── Weight (ReadinessMetrics から再利用) ──
  // prev7d_avg = weight_7d_avg − weight_change_7d (by definition)
  const prevAvg =
    metrics.weight_7d_avg !== null && metrics.weight_change_7d !== null
      ? metrics.weight_7d_avg - metrics.weight_change_7d
      : null;

  const weight: WeeklyWeight = {
    avg: metrics.weight_7d_avg,
    prevAvg,
    change: metrics.weight_change_7d,
    trendKgPerWeek: metrics.weekly_rate_kg,
  };

  // ── Nutrition (直近 7 暦日) ──
  const windowLogs = last7Dates
    .map((d) => logByDate.get(d))
    .filter((l): l is DailyLog => l !== undefined);

  function fieldAvg(
    field: keyof Pick<DailyLog, "calories" | "protein" | "fat" | "carbs">
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

  const nutrition: WeeklyNutrition = {
    avgCalories,
    avgProtein,
    avgFat,
    avgCarbs,
    daysLogged,
    proteinRatioPct,
  };

  // ── TDEE (直近 7 日の推定 TDEE 平均) ──
  const tdee7vals = last7Dates
    .map((d) => enrichedTdeeMap?.get(d) ?? null)
    .filter((v): v is number => v !== null);
  const avgTdee7 =
    tdee7vals.length > 0
      ? tdee7vals.reduce((a, b) => a + b, 0) / tdee7vals.length
      : null;
  const balancePerDay =
    avgCalories !== null && avgTdee7 !== null ? avgCalories - avgTdee7 : null;

  const tdee: WeeklyTdee = {
    avgEstimated: avgTdee7,
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
  const poorSleepDays = windowLogs.filter((l) => l.is_poor_sleep).length;
  const specialDays: SpecialDaySummary = {
    cheatDays,
    refeedDays,
    eatingOutDays,
    travelDays,
    poorSleepDays,
    totalTaggedDays: windowLogs.filter(
      (l) => l.is_cheat_day || l.is_refeed_day || l.is_eating_out || l.is_travel_day || l.is_poor_sleep
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
    quality,
    stagnation,
    specialDays,
    findings,
  };
}
