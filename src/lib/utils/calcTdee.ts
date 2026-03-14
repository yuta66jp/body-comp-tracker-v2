/**
 * TDEE (Total Daily Energy Expenditure) 逆算ユーティリティ
 *
 * TDEE = 体重変化から逆算。
 * 脂肪 1kg = 7,200 kcal (エビデンスベース: Hall et al., 2012)
 * ※旧コードの 6,800 との不一致を 7,200 に統一。
 */
import { toJstDateStr, parseLocalDateStr, daysBetween } from "./date";

export const KCAL_PER_KG_FAT = 7_200;

interface TdeeInput {
  weightKgStart: number;
  weightKgEnd: number;
  days: number;
  avgCaloriesPerDay: number;
}

/**
 * 体重変化と摂取カロリーから TDEE を逆算する。
 * TDEE = 摂取カロリー - (体重変化 × 7200 / 日数)
 */
export function calcTdeeFromChange({
  weightKgStart,
  weightKgEnd,
  days,
  avgCaloriesPerDay,
}: TdeeInput): number {
  const weightDelta = weightKgEnd - weightKgStart; // + 増加, - 減少
  const energyBalance = (weightDelta * KCAL_PER_KG_FAT) / days;
  return avgCaloriesPerDay - energyBalance;
}

/**
 * Mifflin-St Jeor 式で基礎代謝 (BMR) を計算する。
 */
export function calcBmr(params: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  isMale: boolean;
}): number {
  const { weightKg, heightCm, ageYears, isMale } = params;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return isMale ? base + 5 : base - 161;
}

export interface SimPoint {
  date: string;  // YYYY-MM-DD
  weight: number;
}

/**
 * 代謝適応シミュレーション (旧版 run_metabolic_simulation() を移植)
 *
 * 体重が減るにつれて TDEE も低下する（代謝適応）という現象をモデル化。
 * ADAPTATION_FACTOR = 30 kcal/kg (旧版踏襲)
 *
 * @param currentWeight  直近の体重 (kg)
 * @param currentTdee    直近の推定 TDEE (kcal)
 * @param planIntake     今後の想定摂取カロリー (kcal/日) — 直近平均を使用
 * @param targetDate     シミュレーション終了日 (YYYY-MM-DD)
 * @param startDate      開始日 (YYYY-MM-DD, 省略時は今日)
 */
export function calcMetabolicSim(
  currentWeight: number,
  currentTdee: number,
  planIntake: number,
  targetDate: string,
  startDate?: string
): SimPoint[] {
  const ADAPTATION_FACTOR = 30; // kcal/kg
  const startStr = startDate ?? toJstDateStr();
  // parseLocalDateStr はループ内の日付加算用に保持する
  const start = parseLocalDateStr(startStr);
  if (start === null) return [];
  // daysBetween で date-only を安全に差分計算する (new Date("YYYY-MM-DD") の UTC 解釈を回避)
  const days = daysBetween(startStr, targetDate);
  if (days === null || days <= 0) return [];

  const points: SimPoint[] = [];
  let simWeight = currentWeight;
  let simTdee = currentTdee;

  for (let i = 1; i <= days; i++) {
    const balance = planIntake - simTdee;
    simWeight += balance / KCAL_PER_KG_FAT;
    const weightLoss = currentWeight - simWeight;
    simTdee = currentTdee - weightLoss * ADAPTATION_FACTOR;

    const d = new Date(start);
    d.setDate(d.getDate() + i);
    points.push({
      date: toJstDateStr(d),
      weight: Math.round(simWeight * 100) / 100,
    });
  }
  return points;
}

/**
 * BMR × 活動係数で理論 TDEE を算出する。
 */
export function calcTheoreticalTdee(params: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  isMale: boolean;
  activityFactor: number;
}): number {
  return calcBmr(params) * params.activityFactor;
}

// ── Phase 3-B 追加 ──────────────────────────────────────────────────────────

/**
 * 収支差分 = 平均摂取 kcal - 平均実測 TDEE (kcal/日)
 *   マイナス = 消費が上回る = 減量方向
 *   プラス   = 摂取が上回る = 増量方向
 */
export function calcEnergyBalance(
  avgIntake: number | null,
  avgTdee: number | null
): number | null {
  if (avgIntake === null || avgTdee === null) return null;
  return Math.round(avgIntake - avgTdee);
}

/**
 * 収支差分 (kcal/日) から理論体重変化 kg/週 を算出する。
 * 係数: KCAL_PER_KG_FAT = 7,200 kcal/kg (calcTdeeFromChange と同一定義)
 */
export function calcTheoreticalWeightChangePerWeek(
  balanceKcalPerDay: number | null
): number | null {
  if (balanceKcalPerDay === null) return null;
  return Math.round((balanceKcalPerDay * 7 / KCAL_PER_KG_FAT) * 100) / 100;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface TdeeConfidence {
  level: ConfidenceLevel;
  reason: string;
}

/**
 * 日次 TDEE 系列に後方ローリング中央値 (rolling median) を適用する。
 *
 * 用途: 体水分・塩分・便通等で生じる短期ノイズを吸収し、週次判断に使いやすい値に平滑化する。
 * 設計:
 *   - 後方窓 (index i − windowSize + 1 〜 i) を使うので未来データへの依存なし。
 *   - minPeriods 未満の有効サンプルしか集まらない場合は null を返す（無理推定しない）。
 *   - null はウィンドウから除外してサンプル数をカウントする（欠損日に対応）。
 *
 * @param values     日次 TDEE 推定値の配列 (古い順)
 * @param windowSize ウィンドウ幅 (デフォルト 7)
 * @param minPeriods 最低有効サンプル数 (デフォルト 3)
 */
export function smoothTdeeSeries(
  values: (number | null)[],
  windowSize = 7,
  minPeriods = 3
): (number | null)[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const win = values.slice(start, i + 1).filter((v): v is number => v !== null);
    if (win.length < minPeriods) return null;
    const sorted = [...win].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  });
}

/**
 * TDEE 推定の信頼度を判定する。
 *
 * 判定基準:
 *   high   : calories + weight ともに直近7エントリ中 6日以上記録 かつ 体重標準偏差 ≤ 1.5 kg かつ TDEE σ ≤ 350 kcal
 *   medium : calories + weight ともに 4日以上、または変動が大きい
 *   low    : いずれかが 3日以下、または実測TDEE推定値なし
 */
export function calcTdeeConfidence(params: {
  calDays: number;
  weightDays: number;
  hasTdeeEstimate: boolean;
  weightStdDev?: number;
  /** 直近7日 TDEE 推定値の標準偏差 (kcal) */
  tdeeStdDev?: number;
}): TdeeConfidence {
  const { calDays, weightDays, hasTdeeEstimate, weightStdDev, tdeeStdDev } = params;
  const minDays = Math.min(calDays, weightDays);

  if (!hasTdeeEstimate) {
    return { level: "low", reason: "実測TDEE推定値がありません (ML バッチ未実行)" };
  }
  if (minDays < 4) {
    return {
      level: "low",
      reason: `直近7日のうちカロリー/体重の両方が揃う日が ${minDays} 日のみです。データ不足のため参考値としてのみ扱ってください。`,
    };
  }
  if (weightStdDev !== undefined && weightStdDev > 1.5) {
    return {
      level: "medium",
      reason: `直近の体重変動が大きく推定が不安定です (σ ≈ ${weightStdDev.toFixed(1)} kg)。単日変動を平滑化した参考値です。`,
    };
  }
  if (tdeeStdDev !== undefined && tdeeStdDev > 350) {
    return {
      level: "medium",
      reason: `TDEE推定の変動幅が大きい状態です (σ ≈ ${Math.round(tdeeStdDev)} kcal)。直近の体重変動が大きいため参考度は中程度です。`,
    };
  }
  if (minDays < 6) {
    return {
      level: "medium",
      reason: `直近7日のうち ${minDays} 日分のデータで推定しています。`,
    };
  }
  return { level: "high", reason: "直近7日のデータが十分に揃っています。" };
}

/**
 * 理論変化 kg/週 と実測変化 kg/週 を比較して解釈補助文を返す。
 */
export function buildTdeeInterpretation(
  balance: number | null,
  theoretical: number | null,
  measured: number | null
): string {
  if (balance === null) return "データ不足のため収支を算出できません。";

  const direction =
    balance < -100 ? "摂取は消費を下回っており、減量方向の収支です。" :
    balance >  100 ? "摂取が消費を上回っており、増量方向の収支です。" :
                     "収支は概ね均衡しています。";

  if (theoretical === null) return direction;
  if (measured === null) return `${direction} 体重データ不足のため実測変化と比較できません。`;

  const gap = measured - theoretical; // 正 = 実測の減り幅が小さい / 増え幅が大きい
  const gapAbs = Math.abs(gap);
  let comparison: string;

  if (gapAbs <= 0.15) {
    comparison = "実測は理論に概ね沿っています。";
  } else if (theoretical < -0.05 && measured > -0.05) {
    comparison = "収支上は減量方向ですが、直近の体重は横ばいです。水分変動または記録誤差の可能性があります。";
  } else if (gapAbs > 0.5) {
    comparison = "理論と実測の乖離が大きく、水分変動または記録誤差の可能性があります。";
  } else if (gap > 0) {
    comparison = "実測の減少は理論より小さい傾向です。";
  } else {
    comparison = "実測は理論より速いペースで推移しています。";
  }

  return `${direction} ${comparison}`;
}
