/**
 * エネルギーバランス表示ユーティリティ
 *
 * バーの「向き」は数式の符号で決まり、「色（評価）」は現在フェーズで決まる。
 */

export type CurrentPhase = "Cut" | "Bulk";
export type BalanceStatus = "good" | "bad" | "neutral";

/**
 * balance と phase からバランスの評価を返す。
 * - Cut:  balance < 0 → good（赤字 = 減量目的に合致）
 * - Bulk: balance > 0 → good（黒字 = 増量目的に合致）
 * - balance === 0 → neutral
 * - phase が null / 不明値 → neutral（安全側に倒す）
 */
export function getBalanceStatus(balance: number, phase: CurrentPhase | null): BalanceStatus {
  if (balance === 0) return "neutral";
  if (phase === "Cut") return balance < 0 ? "good" : "bad";
  if (phase === "Bulk") return balance > 0 ? "good" : "bad";
  return "neutral";
}

/**
 * phase に応じた diverging bar の leftColor / rightColor (Tailwind bg-* class) を返す。
 * diff < 0 のバーが leftColor、diff > 0 のバーが rightColor を使う。
 */
export function getBalanceBarColors(phase: CurrentPhase | null): {
  leftColor: string;
  rightColor: string;
} {
  if (phase === "Cut") {
    // 赤字（左・good）= 緑、黒字（右・bad）= 赤
    return { leftColor: "bg-emerald-400", rightColor: "bg-rose-400" };
  }
  if (phase === "Bulk") {
    // 赤字（左・bad）= 赤、黒字（右・good）= 緑
    return { leftColor: "bg-rose-400", rightColor: "bg-emerald-400" };
  }
  // phase 未設定: ニュートラルグレー
  return { leftColor: "bg-slate-300", rightColor: "bg-slate-300" };
}

/**
 * balance と phase からバランス数値テキストの Tailwind color class を返す。
 * balance === null は呼び出し側で "—" として扱うこと。
 */
export function getBalanceTextColor(balance: number, phase: CurrentPhase | null): string {
  if (balance === 0) return "text-slate-400";
  const status = getBalanceStatus(balance, phase);
  if (status === "good") return "text-emerald-600";
  if (status === "bad") return "text-rose-500";
  return "text-slate-400";
}
