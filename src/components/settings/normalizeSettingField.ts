/**
 * normalizeSettingField.ts — 設定フィールドの保存前正規化ロジック
 *
 * SettingsForm の handleSave で使用する純粋関数を切り出したもの。
 * コンポーネントから独立しているためユニットテストが容易。
 */

export type FieldType = "number" | "text" | "date" | "select";

export interface NormalizedUpsert {
  key: string;
  value_num: number | null;
  value_str: string | null;
}

/**
 * 設定フィールドの raw 値を保存用に正規化する。
 *
 * - text / select: 前後空白を trim()
 * - number: parseFloat して Number.isFinite でなければ null
 * - date: YYYY-MM-DD 形式のみ許可（それ以外は null）
 *
 * @param key - 設定キー
 * @param raw - フォームの生入力値
 * @param type - フィールドの型
 * @returns 正規化済みの upsert オブジェクト
 */
export function normalizeSettingField(
  key: string,
  raw: string,
  type: FieldType
): NormalizedUpsert {
  const isNumeric = type === "number";
  const isDate = type === "date";

  // text / select フィールド: 前後空白を除去
  const normalizedStr = !isNumeric && !isDate ? raw.trim() : raw;
  // number フィールド: parseFloat して有限数でなければ null
  const parsedNum = isNumeric && raw.trim() !== "" ? parseFloat(raw.trim()) : NaN;
  const numValue = isNumeric ? (Number.isFinite(parsedNum) ? parsedNum : null) : null;
  // date フィールド: YYYY-MM-DD 形式のみ保存（それ以外は null）
  const dateValue =
    isDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;

  return {
    key,
    value_num: numValue,
    value_str: isNumeric
      ? null
      : isDate
        ? dateValue
        : normalizedStr !== ""
          ? normalizedStr
          : null,
  };
}
