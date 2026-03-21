/**
 * WeeklyReviewCard — 直近7日サマリー表示
 *
 * Server Component (状態・イベントなし)
 * props は page.tsx で計算済みの WeeklyReviewData を受け取る。
 *
 * 【役割】
 *   - 「今日を含む直近7暦日」のローリング集計サマリー
 *   - 固定暦週（月〜日など）ではなく、常に今日起点で動く
 *   - ダッシュボードでは「今どうか」「次に何を見るか」に絞る
 *   - 詳細な栄養・TDEEバランスは各専用ページへ委譲する
 *   - 将来の固定週レビュー（確定週レビュー）は別コンポーネントで導入する想定
 *
 * レイアウト:
 *   ヘッダー: タイトル / 期間 / 停滞バッジ
 *   本体 2列: 左=数値統計（体重・カロリー・バランス差のみ）、右=所見箇条書き
 *   フッター: データ品質スコア / ローリング集計の注記
 */

import {
  ClipboardList,
  TrendingDown,
  TrendingUp,
  Minus,
  CheckCircle2,
  CircleDot,
  AlertTriangle,
  HelpCircle,
  Flame,
  Beef,
} from "lucide-react";
import type { WeeklyReviewData, StagnationLevel } from "@/lib/utils/calcWeeklyReview";
import { DAY_TAG_LABELS, DAY_TAG_BADGE_COLORS } from "@/lib/utils/dayTags";
import { AnalyticsStatusNote } from "@/components/analytics/AnalyticsStatusNote";
import type { AnalyticsAvailability } from "@/lib/analytics/status";

interface Props {
  data: WeeklyReviewData;
  phase: string;
  /** enriched_logs の新鮮さ（エネルギーバランス欄に補助注記を表示） */
  enrichedAvailability?: AnalyticsAvailability;
}

// ─── 停滞バッジ設定 ──────────────────────────────────────────────────────────

const STAGNATION_CONFIG: Record<
  StagnationLevel,
  { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
> = {
  advancing: {
    label: "順調",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
  },
  watching: {
    label: "要観察",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    icon: CircleDot,
  },
  suspected: {
    label: "停滞疑い",
    color: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
    icon: AlertTriangle,
  },
  data_insufficient: {
    label: "データ不足",
    color: "text-slate-500",
    bg: "bg-slate-50 border-slate-200",
    icon: HelpCircle,
  },
};

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function fmt1(v: number | null): string {
  return v !== null ? v.toFixed(1) : "—";
}
function fmt0(v: number | null): string {
  return v !== null ? Math.round(v).toLocaleString() : "—";
}
function fmtSigned1(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}
function fmtSignedKcal(v: number | null): string {
  if (v === null) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${Math.round(v).toLocaleString()}`;
}

function qualityScoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600";
  if (score >= 70) return "text-amber-600";
  return "text-rose-600";
}

// ─── 統計セクション (左列) ───────────────────────────────────────────────────

function StatRow({
  label,
  value,
  unit,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className={`text-right text-sm font-semibold tabular-nums ${valueColor ?? "text-slate-800"}`}>
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-slate-400">{unit}</span>}
        {sub && <span className="ml-1 text-xs font-normal text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-slate-400">{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        {children}
      </span>
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function WeeklyReviewCard({ data, phase, enrichedAvailability }: Props) {
  const isCut = phase !== "Bulk";
  const stCfg = STAGNATION_CONFIG[data.stagnation.level];
  const StIcon = stCfg.icon;

  const { weight, nutrition, tdee, quality, findings } = data;

  // 体重トレンドアイコン
  const TrendIcon =
    weight.trendKgPerWeek === null || Math.abs(weight.trendKgPerWeek) < 0.05
      ? Minus
      : weight.trendKgPerWeek < 0
      ? TrendingDown
      : TrendingUp;

  const trendColor =
    weight.trendKgPerWeek === null
      ? "text-slate-400"
      : (isCut ? weight.trendKgPerWeek < 0 : weight.trendKgPerWeek > 0)
      ? "text-emerald-600"
      : "text-rose-600";

  // バランス色
  const balanceColor =
    tdee.balancePerDay === null
      ? "text-slate-400"
      : Math.abs(tdee.balancePerDay) < 100
      ? "text-slate-500"
      : tdee.balancePerDay < 0
      ? isCut
        ? "text-emerald-600"
        : "text-amber-600"
      : isCut
      ? "text-rose-600"
      : "text-emerald-600";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* ── ヘッダー ── */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-slate-500" />
          <span className="text-sm font-bold text-slate-700">直近7日サマリー</span>
          <span className="text-xs text-slate-400">{data.weekLabel}</span>
        </div>
        <span
          className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${stCfg.color} ${stCfg.bg}`}
        >
          <StIcon size={11} />
          {stCfg.label}
        </span>
      </div>

      {/* ── 本体 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* ── 左列: 数値統計 ── */}
        <div className="space-y-5 border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
          {/* 体重 */}
          <div>
            <SectionLabel icon={<TrendIcon size={12} className={trendColor} />}>
              体重
            </SectionLabel>
            <div className="space-y-0.5">
              <StatRow label="今週平均" value={fmt1(weight.avg)} unit="kg" />
              <StatRow
                label="前週比"
                value={`${fmtSigned1(weight.change)} kg`}
                valueColor={
                  weight.change === null
                    ? "text-slate-400"
                    : (isCut ? weight.change < -0.05 : weight.change > 0.05)
                    ? "text-emerald-600"
                    : (isCut ? weight.change > 0.05 : weight.change < -0.05)
                    ? "text-rose-600"
                    : "text-slate-500"
                }
              />
              <StatRow
                label="14日トレンド"
                value={`${fmtSigned1(weight.trendKgPerWeek)} kg/週`}
                valueColor={trendColor}
              />
            </div>
          </div>

          {/* 栄養 (カロリー・タンパク質のみ。詳細は栄養ページ) */}
          <div>
            <SectionLabel icon={<Flame size={12} className="text-orange-400" />}>
              栄養 ({data.nutrition.daysLogged} 日分)
            </SectionLabel>
            <div className="space-y-0.5">
              <StatRow label="カロリー" value={fmt0(nutrition.avgCalories)} unit="kcal" />
              <StatRow
                label="タンパク質比"
                value={nutrition.proteinRatioPct !== null ? `${nutrition.proteinRatioPct.toFixed(0)}%` : "—"}
                sub={nutrition.avgProtein !== null ? `(${fmt0(nutrition.avgProtein)}g)` : undefined}
                valueColor={
                  nutrition.proteinRatioPct !== null
                    ? nutrition.proteinRatioPct >= 25
                      ? "text-emerald-600"
                      : "text-amber-600"
                    : undefined
                }
              />
            </div>
          </div>

          {/* エネルギーバランス (差のみ。詳細は TDEE ページ) */}
          <div>
            <SectionLabel icon={<Beef size={12} className="text-violet-400" />}>
              エネルギーバランス
            </SectionLabel>
            <div className="space-y-0.5">
              <StatRow
                label="摂取 − 推定TDEE"
                value={`${fmtSignedKcal(tdee.balancePerDay)} kcal/日`}
                valueColor={balanceColor}
              />
            </div>
            {enrichedAvailability && enrichedAvailability.status !== "fresh" && (
              <div className="mt-1">
                <AnalyticsStatusNote
                  availability={enrichedAvailability}
                  unavailableLabel="ML バッチ（enrich.py）実行で TDEE が表示されます"
                />
              </div>
            )}
          </div>

          {/* 特殊日サマリー */}
          {data.specialDays.totalTaggedDays > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                今週の特殊日
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.specialDays.cheatDays > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DAY_TAG_BADGE_COLORS.is_cheat_day}`}>
                    {DAY_TAG_LABELS.is_cheat_day} {data.specialDays.cheatDays}日
                  </span>
                )}
                {data.specialDays.refeedDays > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DAY_TAG_BADGE_COLORS.is_refeed_day}`}>
                    {DAY_TAG_LABELS.is_refeed_day} {data.specialDays.refeedDays}日
                  </span>
                )}
                {data.specialDays.eatingOutDays > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DAY_TAG_BADGE_COLORS.is_eating_out}`}>
                    {DAY_TAG_LABELS.is_eating_out} {data.specialDays.eatingOutDays}日
                  </span>
                )}
                {data.specialDays.poorSleepDays > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DAY_TAG_BADGE_COLORS.is_poor_sleep}`}>
                    {DAY_TAG_LABELS.is_poor_sleep} {data.specialDays.poorSleepDays}日
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 右列: 所見 ── */}
        <div className="p-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            所見
          </p>
          {findings.length > 0 ? (
            <ul className="space-y-2.5">
              {findings.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                  <span className="mt-0.5 shrink-0 text-slate-300">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">所見を生成するにはデータが必要です</p>
          )}

          {/* 品質補足 (stagnation.qualityNote) */}
          {data.stagnation.qualityNote && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠ {data.stagnation.qualityNote}
            </div>
          )}
        </div>
      </div>

      {/* ── フッター ── */}
      <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50 px-5 py-2 text-[11px] text-slate-400">
        <span>ローリング集計（今日を含む直近7暦日）/ トレンドは直近14暦日の線形回帰 / あくまで推定値</span>
        <span className={`font-semibold ${qualityScoreColor(quality.score)}`}>
          品質 {quality.score}/100
        </span>
      </div>
    </div>
  );
}
