/**
 * weeklyInsights.ts — WeeklyReviewData から所見カード用データを導出するユーティリティ
 *
 * 既存の calcWeeklyReview.ts の集計ロジックを変更せず、
 * InsightCard UI 向けのデータ構造に変換する責務を持つ。
 *
 * InsightItem / InsightStatus 型はここが正規定義源。
 * InsightCard.tsx / TdeeKpiCard.tsx はここからインポートする。
 *
 * #360 で追加。condition 系所見にも流用可能。
 */

import type { WeeklyReviewData } from "./calcWeeklyReview";
import { DAY_TAG_LABELS } from "./dayTags";
import {
  WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE,
  WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE,
} from "./weeklyNutritionRanges";

// ── 公開型 ────────────────────────────────────────────────────────────────────

/**
 * 所見の重要度 / 状態。
 * - ok      : 良好。問題なし
 * - caution : 注意。改善の余地あり
 * - alert   : 要確認。対処を検討する必要あり
 * - neutral : 情報のみ。良否判断をしない
 */
export type InsightStatus = "ok" | "caution" | "alert" | "neutral";

/** InsightCard に渡す所見の内部表現 */
export interface InsightItem {
  status: InsightStatus;
  /** 短い見出し (1 行, 数値ファクトまたは状態ラベル) */
  title: string;
  /** 補足説明または次アクション (optional) */
  detail?: string;
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function fmt0(v: number): string {
  return Math.round(v).toLocaleString();
}

function fmtSigned(v: number, decimals: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(decimals)}`;
}

function hrvDeviationInsight(deviationPct: number): {
  status: InsightStatus;
  label: string;
} {
  if (deviationPct >= 10) {
    return { status: "ok", label: "過回復・適応良好" };
  }
  if (deviationPct >= -10) {
    return { status: "ok", label: "通常" };
  }
  if (deviationPct >= -15) {
    return { status: "caution", label: "軽度の蓄積疲労" };
  }
  if (deviationPct > -25) {
    return { status: "caution", label: "中度の疲労" };
  }
  return { status: "alert", label: "重度の疲労" };
}

// ── メイン関数 ────────────────────────────────────────────────────────────────

/**
 * WeeklyReviewData から InsightItem[] を導出する。
 *
 * 生成順:
 *   1. 体重トレンド (停滞レベルを status に反映)
 *   2. エネルギー収支 (phase に基づく良否判定)
 *   3. タンパク質 (g/kg BW)
 *   4. 脂質比 (%)
 *   5. 睡眠 (avgSleepHours が非 null の場合のみ)
 *   6. データ品質警告 (欠損がある場合のみ) → 7
 *   7. 特殊日サマリー (タグがある場合のみ) → 8
 *
 * 集計ロジック (calcWeeklyReview) は変更しない。
 * 所見の内容は generateFindings と同等だが、カード表示向けに構造化する。
 */
export function deriveWeeklyInsightItems(
  data: WeeklyReviewData,
  phase: string,
): InsightItem[] {
  const items: InsightItem[] = [];
  const isCut = phase !== "Bulk";
  const { weight, nutrition, tdee, quality, stagnation, specialDays, cardio } = data;
  const bulkPlanPace = isCut ? null : data.bulkPlanPace ?? null;

  // ── 1. 体重トレンド ──────────────────────────────────────────────────────
  {
    if (bulkPlanPace) {
      const statusMap = {
        on_plan: "ok",
        slow: "caution",
        slightly_fast: "caution",
        over_pace: "alert",
        wrong_direction: "alert",
        data_insufficient: "neutral",
        plan_check: "alert",
      } as const;
      const stateDetail = {
        on_plan: "月次計画に沿った増量ペースです",
        slow: "月次計画より増量ペースが緩めです。来週も同じ傾向なら摂取量を確認してください",
        slightly_fast: "月次計画より増量ペースがやや速めです。特殊日や水分変動も確認してください",
        over_pace: "増量ペース超過です。特殊日や水分変動を確認し、14日トレンドも速い場合は摂取量の見直しを検討してください",
        wrong_direction: "月次計画とは逆に体重が減少しています。記録状況と摂取量を確認してください",
        data_insufficient: bulkPlanPace.dataInsufficientReason === "season_start"
          ? "シーズン開始直後のため、増量ペースの判定は保留しています。" +
            (bulkPlanPace.earliestEvaluationDate !== null
              ? `最短で${bulkPlanPace.earliestEvaluationDate}から判定できます。`
              : "") +
            `各期間5日以上の体重記録が必要です。体重記録：今週 ${bulkPlanPace.currentWeightDays}日 / 前週 ${bulkPlanPace.previousWeightDays}日（今シーズン内）`
          : `判定には今週・前週それぞれ5日以上の体重記録が必要です（今週 ${bulkPlanPace.currentWeightDays}日 / 前週 ${bulkPlanPace.previousWeightDays}日・今シーズン内）`,
        plan_check: bulkPlanPace.monthlyLimitViolations.length > 0
          ? `月+1.0 kg（端数月は日数按分）の上限を超える月次目標があります: ${bulkPlanPace.monthlyLimitViolations.map((violation) => violation.month).join("、")}`
          : "月次計画の対象期間または目標値を確認してください",
      } as const;

      const actualPart = bulkPlanPace.actualChangeKg !== null
        ? ` / 前週比 ${fmtSigned(bulkPlanPace.actualChangeKg, 2)} kg`
        : "";
      const plannedPart = bulkPlanPace.plannedChangeKg !== null
        ? ` / 計画 ${fmtSigned(bulkPlanPace.plannedChangeKg, 2)} kg`
        : "";
      const ratioPart = bulkPlanPace.paceRatioPct !== null
        ? `（計画比 ${Math.round(bulkPlanPace.paceRatioPct)}%）`
        : "";
      const title = weight.avg !== null
        ? `今週平均 ${weight.avg.toFixed(1)} kg${actualPart}${plannedPart}`
        : "体重データ不足";
      const detail = `${stateDetail[bulkPlanPace.state]}${ratioPart}`;

      items.push({
        status: statusMap[bulkPlanPace.state],
        title,
        detail,
      });
    } else {
    const statusMap: Record<string, InsightStatus> = {
      advancing:         "ok",
      watching:          "caution",
      suspected:         "alert",
      data_insufficient: "neutral",
    };
    const status = statusMap[stagnation.level] ?? "neutral";

    const stateLabel: Record<string, string> = {
      advancing:         isCut ? "順調に減量中" : "順調に増量中",
      watching:          isCut ? "減量ペースがやや緩め" : "増量ペースがやや緩め",
      suspected:         "体重が横ばい傾向",
      data_insufficient: "データ不足（継続記録で改善）",
    };
    const label = stateLabel[stagnation.level] ?? "";

    // title: 数値ファクト
    let title: string;
    if (weight.avg !== null) {
      const changeStr =
        weight.change !== null
          ? ` / 前週比 ${fmtSigned(weight.change, 2)} kg`
          : "";
      title = `今週平均 ${weight.avg.toFixed(1)} kg${changeStr}`;
    } else {
      title = "体重データ不足";
    }

    // detail: トレンド値 + 状態ラベル + 必要時アクション
    const trendPart =
      stagnation.trendKgPerWeek !== null
        ? `14日トレンド ${fmtSigned(stagnation.trendKgPerWeek, 2)} kg/週 ― ${label}`
        : label;

    let detail: string | undefined;
    if (stagnation.level === "suspected") {
      const action = isCut
        ? "カロリー設定・活動量の見直しを検討"
        : "摂取カロリーを増やすことを検討";
      detail = `${trendPart}。${action}`;
    } else if (stagnation.level !== "data_insufficient") {
      detail = trendPart || undefined;
    }

    // qualityNote を detail に追記 (全レベルで表示 — advancing でも品質注記がある場合がある)
    // 旧 WeeklyReviewCard では qualityNote は常に警告ボックスで表示されていたため同等の可視性を維持する
    if (stagnation.qualityNote) {
      detail = detail
        ? `${detail} / ※ ${stagnation.qualityNote}`
        : `※ ${stagnation.qualityNote}`;
    }

    items.push({ status, title, detail });
    }
  }

  // ── 2. エネルギー収支 ────────────────────────────────────────────────────
  if (nutrition.avgCalories !== null) {
    if (tdee.balancePerDay !== null) {
      const bal = tdee.balancePerDay;
      const balSign = bal > 0 ? "+" : "";
      const balStr = `${balSign}${fmt0(bal)} kcal/日`;

      let status: InsightStatus;
      let title: string;

      if (Math.abs(bal) < 100) {
        status = "neutral";
        title = `収支 ${balStr}（概ね均衡）`;
      } else if (bal < 0) {
        // 赤字
        status = isCut ? "ok" : "caution";
        title = `収支 ${balStr}（減量方向）`;
      } else {
        // 余剰
        status = isCut
          ? "caution"
          : bulkPlanPace?.state === "over_pace"
          ? "caution"
          : "ok";
        title = `収支 +${fmt0(bal)} kcal/日（増量方向）`;
      }

      let detail =
        tdee.avgEstimated !== null
          ? `摂取 ${fmt0(nutrition.avgCalories)} kcal / 推定TDEE ${fmt0(tdee.avgEstimated)} kcal（14日平均）`
          : undefined;
      if (!isCut && bal >= 100 && bulkPlanPace?.state === "over_pace") {
        detail = detail
          ? `${detail} / 計画超過が続く場合は余剰量を確認`
          : "計画超過が続く場合は余剰量を確認";
      }

      items.push({ status, title, detail });
    } else {
      items.push({
        status: "neutral",
        title: `平均摂取 ${fmt0(nutrition.avgCalories)} kcal`,
        detail: "推定TDEE 未取得のためバランス算出不可",
      });
    }
  }

  // ── 3. タンパク質 ────────────────────────────────────────────────────────
  if (nutrition.avgProtein !== null && nutrition.proteinGPerKgBw !== null) {
    const g = fmt0(nutrition.avgProtein);
    const gPerKg = nutrition.proteinGPerKgBw.toFixed(2);
    const inRange =
      nutrition.proteinGPerKgBw >= WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE.min &&
      nutrition.proteinGPerKgBw <= WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE.max;
    items.push({
      status: inRange ? "ok" : nutrition.proteinGPerKgBw < WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE.min ? "caution" : "neutral",
      title: `タンパク質 ${gPerKg} g/kg BW（平均 ${g} g/日）`,
      detail: inRange
        ? "推奨レンジ内を維持"
        : nutrition.proteinGPerKgBw < WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE.min
        ? "やや低め — 目安: 1.8〜2.7 g/kg BW"
        : "高め — 目安: 1.8〜2.7 g/kg BW",
    });
  }

  // ── 4. 脂質 ───────────────────────────────────────────────────────────────
  if (nutrition.fatCaloriesRatioPct !== null) {
    const fatPct = nutrition.fatCaloriesRatioPct.toFixed(0);
    const avgFatText = nutrition.avgFat !== null ? `（平均 ${fmt0(nutrition.avgFat)} g/日）` : "";
    const inRange =
      nutrition.fatCaloriesRatioPct >= WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE.min &&
      nutrition.fatCaloriesRatioPct <= WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE.max;
    items.push({
      status: inRange ? "ok" : "caution",
      title: `脂質比 ${fatPct}%${avgFatText}`,
      detail: inRange
        ? "推奨レンジ内を維持"
        : nutrition.fatCaloriesRatioPct < WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE.min
        ? "やや低め — 目安: 15〜30%"
        : "やや高め — 目安: 15〜30%",
    });
  }

  // ── 5. 睡眠 ──────────────────────────────────────────────────────────────
  if (data.sleep.avgSleepHours !== null) {
    const h = data.sleep.avgSleepHours;
    const hStr = h.toFixed(1);
    let status: InsightStatus;
    let label: string;
    let detail: string | undefined;

    if (h < 7) {
      status = "caution";
      label = `平均睡眠 ${hStr}h — 短め`;
      detail = "目安: 7〜9 時間";
    } else if (h <= 9) {
      status = "ok";
      label = `平均睡眠 ${hStr}h — 適正`;
      detail = undefined;
    } else {
      status = "neutral";
      label = `平均睡眠 ${hStr}h — 長め`;
      detail = "目安: 7〜9 時間";
    }

    items.push({ status, title: label, detail });
  }

  // ── 6. HRV ベースライン ─────────────────────────────────────────────────
  if (cardio.hrv.deviationPct !== null && cardio.hrv.avg7d !== null && cardio.hrv.baselineAvg14d !== null) {
    const hrv = hrvDeviationInsight(cardio.hrv.deviationPct);
    items.push({
      status: hrv.status,
      title: `HRV ${fmtSigned(cardio.hrv.deviationPct, 1)}% — ${hrv.label}`,
      detail: `7日平均 ${cardio.hrv.avg7d.toFixed(1)}ms / 2週平均 ${cardio.hrv.baselineAvg14d.toFixed(1)}ms`,
    });
  }

  // ── 7. データ品質警告 ────────────────────────────────────────────────────
  {
    const missing: string[] = [];
    if (quality.weightMissingDays > 0) {
      missing.push(`体重 ${quality.weightMissingDays} 日`);
    }
    if (quality.caloriesMissingDays >= 2) {
      missing.push(`カロリー ${quality.caloriesMissingDays} 日`);
    }
    if (missing.length > 0) {
      items.push({
        status: "caution",
        title: `${missing.join(" / ")} が未入力`,
        detail: "記録の追加で週次精度が改善します",
      });
    }
  }

  // ── 8. 特殊日サマリー ────────────────────────────────────────────────────
  if (specialDays.totalTaggedDays > 0) {
    const parts: string[] = [];
    if (specialDays.cheatDays > 0)
      parts.push(`${DAY_TAG_LABELS.is_cheat_day} ${specialDays.cheatDays}日`);
    if (specialDays.refeedDays > 0)
      parts.push(`${DAY_TAG_LABELS.is_refeed_day} ${specialDays.refeedDays}日`);
    if (specialDays.eatingOutDays > 0)
      parts.push(`${DAY_TAG_LABELS.is_eating_out} ${specialDays.eatingOutDays}日`);
    if (specialDays.travelDays > 0)
      parts.push(`${DAY_TAG_LABELS.is_travel_day} ${specialDays.travelDays}日`);

    const hasCheatOrRefeed = specialDays.cheatDays + specialDays.refeedDays > 0;
    const detail =
      hasCheatOrRefeed && stagnation.level === "suspected"
        ? "一時的な水分増加が停滞に見えている可能性あり"
        : "体重変動の一因として参考にしてください";

    items.push({
      status: "neutral",
      title: `今週の特殊日: ${parts.join(" / ")}`,
      detail,
    });
  }

  return items;
}

/**
 * TDEE 解釈文から比較部分（direction を除いた後半）を抽出する。
 *
 * buildTdeeInterpretation の出力は "${direction}。 ${comparison}" 形式。
 * 先頭の direction 文を除くことで InsightCard の title と重複しないようにする。
 */
export function extractTdeeComparisonNote(interpretation: string): string {
  // 。で分割し、先頭の direction 文を除く
  const parts = interpretation.split(/(?<=。)\s*/);
  return parts.slice(1).join("").trim();
}
