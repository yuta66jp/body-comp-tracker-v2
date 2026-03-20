/**
 * forecastUtils.ts
 *
 * ForecastChart 向けの純粋関数ヘルパー。
 * Recharts / React に依存しないため単体テストが容易。
 */

/**
 * buildForecastMap
 *
 * 予測系列（predictions）から「表示対象の日付 → yhat」Map を構築する。
 *
 * フィルタ条件: `p.ds > latestLogDate`
 *   最終実測日より後の予測のみを含める。
 *   - 実測のある日は actual ドットがあるため予測を重ねない
 *   - 最終実測日〜今日のギャップ期間の予測を含めることで、グラフ上で
 *     実測末端と予測線が視覚的に接続する（今日基準でフィルタすると
 *     このギャップが空白になり「予測が追随していない」と見える）
 *
 * @param predictions  predictions テーブルのレコード列
 * @param latestLogDate  体重あり最終ログ日 ("YYYY-MM-DD")。なければ今日の JST 日付
 */
export function buildForecastMap(
  predictions: Array<{ ds: string; yhat: number }>,
  latestLogDate: string
): Map<string, number> {
  return new Map(
    predictions
      .filter((p) => p.ds > latestLogDate)
      .map((p) => [p.ds, p.yhat])
  );
}
