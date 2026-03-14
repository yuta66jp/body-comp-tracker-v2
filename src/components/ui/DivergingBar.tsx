"use client";

interface DivergingBarProps {
  diff: number;
  ratio: number;
  /** diff < 0 のときのバー色 (Tailwind bg-* class) */
  leftColor: string;
  /** diff > 0 のときのバー色 (Tailwind bg-* class) */
  rightColor: string;
}

/**
 * 中央 0 基準の diverging bar。
 * - diff < 0 → 中央から左へ leftColor のバーを伸ばす
 * - diff > 0 → 中央から右へ rightColor のバーを伸ばす
 * - diff = 0 → バーなし（中央線のみ）
 * ratio は 0–1 の正規化済み幅（getNormalizedDiffWidth で算出）。
 */
export function DivergingBar({ diff, ratio, leftColor, rightColor }: DivergingBarProps) {
  const pct = `${(ratio * 100).toFixed(1)}%`;
  return (
    <div className="flex h-1.5 items-center" aria-hidden="true">
      {/* 左半分: diff < 0 のとき右端から左へ伸びる */}
      <div className="flex h-full flex-1 items-center justify-end overflow-hidden">
        {diff < 0 && (
          <div className={`h-full rounded-l-sm ${leftColor}`} style={{ width: pct }} />
        )}
      </div>
      {/* 中央線 */}
      <div className="h-3 w-px shrink-0 bg-slate-200" />
      {/* 右半分: diff > 0 のとき左端から右へ伸びる */}
      <div className="flex h-full flex-1 items-center overflow-hidden">
        {diff > 0 && (
          <div className={`h-full rounded-r-sm ${rightColor}`} style={{ width: pct }} />
        )}
      </div>
    </div>
  );
}
