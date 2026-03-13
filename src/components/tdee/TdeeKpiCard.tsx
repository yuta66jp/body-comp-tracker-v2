"use client";

import { TrendingDown, TrendingUp, Minus, ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import type { TdeeConfidence } from "@/lib/utils/calcTdee";

interface TdeeKpiCardProps {
  avgTdee:                 number | null;
  theoreticalTdee:         number | null;
  avgCalories:             number | null;
  balance:                 number | null;  // 収支差分 = 摂取 - TDEE (kcal/日)
  theoreticalWeightChange: number | null;  // kg/週 (収支ベース)
  measuredWeightChange:    number | null;  // kg/週 (実体重推移)
  confidence:              TdeeConfidence;
  interpretation:          string;
}

function SignedKcal({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-gray-300">—</span>;
  const sign = value > 0 ? "+" : "";
  const color = value < -50 ? "text-emerald-600" : value > 50 ? "text-rose-500" : "text-gray-800";
  return (
    <span className={color}>
      {sign}{value.toLocaleString()}
      {label && <span className="ml-1 text-sm font-normal text-gray-400">{label}</span>}
    </span>
  );
}

function SignedKg({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300">—</span>;
  const sign = value > 0 ? "+" : "";
  const color = value < -0.05 ? "text-emerald-600" : value > 0.05 ? "text-rose-500" : "text-gray-800";
  return (
    <span className={color}>
      {sign}{value.toFixed(2)}
      <span className="ml-1 text-sm font-normal text-gray-400">kg/週</span>
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: TdeeConfidence }) {
  const cfg = {
    high:   { icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50 border-emerald-200", label: "信頼度: 高" },
    medium: { icon: Shield,      color: "text-amber-600 bg-amber-50 border-amber-200",       label: "信頼度: 中" },
    low:    { icon: ShieldAlert,  color: "text-rose-500 bg-rose-50 border-rose-200",          label: "信頼度: 低" },
  }[confidence.level];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${cfg.color}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

export function TdeeKpiCard({
  avgTdee,
  theoreticalTdee,
  avgCalories,
  balance,
  theoreticalWeightChange,
  measuredWeightChange,
  confidence,
  interpretation,
}: TdeeKpiCardProps) {
  return (
    <div className="space-y-4">
      {/* 上段: 3 KPI カード */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* 平均摂取 kcal */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">平均摂取（直近7日）</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {avgCalories !== null ? Math.round(avgCalories).toLocaleString() : "—"}
            <span className="ml-1 text-base font-normal text-gray-400">kcal</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Macro 画面の週平均摂取と同一定義
          </p>
        </div>

        {/* 実測 TDEE */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">実測 TDEE（7日平均）</p>
          <p className="mt-2 text-3xl font-bold text-orange-500">
            {avgTdee !== null ? Math.round(avgTdee).toLocaleString() : "—"}
            <span className="ml-1 text-base font-normal text-gray-400">kcal</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">
            体重変化と摂取から逆算
            {theoreticalTdee !== null && (
              <> — 理論値 {Math.round(theoreticalTdee).toLocaleString()} kcal</>
            )}
          </p>
        </div>

        {/* 収支差分 */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">収支差分（摂取 − 消費）</p>
          <p className="mt-2 text-3xl font-bold">
            <SignedKcal value={balance} label="kcal/日" />
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {balance === null ? "データ不足" :
             balance < -50 ? "マイナス = 減量方向" :
             balance >  50 ? "プラス = 増量方向" :
                             "概ね均衡"}
          </p>
        </div>
      </div>

      {/* 中段: 理論変化 / 実測変化 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">理論変化（収支ベース）</p>
          <p className="mt-2 text-2xl font-bold">
            <SignedKg value={theoreticalWeightChange} />
          </p>
          <p className="mt-1 text-xs text-gray-400">
            収支差分 × 7 ÷ 7,200 kcal/kg
          </p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">実測変化（体重推移）</p>
          <p className="mt-2 text-2xl font-bold">
            {measuredWeightChange !== null ? (
              <SignedKg value={measuredWeightChange} />
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {measuredWeightChange !== null
              ? "直近7日 vs 前7日の平均体重差"
              : "前週の体重データが不足しています"}
          </p>
        </div>
      </div>

      {/* 下段: 解釈補助文 + 信頼度 */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">収支の解釈</p>
            <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{interpretation}</p>
          </div>
          <div className="shrink-0">
            <ConfidenceBadge confidence={confidence} />
            <p className="mt-1.5 text-xs text-gray-400 text-right">{confidence.reason}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
