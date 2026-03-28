/**
 * TDEE 補助計算ユーティリティ
 *
 * ■ 責務の境界
 *   このファイルは TDEE の canonical 計算源ではない。
 *   canonical source は ml-pipeline/enrich.py (batch) であり、
 *   その出力 (tdee_estimated / avg_tdee_7d / avg_calories_7d) を
 *   analytics_cache["enriched_logs"] に保存する。
 *   フロントエンドは canonical 値を表示・整形・fallback するだけでよい。
 *
 * ■ このファイルの関数は 3 種類に分類される
 *
 *   1. theoretical (理論計算 / シミュレーション)
 *      実測データを使わず、数式・パラメータだけで算出する。
 *      canonical 実測値とは別物として扱うこと。
 *        - calcBmr              : Mifflin-St Jeor 式 BMR
 *        - calcTheoreticalTdee  : BMR × 活動係数
 *        - calcMetabolicSim     : 代謝適応シミュレーション (将来体重予測)
 *
 *   2. helper (表示補助 / canonical 値を入力とする派生計算)
 *      canonical の tdee_estimated / avg_tdee_7d を入力として受け取り、
 *      UI 表示用の派生値・信頼度・解釈文を算出する。
 *      これらは canonical を「再計算」するのではなく、「解釈支援」する関数。
 *        - calcEnergyBalance                 : 収支差分 (摂取 - TDEE)
 *        - calcTheoreticalWeightChangePerWeek: 収支差分 → 理論体重変化 kg/週
 *        - calcTdeeConfidence                : TDEE 推定値の信頼度判定
 *        - buildTdeeInterpretation           : 収支・変化率の解釈補助文
 *
 *   3. reference (参照用 / 本番 UI では未呼び出し)
 *      テスト検証・ロジック確認・将来実装の参照として残す。
 *      enrich.py が canonical source のため、これらを本番で canonical の
 *      代替として使ってはならない。
 *        - calcTdeeFromChange : 点推定版 TDEE 逆算 (enrich.py と同一係数・異なる平滑化)
 *        - smoothTdeeSeries   : enrich.py の rolling median を TS で再現 (batch 値を再平滑化しない)
 *
 * ■ 係数 KCAL_PER_KG_FAT の二重定義について
 *   canonical 計算は enrich.py 側の KCAL_PER_KG_FAT = 7200 を使用する。
 *   TS 側の定義は theoretical 関数 (calcMetabolicSim 等) および
 *   helper 関数 (calcTheoreticalWeightChangePerWeek) が同係数を必要とするため存在する。
 *   係数を変更する場合は enrich.py と calcTdee.ts の両方を必ず更新すること。
 */
import { toJstDateStr, parseLocalDateStr, daysBetween } from "./date";

/**
 * 脂肪 1 kg あたりのエネルギー量 (kcal)。
 * エビデンス: Hall et al., 2012。旧コードの 6,800 から 7,200 に統一済み。
 *
 * ⚠ 二重定義: enrich.py の KCAL_PER_KG_FAT と同じ値。
 *   canonical 計算 (TDEE 逆算) は enrich.py 側が担う。
 *   この定数は theoretical 関数・helper 関数のみで使用する。
 *   係数変更時は enrich.py と両方を更新すること。
 */
export const KCAL_PER_KG_FAT = 7_200;

interface TdeeInput {
  weightKgStart: number;
  weightKgEnd: number;
  days: number;
  avgCaloriesPerDay: number;
}

/**
 * @category reference
 *
 * 体重変化と摂取カロリーから TDEE を点推定する。
 * TDEE = 摂取カロリー - (体重変化 × 7200 / 日数)
 *
 * ⚠ 本番 UI では呼ばれていない (テスト・ロジック参照用)。
 *   canonical TDEE は enrich.py の weight_sma7.diff() + rolling median で算出される。
 *   enrich.py は weekly SMA で短期ノイズを除去するため、この関数より安定した推定を与える。
 *   この関数を canonical の代替として本番で使ってはならない。
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
 * @category theoretical
 *
 * Mifflin-St Jeor 式で基礎代謝 (BMR) を計算する。
 * 実測ログを使わない理論計算。calcTheoreticalTdee の内部関数として使用する。
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
 * @category theoretical
 *
 * 代謝適応シミュレーション (旧版 run_metabolic_simulation() を移植)
 *
 * 体重が減るにつれて TDEE も低下する（代謝適応）という現象をモデル化する
 * 将来体重推移のシミュレーション。
 * ADAPTATION_FACTOR = 30 kcal/kg (旧版踏襲)
 *
 * canonical の tdee_estimated を起点として入力するが、
 * シミュレーション出力は実測値ではなく理論的な予測値である。
 * ForecastChart 等で将来体重の見通しを示す用途を想定。
 *
 * @param currentWeight  直近の体重 (kg)
 * @param currentTdee    直近の推定 TDEE (kcal) — canonical (avg_tdee_7d) を渡すこと
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
 * @category theoretical
 *
 * BMR × 活動係数で理論 TDEE を算出する (Mifflin-St Jeor ベース)。
 *
 * 実測ログを使わない理論計算であり、canonical TDEE (enrich.py の tdee_estimated) とは別物。
 * 用途: canonical 値が未計算 (batch 未実行) な場合の fallback 表示、
 *       および設定値に基づく「おおよその目安」としての参考表示。
 * TDEE ページでは canonical 値と並列で表示し、ユーザーが比較できるようにしている。
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

// ── 表示補助 (helper) ──────────────────────────────────────────────────────

/**
 * @category helper
 *
 * 収支差分 = 平均摂取 kcal - 平均実測 TDEE (kcal/日)
 *   マイナス = 消費が上回る = 減量方向
 *   プラス   = 摂取が上回る = 増量方向
 *
 * 入力に canonical 値 (avg_tdee_7d, avg_calories_7d) を渡すこと。
 * TDEE ページの TdeeKpiCard に渡す収支表示に使用する。
 */
export function calcEnergyBalance(
  avgIntake: number | null,
  avgTdee: number | null
): number | null {
  if (avgIntake === null || avgTdee === null) return null;
  return Math.round(avgIntake - avgTdee);
}

/**
 * @category helper
 *
 * 収支差分 (kcal/日) から理論体重変化 kg/週 を算出する。
 * 係数: KCAL_PER_KG_FAT = 7,200 kcal/kg (enrich.py と同一係数)
 *
 * calcEnergyBalance() の出力 (canonical 由来の収支) を入力として受け取る。
 * TDEE ページの「理論体重変化」表示に使用する。
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
 * @category reference
 *
 * 日次 TDEE 系列に後方ローリング中央値 (rolling median) を適用する。
 *
 * ⚠ 本番 UI では呼ばれていない (テスト・ロジック参照用)。
 *   enrich.py が tdee_estimated を計算する際に同等の処理を行っており、
 *   フロントエンドは batch 出力の tdee_estimated をそのまま使えばよい。
 *   canonical 値に対してこの関数で再平滑化してはならない。
 *
 * 用途: enrich.py の rolling median ロジックを TS 側でテスト検証するため。
 *       将来的にフロントで暫定 TDEE を表示する必要が生じた場合の参照実装。
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
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  });
}

/**
 * @category helper
 *
 * TDEE 推定の信頼度を判定する。
 *
 * canonical 値 (tdee_estimated) が存在するか、直近7日の記録密度・変動幅を元に
 * UI 表示用の信頼度ラベルと説明文を返す。
 * TDEE ページの TdeeKpiCard に渡す用途。
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
 * @category helper
 *
 * 収支差分・理論変化・実測変化を比較して解釈補助文を返す。
 *
 * TDEE ページの TdeeKpiCard に渡す「判断材料テキスト」生成用。
 * canonical 由来の値 (calcEnergyBalance / 実測体重変化) を入力として受け取る。
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
