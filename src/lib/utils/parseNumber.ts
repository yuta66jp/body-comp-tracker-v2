/**
 * parseNumber.ts — 数値入力の strict parser
 *
 * 入力系コードで `parseFloat()` を直接使うと `"12abc"` が `12` に部分成功する。
 * この関数は完全一致のみを受け入れ、部分成功パースを排除する。
 *
 * 対象: UI 入力 / CSV 入力 / 設定保存など、ユーザー起点の文字列を数値に変換する箇所
 * 非対象: analytics / 表示専用の数値変換（parseFloat を引き続き使用してよい）
 */

export interface ParseStrictNumberOptions {
  /** 小数を許可するか (default: true) */
  allowDecimal?: boolean;
  /** 負数を許可するか (default: false) */
  allowNegative?: boolean;
  /** 最小値。範囲外は null を返す */
  min?: number;
  /** 最大値。範囲外は null を返す */
  max?: number;
}

/**
 * 厳格な数値パーサー。
 *
 * - 空文字 / null / undefined → null（「未入力」扱い）
 * - 前後空白は trim して処理する
 * - 数字列・符号・小数点のみからなる文字列のみ受け入れる
 * - `"12abc"` `"1,234"` `"08kg"` `"."` `"-"` はすべて null
 * - `"72"` `"72.5"` `"0"` は正常に数値を返す
 * - `-1` は `allowNegative: true` のときのみ許可
 * - 範囲外は null を返す（min / max を指定した場合）
 */
export function parseStrictNumber(
  input: string | null | undefined,
  options: ParseStrictNumberOptions = {}
): number | null {
  const { allowDecimal = true, allowNegative = false, min, max } = options;

  if (input == null) return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const pattern = allowDecimal
    ? allowNegative
      ? /^-?\d+(\.\d+)?$/
      : /^\d+(\.\d+)?$/
    : allowNegative
      ? /^-?\d+$/
      : /^\d+$/;

  if (!pattern.test(trimmed)) return null;

  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;

  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;

  return n;
}
