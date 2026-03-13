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
 * analytics_cache.payload の各特徴量エントリ。
 * analyze.py の run_importance() が返す形式に対応する。
 */
export interface FactorEntry {
  label: string;
  importance: number;
  pct: number;
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
  dropped_count?: number;  // 旧キャッシュとの後方互換で省略可
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
}

// ── 定数 ─────────────────────────────────────────────────────────────────────

/** 分析に必要な最低サンプル数（analyze.py の MIN_ROWS と同値）。*/
export const MIN_ROWS = 14;

/** 欠損率がこの値を超えると「欠損が多い」と判定する。*/
export const HIGH_DROP_THRESHOLD = 0.30;

// ── 変換関数 ─────────────────────────────────────────────────────────────────

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
