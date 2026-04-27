/**
 * InsightCard / InsightCardList — 所見カード共通 UI コンポーネント
 *
 * 直近7日サマリー・TDEE 解釈・将来の AI 因子分析など
 * 複数箇所で流用できる汎用カード UI。
 *
 * デザイン方針:
 *   - status に応じた色ドット + 微妙なタイント背景で重要度を視覚化
 *   - 短い title で状態を即把握、detail で補足 / 次アクションを補う
 *   - badge prop で信頼度バッジなど付加情報を右端に配置可能
 *   - Server Component として動作 (状態 / イベントなし)
 *
 * 型定義 (InsightStatus / InsightItem) は
 * @/lib/utils/weeklyInsights に一元化する。
 *
 * #360 で追加。
 */

import type { InsightItem, InsightStatus } from "@/lib/utils/weeklyInsights";

// ── 設定 ──────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  InsightStatus,
  { dot: string; bg: string; border: string }
> = {
  ok:      { dot: "bg-emerald-500", bg: "bg-emerald-50/70 dark:bg-emerald-900/30",  border: "border-emerald-100 dark:border-emerald-700/50" },
  caution: { dot: "bg-amber-500",   bg: "bg-amber-50/70 dark:bg-amber-900/30",      border: "border-amber-100 dark:border-amber-700/50" },
  alert:   { dot: "bg-rose-500",    bg: "bg-rose-50/70 dark:bg-rose-900/30",        border: "border-rose-100 dark:border-rose-700/50" },
  neutral: { dot: "bg-slate-400",   bg: "bg-slate-50 dark:bg-slate-800",            border: "border-slate-100 dark:border-slate-700" },
};

// ── InsightCard ───────────────────────────────────────────────────────────────

interface InsightCardProps {
  item: InsightItem;
  /**
   * カード右端に配置する付加情報（信頼度バッジなど）。
   * 指定した場合は title と同じ行の右端に描画される。
   */
  badge?: React.ReactNode;
}

export function InsightCard({ item, badge }: InsightCardProps) {
  const cfg = STATUS_CONFIG[item.status];
  return (
    <div className={`rounded-xl border px-4 py-3 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start gap-3">
        {/* 左: dot + テキスト */}
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span
            className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${cfg.dot}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug text-slate-700 dark:text-slate-200">
              {item.title}
            </p>
            {item.detail && (
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {item.detail}
              </p>
            )}
          </div>
        </div>
        {/* 右: badge (optional) */}
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
    </div>
  );
}

// ── InsightCardList ───────────────────────────────────────────────────────────

interface InsightCardListProps {
  items: InsightItem[];
  emptyText?: string;
}

export function InsightCardList({
  items,
  emptyText = "所見を生成するにはデータが必要です",
}: InsightCardListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <InsightCard key={`${item.status}:${item.title}:${item.detail ?? ""}`} item={item} />
      ))}
    </div>
  );
}
