"use client";

/**
 * TdeeKpiCard — TDEE 分析 KPI 表示
 *
 * #360: 「収支の解釈」セクションを InsightCard UI に置き換え。
 *   - 以前: 平文テキスト + 信頼度バッジ (右端)
 *   - 以降: InsightCard (status dot + title + detail + 信頼度バッジ)
 *   - 信頼度 (low / medium / high) が status の色に直結し、一目で把握できる
 *   - confidence.reason はカードの detail に組み込み、埋もれない設計に
 *
 * 既存の計算ロジック (calcTdee.ts) は変更しない。
 */

import { ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import type { TdeeConfidence } from "@/lib/utils/calcTdee";
import { AnalyticsStatusNote } from "@/components/analytics/AnalyticsStatusNote";
import type { AnalyticsAvailability } from "@/lib/analytics/status";
import { InsightCard } from "@/components/ui/InsightCard";
import type { InsightItem, InsightStatus } from "@/lib/utils/weeklyInsights";
import { extractTdeeComparisonNote } from "@/lib/utils/weeklyInsights";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SectionLabel } from "@/components/ui/SectionLabel";

interface TdeeKpiCardProps {
  /** 直近7日平均 TDEE — 短期変化確認用 (収支計算・解釈の基礎にも使用) */
  avgTdee:                 number | null;
  /** 直近14日平均 TDEE — 傾向判断用の基準線。KPI カードの主表示 */
  avgTdee14d:              number | null;
  theoreticalTdee:         number | null;
  avgCalories:             number | null;
  balance:                 number | null;  // 収支差分 = 摂取 - TDEE (kcal/日)
  theoreticalWeightChange: number | null;  // kg/週 (収支ベース)
  measuredWeightChange:    number | null;  // kg/週 (実体重推移)
  confidence:              TdeeConfidence;
  interpretation:          string;
  /** enriched_logs の新鮮さ（stale 時に補助注記を表示） */
  enrichedAvailability?:   AnalyticsAvailability;
}

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function SignedKcal({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-gray-300 dark:text-slate-600">—</span>;
  const sign = value > 0 ? "+" : "";
  const color = value < -50 ? "text-emerald-600" : value > 50 ? "text-rose-500" : "text-gray-800 dark:text-slate-300";
  return (
    <span className={color}>
      {sign}{value.toLocaleString()}
      {label && <span className="ml-1 text-sm font-normal text-gray-400 dark:text-slate-500">{label}</span>}
    </span>
  );
}

function SignedKg({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300 dark:text-slate-600">—</span>;
  const sign = value > 0 ? "+" : "";
  const color = value < -0.05 ? "text-emerald-600" : value > 0.05 ? "text-rose-500" : "text-gray-800 dark:text-slate-300";
  return (
    <span className={color}>
      {sign}{value.toFixed(2)}
      <span className="ml-1 text-sm font-normal text-gray-400 dark:text-slate-500">kg/週</span>
    </span>
  );
}

/** 信頼度バッジ (InsightCard の badge prop として渡す) */
function ConfidenceBadge({ confidence }: { confidence: TdeeConfidence }) {
  const ICON_MAP = {
    high:   <ShieldCheck size={12} />,
    medium: <Shield size={12} />,
    low:    <ShieldAlert size={12} />,
  };
  const STATUS_MAP = {
    high:   "ok",
    medium: "caution",
    low:    "alert",
  } as const;
  const LABEL_MAP = {
    high:   "信頼度: 高",
    medium: "信頼度: 中",
    low:    "信頼度: 低",
  };
  return (
    <StatusBadge
      status={STATUS_MAP[confidence.level]}
      label={LABEL_MAP[confidence.level]}
      icon={ICON_MAP[confidence.level]}
      size="md"
    />
  );
}

/**
 * balance / confidence から InsightItem を導出する。
 *
 * status の決め方:
 *   - confidence.level が "low" → caution (信頼度が低い = 参考程度)
 *   - balance が null → neutral
 *   - |balance| < 100 (均衡) → neutral
 *   - deficit (balance < -100) → ok (TDEE ページは phase 非依存; 赤字は一般に減量方向)
 *   - surplus (balance > 100) → caution
 *
 * TDEE は推定値のため、surplus でも "alert" にはしない。
 * confidence が低い場合は balance の良否に関わらず caution を使用する。
 */
function buildInterpretationInsightItem(
  balance: number | null,
  interpretation: string,
  confidence: TdeeConfidence,
): InsightItem {
  if (balance === null) {
    return {
      status: "neutral",
      title: "データ不足のため収支を算出できません",
      detail: confidence.reason,
    };
  }

  let status: InsightStatus;
  let title: string;

  if (confidence.level === "low") {
    // 信頼度が低い場合は方向に関わらず caution
    status = "caution";
  } else if (Math.abs(balance) < 100) {
    status = "neutral";
  } else if (balance < 0) {
    status = "ok";     // 赤字 = 減量方向
  } else {
    status = "caution"; // 余剰 = 増量方向 (phase 不明のため断定しない)
  }

  if (Math.abs(balance) < 100) {
    title = "収支は概ね均衡";
  } else if (balance < 0) {
    title = "減量方向の収支";
  } else {
    title = "増量方向の収支";
  }

  // interpretation から direction 文を除いた比較部分を detail に使う
  // (title と direction が重複しないように)
  const comparisonNote = extractTdeeComparisonNote(interpretation);
  const detail = comparisonNote
    ? `${comparisonNote} ${confidence.reason}`
    : confidence.reason;

  return { status, title, detail };
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function TdeeKpiCard({
  avgTdee,
  avgTdee14d,
  theoreticalTdee,
  avgCalories,
  balance,
  theoreticalWeightChange,
  measuredWeightChange,
  confidence,
  interpretation,
  enrichedAvailability,
}: TdeeKpiCardProps) {
  const interpretationItem = buildInterpretationInsightItem(
    balance,
    interpretation,
    confidence,
  );

  return (
    <div className="space-y-4">
      {/* 上段: 3 KPI カード */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* 平均摂取 kcal */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">平均摂取（直近7日）</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-slate-300">
            {avgCalories !== null ? Math.round(avgCalories).toLocaleString() : "—"}
            <span className="ml-1 text-base font-normal text-gray-400 dark:text-slate-500">kcal</span>
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            直近7記録日の平均（ML バッチ実行時は 7 暦日ローリング平均）
          </p>
        </div>

        {/* 実測 TDEE — 主表示: 14日平均 (基準線) / 補助表示: 7日平均 (短期変化) */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">実測 TDEE（14日平均）</p>
          <p className="mt-2 text-3xl font-bold text-orange-500">
            {avgTdee14d !== null ? Math.round(avgTdee14d).toLocaleString() : "—"}
            <span className="ml-1 text-base font-normal text-gray-400 dark:text-slate-500">kcal</span>
          </p>
          {/* 補助表示: 7日平均 — 短期変化確認用 */}
          <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">
            <span className="text-gray-400 dark:text-slate-500">7日平均</span>{" "}
            <span className="font-medium text-gray-700 dark:text-slate-300 tabular-nums">
              {avgTdee !== null ? Math.round(avgTdee).toLocaleString() : "—"}
            </span>
            <span className="ml-1 text-gray-400 dark:text-slate-500">kcal（短期変化）</span>
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            14日平均は傾向判断、7日平均は短期変化確認に使う（バッチ計算値）
            {theoreticalTdee !== null && (
              <> — 理論値 {Math.round(theoreticalTdee).toLocaleString()} kcal</>
            )}
          </p>
          {/* stale のときだけ注記（unavailable はページ上部バナーで説明済み） */}
          {enrichedAvailability && enrichedAvailability.status === "stale" && (
            <div className="mt-1">
              <AnalyticsStatusNote
                availability={enrichedAvailability}
                unavailableLabel="ML バッチ（enrich.py）実行で表示されます"
              />
            </div>
          )}
        </div>

        {/* 収支差分 */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">収支差分（摂取 − 消費）</p>
          <p className="mt-2 text-3xl font-bold">
            <SignedKcal value={balance} label="kcal/日" />
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            {balance === null ? "データ不足" :
             balance < -50 ? "マイナス = 減量方向" :
             balance >  50 ? "プラス = 増量方向" :
                             "概ね均衡"}
          </p>
        </div>
      </div>

      {/* 中段: 理論変化 / 実測変化 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">理論変化（収支ベース）</p>
          <p className="mt-2 text-2xl font-bold">
            <SignedKg value={theoreticalWeightChange} />
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            収支差分 × 7 ÷ 7,200 kcal/kg
          </p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">実測変化（体重推移）</p>
          <p className="mt-2 text-2xl font-bold">
            {measuredWeightChange !== null ? (
              <SignedKg value={measuredWeightChange} />
            ) : (
              <span className="text-gray-300 dark:text-slate-600">—</span>
            )}
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            {measuredWeightChange !== null
              ? "直近7記録日 vs 前7記録日 の平均体重差"
              : "前週の体重データが不足しています（直近7記録日）"}
          </p>
        </div>
      </div>

      {/* 下段: 収支の解釈 (InsightCard UI) */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <SectionLabel mb="mb-3">収支の解釈</SectionLabel>
        {/*
          InsightCard の status 色が confidence.level と収支方向を反映する。
          badge として ConfidenceBadge を右端に配置し、信頼度が埋もれない設計に。
          detail には比較注記 + 信頼度の理由を組み込む。
        */}
        <InsightCard
          item={interpretationItem}
          badge={<ConfidenceBadge confidence={confidence} />}
        />
        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          ※ TDEE は推定値です。信頼度・理由を確認のうえ参考にしてください。
        </p>
      </div>
    </div>
  );
}
