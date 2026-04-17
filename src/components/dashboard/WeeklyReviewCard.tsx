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
 *   本体 2列: 左=数値統計（体重・カロリー・バランス差のみ）、右=所見カード
 *   フッター: データ品質スコア / ローリング集計の注記
 *
 * #360: 所見セクションを bullet 箇条書きから InsightCard UI に変更。
 *       モバイルでも所見を表示するよう変更（以前は lg+ のみ）。
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
  Moon,
} from "lucide-react";
import type { WeeklyReviewData, StagnationLevel } from "@/lib/utils/calcWeeklyReview";
import { DAY_TAG_LABELS, DAY_TAG_BADGE_COLORS } from "@/lib/utils/dayTags";
import { AnalyticsStatusNote } from "@/components/analytics/AnalyticsStatusNote";
import type { AnalyticsAvailability } from "@/lib/analytics/status";
import { InsightCardList } from "@/components/ui/InsightCard";
import { deriveWeeklyInsightItems } from "@/lib/utils/weeklyInsights";
import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE,
  WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE,
} from "@/lib/utils/weeklyNutritionRanges";

interface Props {
  data: WeeklyReviewData;
  phase: string;
  /** enriched_logs の新鮮さ（エネルギーバランス欄に補助注記を表示） */
  enrichedAvailability?: AnalyticsAvailability;
}

// ─── %BW/週 ペースステータス (UI 表示用) ──────────────────────────────────────
// 閾値は Helms 2014 の推奨レンジ (0.5〜1.0%BW/週) を基準とし、
// それ以外の帯は UI 解釈用の文献ベース設計値。一次文献の正式推奨値ではない。

type BWRateStatus =
  | "gaining"       // < 0.0%
  | "very_slow"     // 0.0〜0.25%
  | "slow"          // 0.25〜0.5%
  | "recommended"   // 0.5〜1.0%
  | "slightly_fast" // 1.0〜1.4%
  | "too_fast";     // ≥ 1.4%

const BW_RATE_STATUS_CONFIG: Record<
  BWRateStatus,
  { label: string; color: string }
> = {
  gaining:        { label: "増加傾向",     color: "text-rose-600 dark:text-rose-400" },
  very_slow:      { label: "かなり緩やか", color: "text-amber-600 dark:text-amber-400" },
  slow:           { label: "緩やか",       color: "text-amber-500 dark:text-amber-400" },
  recommended:    { label: "推奨レンジ",   color: "text-emerald-600 dark:text-emerald-400" },
  slightly_fast:  { label: "やや速め",     color: "text-amber-600 dark:text-amber-400" },
  too_fast:       { label: "速すぎ",       color: "text-rose-600 dark:text-rose-400" },
};

type NutritionRangeStatus = "in_range" | "low" | "high";

const NUTRITION_RANGE_STATUS_CONFIG: Record<
  NutritionRangeStatus,
  { label: string; color: string }
> = {
  in_range: { label: "推奨レンジ", color: "text-emerald-600 dark:text-emerald-400" },
  low:      { label: "やや低め",   color: "text-amber-600 dark:text-amber-400" },
  high:     { label: "高め",       color: "text-slate-500 dark:text-slate-400" },
};

const FAT_RANGE_STATUS_CONFIG: Record<
  NutritionRangeStatus,
  { label: string; color: string }
> = {
  in_range: { label: "推奨レンジ", color: "text-emerald-600 dark:text-emerald-400" },
  low:      { label: "やや低め",   color: "text-amber-600 dark:text-amber-400" },
  high:     { label: "やや高め",   color: "text-amber-600 dark:text-amber-400" },
};

// ─── 睡眠ステータス ──────────────────────────────────────────────────────────
// 一般的な目安（7〜9 時間）をベースにした UI 分類。医療判断ではない。

type SleepStatus = "short" | "ok" | "long";

const SLEEP_STATUS_CONFIG: Record<SleepStatus, { label: string; color: string }> = {
  short: { label: "短め",   color: "text-amber-600 dark:text-amber-400" },
  ok:    { label: "適正",   color: "text-emerald-600 dark:text-emerald-400" },
  long:  { label: "長め",   color: "text-slate-500 dark:text-slate-400" },
};

function calcSleepStatus(hours: number): SleepStatus {
  if (hours < 7) return "short";
  if (hours <= 9) return "ok";
  return "long";
}

function calcRangeStatus(value: number, min: number, max: number): NutritionRangeStatus {
  if (value < min) return "low";
  if (value > max) return "high";
  return "in_range";
}

function calcBwRateStatus(bwRatePct: number): BWRateStatus {
  if (bwRatePct < 0)    return "gaining";
  if (bwRatePct <= 0.25) return "very_slow";
  if (bwRatePct < 0.5)  return "slow";
  if (bwRatePct <= 1.0) return "recommended";
  if (bwRatePct < 1.4)  return "slightly_fast";
  return "too_fast";
}

// ─── 停滞バッジ設定 ──────────────────────────────────────────────────────────

const STAGNATION_CONFIG: Record<
  StagnationLevel,
  { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
> = {
  advancing: {
    label: "順調",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700/50",
    icon: CheckCircle2,
  },
  watching: {
    label: "要観察",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700/50",
    icon: CircleDot,
  },
  suspected: {
    label: "停滞疑い",
    color: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 border-rose-200 dark:bg-rose-900/30 dark:border-rose-700/50",
    icon: AlertTriangle,
  },
  data_insufficient: {
    label: "データ不足",
    color: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-600",
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
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
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
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-right text-sm font-semibold tabular-nums ${valueColor ?? "text-slate-800 dark:text-slate-300"}`}>
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-slate-400 dark:text-slate-500">{unit}</span>}
        {sub && <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">{sub}</span>}
      </span>
    </div>
  );
}


// ─── メインコンポーネント ────────────────────────────────────────────────────

export function WeeklyReviewCard({ data, phase, enrichedAvailability }: Props) {
  const isCut = phase !== "Bulk";
  const stCfg = STAGNATION_CONFIG[data.stagnation.level];
  const StIcon = stCfg.icon;

  const { weight, nutrition, tdee, sleep, quality } = data;

  // 所見カード用データを導出 (既存 findings string[] とは別に生成)
  const insightItems = deriveWeeklyInsightItems(data, phase);

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
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-slate-500 dark:text-slate-400" />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">直近7日サマリー</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{data.weekLabel}</span>
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
        <div className="space-y-5 border-b border-slate-100 p-5 lg:border-b-0 lg:border-r dark:border-slate-700">
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
              {/* %BW/週 + ペースステータス */}
              {(() => {
                const bwRate = weight.bwRatePctPerWeek;
                if (bwRate === null) return null;
                const status = calcBwRateStatus(bwRate);
                const cfg = BW_RATE_STATUS_CONFIG[status];
                return (
                  <>
                    <StatRow
                      label="%BW/週"
                      value={`${bwRate >= 0 ? "+" : ""}${bwRate.toFixed(2)}%`}
                      valueColor={cfg.color}
                    />
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">推奨レンジ 0.5〜1.0% BW/週（Helms 2014）</span>
                      <span className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* 栄養 (左列は要約値のみ。評価は右列の所見カードに寄せる) */}
          <div>
            <SectionLabel icon={<Flame size={12} className="text-orange-400" />}>
              栄養 ({data.nutrition.daysLogged} 日分)
            </SectionLabel>
            <div className="space-y-0.5">
              <StatRow label="カロリー" value={fmt0(nutrition.avgCalories)} unit="kcal" />
              <StatRow
                label="タンパク質"
                value={nutrition.proteinGPerKgBw !== null ? nutrition.proteinGPerKgBw.toFixed(2) : "—"}
                unit="g/kg BW"
                sub={nutrition.avgProtein !== null ? `(${fmt0(nutrition.avgProtein)}g)` : undefined}
              />
              {nutrition.proteinGPerKgBw !== null && (() => {
                const status = calcRangeStatus(
                  nutrition.proteinGPerKgBw,
                  WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE.min,
                  WEEKLY_REVIEW_PROTEIN_G_PER_KG_BW_RANGE.max
                );
                const cfg = NUTRITION_RANGE_STATUS_CONFIG[status];
                return (
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      推奨レンジ 1.8〜2.7 g/kg BW（Roberts et al. 2020）
                    </span>
                    <span className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                  </div>
                );
              })()}
              <StatRow
                label="脂質"
                value={nutrition.fatCaloriesRatioPct !== null ? `${nutrition.fatCaloriesRatioPct.toFixed(0)}%` : "—"}
                sub={nutrition.avgFat !== null ? `(${fmt0(nutrition.avgFat)}g)` : undefined}
              />
              {nutrition.fatCaloriesRatioPct !== null && (() => {
                const status = calcRangeStatus(
                  nutrition.fatCaloriesRatioPct,
                  WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE.min,
                  WEEKLY_REVIEW_FAT_CALORIES_RATIO_RANGE.max
                );
                const cfg = FAT_RANGE_STATUS_CONFIG[status];
                return (
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      推奨レンジ 15〜30%（Helms et al. 2014）
                    </span>
                    <span className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* エネルギーバランス (差のみ。詳細は TDEE ページ) */}
          <div>
            <SectionLabel icon={<Beef size={12} className="text-violet-400" />}>
              エネルギーバランス
            </SectionLabel>
            <div className="space-y-0.5">
              <StatRow
                label="摂取 − 推定TDEE（14日平均）"
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

          {/* 睡眠 */}
          {(sleep.avgSleepHours !== null || sleep.avgBedTime !== null || sleep.avgWakeTime !== null) && (
            <div>
              <SectionLabel icon={<Moon size={12} className="text-indigo-400" />}>
                睡眠 ({Math.max(sleep.sleepDaysLogged, sleep.timeDaysLogged)} 日分)
              </SectionLabel>
              <div className="space-y-0.5">
                {sleep.avgSleepHours !== null && (() => {
                  const status = calcSleepStatus(sleep.avgSleepHours);
                  const cfg = SLEEP_STATUS_CONFIG[status];
                  return (
                    <>
                      <StatRow
                        label="平均睡眠時間"
                        value={sleep.avgSleepHours.toFixed(1)}
                        unit="h"
                        valueColor={cfg.color}
                      />
                      <div className="flex items-center justify-between py-0.5">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          目安: 7〜9 時間
                        </span>
                        <span className={`text-[11px] font-semibold ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>
                    </>
                  );
                })()}
                {sleep.avgBedTime !== null && (
                  <StatRow
                    label="就寝"
                    value={sleep.avgBedTime}
                    sub={
                      sleep.avgBedTimeDeltaMins !== null
                        ? `(${sleep.avgBedTimeDeltaMins >= 0 ? "+" : ""}${sleep.avgBedTimeDeltaMins}分)`
                        : undefined
                    }
                  />
                )}
                {sleep.avgWakeTime !== null && (
                  <StatRow
                    label="起床"
                    value={sleep.avgWakeTime}
                    sub={
                      sleep.avgWakeTimeDeltaMins !== null
                        ? `(${sleep.avgWakeTimeDeltaMins >= 0 ? "+" : ""}${sleep.avgWakeTimeDeltaMins}分)`
                        : undefined
                    }
                  />
                )}
              </div>
            </div>
          )}

          {/* 特殊日サマリー */}
          {data.specialDays.totalTaggedDays > 0 && (
            <div>
              <SectionLabel mb="mb-1.5">今週の特殊日</SectionLabel>
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
              </div>
            </div>
          )}
        </div>

        {/* ── 右列: 所見カード ── */}
        {/*
          #360: 以前は "hidden lg:block" でモバイル非表示だったが、
          InsightCard 導入に合わせてモバイルでも表示する。
          モバイル時は border-t でセパレーターを入れ、左列の下に続く。
        */}
        <div className="border-t border-slate-100 p-5 lg:border-t-0 dark:border-slate-700">
          <SectionLabel mb="mb-3">所見</SectionLabel>
          <InsightCardList items={insightItems} />
        </div>
      </div>

      {/* ── フッター ── */}
      <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50 px-5 py-2 text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
        <span>%BW/週 = 14日線形回帰÷7日平均体重 / GoalNavigator の必要ペースは絶対量（kg/2週）/ 直近7暦日ローリング集計 / あくまで推定値</span>
        <span className={`font-semibold ${qualityScoreColor(quality.score)}`}>
          品質 {quality.score}/100
        </span>
      </div>
    </div>
  );
}
