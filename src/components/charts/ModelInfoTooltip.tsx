"use client";

/**
 * ModelInfoTooltip — モデル説明 tooltip (デスクトップ限定)
 *
 * BacktestResults / BacktestComparison の両テーブルで共用。
 * hover / focus の両方で説明文を表示する。
 */

import React from "react";
import { Info } from "lucide-react";

/** モデルキー → 簡易説明文 (具体的な期間値を含む 1〜2 文) */
export const MODEL_DESCRIPTIONS: Record<string, string> = {
  NeuralProphet:   "その時点までの全履歴で再学習する深層学習モデル。週次パターンを加味。学習データ 30 日以上必要。",
  Naive:           "最新 1 点をそのまま予測値として使うベースライン。",
  MovingAverage7d: "直近 7 日平均を予測値に使用。単日ノイズをならしたシンプル基準。",
  LinearTrend30d:  "直近 30 日の体重推移に単純線形回帰を当てはめる。30 日スパンの直線トレンドを延長。",
  EWLinearTrend:   "7 日移動平均で平滑化した直近 30 点に指数重み付き線形回帰を適用。最近のデータを重く評価。",
};

interface ModelInfoTooltipProps {
  description: string;
}

/**
 * モデル名横の ℹ アイコン + tooltip。
 * 親要素が hidden md:block / hidden md:table-cell の内部に置くことで
 * モバイルでは自動的に非表示になる。
 */
export function ModelInfoTooltip({ description }: ModelInfoTooltipProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label="モデルの説明を見る"
        aria-expanded={open}
        className="ml-1 rounded p-0.5 text-slate-300 hover:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info size={11} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-6 top-0 z-30 w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-600 shadow-lg"
        >
          {description}
        </span>
      )}
    </span>
  );
}
