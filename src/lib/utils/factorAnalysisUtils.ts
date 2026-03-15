/**
 * AI因子分析（XGBoost）の表示用データ変換ユーティリティ。
 *
 * 責務:
 *   - 分析結果の型定義
 *   - 無効エントリのフィルタリング
 *   - グラフ・表用の行データへの変換
 *
 * 分析ロジック本体（学習・推論）は ml-pipeline/analyze.py が担当する。
 * このファイルはフロントエンドの表示整形のみを担当する。
 */
import { getFeatureLabel } from "./featureLabels";

// ── 型定義 ───────────────────────────────────────────────────────────────────

/**
 * feature importance の安定性ラベル。
 * analyze.py の compute_stability() が返す値と対応する。
 *
 * - "high"        : CV < 0.3。再現性が高い。
 * - "medium"      : CV < 0.6。中程度のばらつき。
 * - "low"         : CV >= 0.6。ばらつきが大きく解釈に注意。
 * - "unavailable" : データ不足・bootstrap 失敗など、算出不能。
 */
export type StabilityLabel = "high" | "medium" | "low" | "unavailable";

/**
 * analytics_cache.payload の各特徴量エントリ。
 * analyze.py の run_importance() が返す形式に対応する。
 * stability / cv は _stability からマージして付与されるオプションフィールド。
 */
export interface FactorEntry {
  label: string;
  importance: number;
  pct: number;
  stability?: StabilityLabel;
  cv?: number | null;
}

/**
 * analytics_cache.payload._stability の各特徴量エントリ。
 * analyze.py の compute_stability() が返す形式に対応する。
 */
export interface StabilityEntry {
  stability: StabilityLabel;
  cv: number | null;
}

/**
 * analytics_cache.payload._meta の分析前提情報。
 * analyze.py の main() が付与するメタデータ。
 */
export interface FactorMeta {
  sample_count: number;
  date_from: string | null;
  date_to: string | null;
  total_rows: number;
  dropped_count?: number;     // 旧キャッシュとの後方互換で省略可
  feature_names?: string[];   // アクティブ特徴量名リスト (featureLabels.ts との同期確認用)
  feature_labels?: Record<string, string>; // {feature_name: label} フロントの fallback 用
}

/**
 * グラフ・説明表に渡す整形済み行データ。
 * prepareFactorRows() の出力形式。
 */
export interface SortedFactorRow {
  key: string;        // 特徴量の内部キー（例: "cal_lag1"）
  rank: number;       // 重要度順の順位（1始まり）
  label: string;      // getFeatureLabel() 解決済みの表示ラベル
  importance: number; // XGBoost の feature_importances_ 値（0〜1）
  pct: number;        // 相対的重要度（%、合計 100%）
  stability: StabilityLabel; // bootstrap 安定性ラベル（_stability からマージ）
  cv: number | null;  // 変動係数。"unavailable" の場合は null
}

// ── 定数 ─────────────────────────────────────────────────────────────────────

/** 分析に必要な最低サンプル数（analyze.py の MIN_ROWS と同値）。*/
export const MIN_ROWS = 14;

/** 欠損率がこの値を超えると「欠損が多い」と判定する。*/
export const HIGH_DROP_THRESHOLD = 0.30;

// ── 変換関数 ─────────────────────────────────────────────────────────────────

/**
 * payload._stability を各 FactorEntry にマージする。
 *
 * - _stability が存在する場合: 各特徴量の stability / cv を FactorEntry に付与する。
 * - _stability が存在しない場合（旧バッチ結果）: 全エントリの stability を "unavailable" にする。
 * - _stability に対応するキーが存在しない特徴量: stability を "unavailable" にする。
 *
 * importance の値・意味は変更しない。
 */
export function mergeStability(
  entries: Record<string, FactorEntry>,
  stabilityMap: Record<string, StabilityEntry> | null | undefined
): Record<string, FactorEntry> {
  const result: Record<string, FactorEntry> = {};
  for (const [key, entry] of Object.entries(entries)) {
    const s = stabilityMap?.[key];
    result[key] = {
      ...entry,
      stability: s?.stability ?? "unavailable",
      cv: s?.cv ?? null,
    };
  }
  return result;
}

/**
 * エントリが描画可能な有効値かどうかを判定する。
 * NaN / Infinity / 負値を含む場合は false を返す。
 */
export function isValidEntry(entry: FactorEntry): boolean {
  return (
    typeof entry.pct === "number" &&
    isFinite(entry.pct) &&
    entry.pct >= 0 &&
    typeof entry.importance === "number" &&
    isFinite(entry.importance) &&
    entry.importance >= 0
  );
}

/**
 * payload の生データをグラフ・表用の行データへ変換する。
 *
 * - 無効エントリを除外する
 * - 重要度の高い順にソートする
 * - ラベルを getFeatureLabel() で解決する
 * - rank（1始まり）を付与する
 *
 * @returns rows: 描画用行データ / filteredOutCount: 除外されたエントリ数
 */
export function prepareFactorRows(
  data: Record<string, FactorEntry>
): { rows: SortedFactorRow[]; filteredOutCount: number } {
  const rawEntries = Object.entries(data);
  const validEntries = rawEntries.filter(([, entry]) => isValidEntry(entry));
  const filteredOutCount = rawEntries.length - validEntries.length;

  const rows = validEntries
    .sort(([, a], [, b]) => b.importance - a.importance)
    .map(([key, entry], i) => ({
      key,
      rank: i + 1,
      label: getFeatureLabel(key, entry.label),
      importance: entry.importance,
      pct: entry.pct,
      stability: entry.stability ?? "unavailable" as StabilityLabel,
      cv: entry.cv ?? null,
    }));

  return { rows, filteredOutCount };
}

/**
 * 欠損率（dropped_count / total_rows）が HIGH_DROP_THRESHOLD を超えるか判定する。
 * dropped_count が未定義（旧キャッシュ）の場合は false を返す。
 */
export function isHighDropRate(meta: FactorMeta): boolean {
  return (
    meta.dropped_count != null &&
    meta.total_rows > 0 &&
    meta.dropped_count / meta.total_rows > HIGH_DROP_THRESHOLD
  );
}

/**
 * 欠損率を百分率（整数）で返す。
 * 計算不可能な場合は null を返す。
 */
export function calcDropPct(meta: FactorMeta): number | null {
  if (meta.dropped_count == null || meta.total_rows <= 0) return null;
  return Math.round((meta.dropped_count / meta.total_rows) * 100);
}
