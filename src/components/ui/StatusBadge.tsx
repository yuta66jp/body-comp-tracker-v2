/**
 * StatusBadge — 汎用ステータスバッジ（pill 型）
 *
 * アプリ全体で繰り返し使われる「信頼度」「参考度」「安定度」などの
 * 状態 pill を統一する共通コンポーネント。
 *
 * ## 状態分類 (status)
 *   ok      — 良好。緑系 (emerald)
 *   caution — 注意。黄系 (amber)
 *   alert   — 要確認。赤系 (rose)
 *   neutral — 情報のみ / 不足。灰系 (slate)
 *
 * InsightStatus と同じ 4 値体系にそろえることで、
 * 将来のダークモード対応時に token 置換のスコープを一致させる。
 *
 * ## サイズ (size)
 *   xs  — text-[10px] px-1.5 py-0.5  (安定度バッジなど補助的用途)
 *   sm  — text-[11px] px-2   py-0.5  (デフォルト。参考度バッジなど)
 *   md  — text-xs    px-2.5  py-1    (信頼度バッジなどやや目立たせる用途)
 *
 * ## ダークモード対応の注意点
 * 将来 dark: ユーティリティを追加する場合は STATUS_CONFIG の各エントリに
 * dark: クラスを追記するだけで全バッジに反映される。
 *
 * #378 で追加。
 */

import type { InsightStatus } from "@/lib/utils/weeklyInsights";

export type StatusBadgeVariant = InsightStatus; // "ok" | "caution" | "alert" | "neutral"
export type StatusBadgeSize = "xs" | "sm" | "md";

// ── 色設定 ───────────────────────────────────────────────────────────────────
// InsightCard の STATUS_CONFIG と色系統を統一する。
// テキスト・背景・枠線の組み合わせを一か所に集約し、
// ダークモード対応時はここだけ修正すればよい。
const STATUS_CONFIG: Record<StatusBadgeVariant, { text: string; bg: string; border: string }> = {
  ok:      { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30",  border: "border-emerald-200 dark:border-emerald-700/50" },
  caution: { text: "text-amber-700 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-900/30",      border: "border-amber-200 dark:border-amber-700/50"     },
  alert:   { text: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-50 dark:bg-rose-900/30",        border: "border-rose-200 dark:border-rose-700/50"       },
  neutral: { text: "text-slate-500 dark:text-slate-400",     bg: "bg-slate-50 dark:bg-slate-800",         border: "border-slate-200 dark:border-slate-600"        },
};

// ── サイズ設定 ────────────────────────────────────────────────────────────────
const SIZE_CONFIG: Record<StatusBadgeSize, string> = {
  xs: "text-[10px] px-1.5 py-0.5",
  sm: "text-[11px] px-2 py-0.5",
  md: "text-xs px-2.5 py-1",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: StatusBadgeVariant;
  label: string;
  /** バッジ左端に表示するアイコン（lucide コンポーネントの <Icon size={12} /> など） */
  icon?: React.ReactNode;
  size?: StatusBadgeSize;
  /** title 属性（ホバーツールチップ）。StabilityBadge の tooltip 相当 */
  title?: string;
}

// ── コンポーネント ────────────────────────────────────────────────────────────

export function StatusBadge({
  status,
  label,
  icon,
  size = "sm",
  title,
}: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  const sizeCls = SIZE_CONFIG[size];

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold leading-none ${cfg.text} ${cfg.bg} ${cfg.border} ${sizeCls}`}
    >
      {icon}
      {label}
    </span>
  );
}
