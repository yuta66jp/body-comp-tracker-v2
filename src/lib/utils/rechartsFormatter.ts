/**
 * rechartsFormatter.ts — Recharts Tooltip formatter の型安全ファクトリ
 *
 * 背景:
 *   Recharts の Tooltip formatter prop は
 *   `(value, name, item, index, payload) => [ReactNode, NameType] | ReactNode`
 *   という型だが、NameType / Formatter は recharts の main index から export されていない。
 *   各チャートが手書きの型注釈 (TooltipValueType | undefined, number | string | undefined)
 *   を重複して書いており、BacktestResults.tsx では (v: unknown, name: unknown) +
 *   Number(v) 強制変換という unsafe なパターンが残っていた。
 *
 * 設計:
 *   - `makeTooltipFormatter` を唯一のエントリポイントとする
 *   - 呼び元は純粋な "number → string" の変換関数と、オプションの name マッパーだけ渡す
 *   - value の型チェック（number かどうか）と NaN/Infinity ガードはヘルパー内部で行う
 *   - 非数値 / undefined → "—" (fallback) として安全側に倒す
 *   - 返り値 [string, string] は Recharts の [ReactNode, NameType] を満たす
 *
 * 使用例:
 *   <Tooltip formatter={makeTooltipFormatter(v => `${v.toFixed(1)} kg`)} />
 *   <Tooltip formatter={makeTooltipFormatter(v => `${v.toLocaleString()} kcal`)} />
 *   <Tooltip formatter={makeTooltipFormatter(v => `${v.toFixed(3)} kg`, name => LABELS[name] ?? name)} />
 */

import type { TooltipValueType } from "recharts";

/**
 * Recharts の <Tooltip> に渡すダークモード用スタイルオブジェクトを返す。
 *
 * isDark=true のとき contentStyle / labelStyle / itemStyle を返す。
 * isDark=false のとき空オブジェクト（Recharts デフォルトを維持）。
 *
 * 使い方: <Tooltip {...buildTooltipStyle(isDark)} formatter={...} />
 */
export function buildTooltipStyle(isDark: boolean): {
  contentStyle?: Record<string, string>;
  labelStyle?:   Record<string, string>;
  itemStyle?:    Record<string, string>;
} {
  if (!isDark) return {};
  return {
    contentStyle: {
      backgroundColor: "#1e293b",
      border:          "1px solid #334155",
      borderRadius:    "8px",
      boxShadow:       "0 4px 6px -1px rgba(0,0,0,0.5)",
    },
    labelStyle: { color: "#cbd5e1" },
    itemStyle:  { color: "#94a3b8" },
  };
}

/**
 * Recharts の NameType に相当するローカル型。
 * recharts の DefaultTooltipContent.NameType は main index から export されていないため
 * ローカルに互換定義する。
 */
type TooltipNameType = number | string;

/**
 * Recharts Tooltip formatter を型安全に生成するファクトリ。
 *
 * @param formatValue - 有限数値を受け取り表示文字列を返す関数
 * @param nameMapper  - シリーズ名の変換。Record なら lookup、関数なら呼び出し。省略時はそのまま。
 * @returns Recharts Tooltip formatter prop に渡せる型付き関数
 */
export function makeTooltipFormatter(
  formatValue: (v: number) => string,
  nameMapper?: Record<string, string> | ((name: string) => string),
): (
  value: TooltipValueType | undefined,
  name: TooltipNameType | undefined,
) => [string, string] {
  return (value, name) => {
    // value が有限数のときのみ formatValue を適用。それ以外は安全側の fallback "—"
    const formattedValue =
      typeof value === "number" && Number.isFinite(value)
        ? formatValue(value)
        : "—";

    const nameStr = String(name ?? "");
    let formattedName: string;
    if (typeof nameMapper === "function") {
      formattedName = nameMapper(nameStr);
    } else if (nameMapper != null) {
      formattedName = nameMapper[nameStr] ?? nameStr;
    } else {
      formattedName = nameStr;
    }

    return [formattedValue, formattedName];
  };
}
