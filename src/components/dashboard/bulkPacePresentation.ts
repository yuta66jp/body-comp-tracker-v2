import { AlertTriangle, CheckCircle2, CircleDot, HelpCircle } from "lucide-react";
import type { BulkWeeklyPaceState, BulkWeeklyPlanPace } from "@/lib/utils/bulkWeeklyPlanPace";

// KPI・ナビ・週次サマリーは同じ計算結果と表示定義を使う。
const BULK_PACE_CONFIG: Record<
  BulkWeeklyPaceState,
  { label: string; color: string; bg: string; icon: typeof CheckCircle2; guidance: string }
> = {
  on_plan: {
    label: "計画内",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700/50",
    icon: CheckCircle2,
    guidance: "増量ペースは月次計画の範囲内です。月末目標との差も確認しながら記録を続けてください。",
  },
  slow: {
    label: "増量ペースが緩め",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700/50",
    icon: CircleDot,
    guidance: "計画より緩やかな増量です。記録と摂取状況を確認し、月次計画と照らして見直してください。",
  },
  slightly_fast: {
    label: "やや速い",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700/50",
    icon: CircleDot,
    guidance: "計画よりやや速い増量です。体重の推移と摂取状況を確認してください。",
  },
  over_pace: {
    label: "増量ペース超過",
    color: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 border-rose-200 dark:bg-rose-900/30 dark:border-rose-700/50",
    icon: AlertTriangle,
    guidance: "計画より速い増量です。早期到達を目指さず、摂取状況と月次計画を見直してください。",
  },
  wrong_direction: {
    label: "増量方向外",
    color: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 border-rose-200 dark:bg-rose-900/30 dark:border-rose-700/50",
    icon: AlertTriangle,
    guidance: "体重は増量計画と逆方向に変化しています。記録と摂取状況を確認してください。",
  },
  data_insufficient: {
    label: "体重記録不足",
    color: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-600",
    icon: HelpCircle,
    guidance: "増量ペースの判定に必要な記録がそろっていません。記録を続けてください。",
  },
  plan_check: {
    label: "月次計画を確認",
    color: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 border-rose-200 dark:bg-rose-900/30 dark:border-rose-700/50",
    icon: AlertTriangle,
    guidance: "月次計画を比較できません。シーズンの開始情報・目標日・月次計画を確認してください。",
  },
};

export function getBulkPacePresentation(pace: BulkWeeklyPlanPace | null | undefined) {
  const config = BULK_PACE_CONFIG[pace?.state ?? "plan_check"];
  return {
    ...config,
    label: pace?.state === "data_insufficient" && pace.dataInsufficientReason === "season_start"
      ? "判定待ち"
      : config.label,
  };
}

export function formatBulkChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)} kg（前週比）`;
}

export function bulkPaceRecordNote(pace: BulkWeeklyPlanPace | null | undefined): string | null {
  if (pace?.state !== "data_insufficient") return null;
  const earliest = pace.dataInsufficientReason === "season_start" && pace.earliestEvaluationDate
    ? `最短で${pace.earliestEvaluationDate}から判定できます。`
    : "";
  return `${earliest}開始日を含めて14日目以降、今週・前週それぞれ5日以上の体重記録が必要です（今週 ${pace.currentWeightDays}日 / 前週 ${pace.previousWeightDays}日・今シーズン内）。`;
}
