/**
 * importPreflight.ts — CSV インポート前の事前集計ロジック
 *
 * DB の既存データと CSV パース結果を照合し、
 * 新規追加 / 既存更新 / スキップ件数を算出する純粋関数を提供する。
 *
 * UI (ImportSection.tsx) から分離することでユニットテスト可能にする。
 */

/** CSV インポートの事前集計結果 */
export interface ImportPreflightSummary {
  /** 新規追加予定件数（CSV 行のうち DB に存在しない log_date） */
  newCount: number;
  /** 既存データ更新予定件数（CSV 行のうち DB に既存の log_date） */
  updateCount: number;
  /**
   * スキップ予定件数。
   * parseCSV の errors 件数（= 列数不足・日付フォーマット不正などパーサー段階で排除された行）。
   * DB 側の重複や値の妥当性とは無関係。
   */
  skipCount: number;
  /** CSV 内の log_date の最小値〜最大値。行順は問わず実際の min/max を使う */
  dateRange: { from: string; to: string } | null;
}

/**
 * CSV インポートの事前集計を計算する純粋関数。
 *
 * @param parsedRows      CSV パース成功行（log_date 必須）
 * @param parseErrorCount CSV パースエラー行数（スキップ件数）
 * @param existingDates   DB に存在する log_date の集合
 */
export function computeImportPreflight(
  parsedRows: { log_date: string }[],
  parseErrorCount: number,
  existingDates: Set<string>
): ImportPreflightSummary {
  let newCount = 0;
  let updateCount = 0;
  for (const row of parsedRows) {
    if (existingDates.has(row.log_date)) {
      updateCount++;
    } else {
      newCount++;
    }
  }

  // min/max は行順に依存せず実際の日付文字列比較で求める
  const dateRange =
    parsedRows.length > 0
      ? (() => {
          const sorted = parsedRows.map((r) => r.log_date).sort();
          return { from: sorted[0], to: sorted[sorted.length - 1] };
        })()
      : null;

  return { newCount, updateCount, skipCount: parseErrorCount, dateRange };
}
