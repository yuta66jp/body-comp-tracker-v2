/**
 * GoalNavigator — 目標達成ナビ
 *
 * KpiCards の「パッと見」カードを補完し、
 * 「このままで大会に間に合うか」を判断できるパネル。
 *
 * Server Component (状態・イベントなし)
 *
 * 設計方針:
 *   - 基準体重には weight_7d_avg を優先 (単日ノイズ排除)
 *   - 必要ペースも 7d avg ベースで再計算してペース差と一致させる
 *   - 実績ペースは calcReadiness の weekly_rate_kg (14日線形回帰)
 *   - ステータス判定・kcal補正は calcReadiness エクスポートの純粋関数を使う
 *   - 残り日数 / 残り週数 / 大会日付は KpiCards 側に集約
 */

import {
  TrendingDown,
  TrendingUp,
  Target,
  Gauge,
  Utensils,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  HelpCircle,
  CalendarDays,
} from "lucide-react";
import type { ReadinessMetrics } from "@/lib/utils/calcReadiness";
import { calcGoalStatus, calcKcalCorrection, PACE_CALC_MIN_DAYS } from "@/lib/utils/calcReadiness";
import type { MonthlyGoalProgress } from "@/lib/utils/calcMonthlyGoalProgress";
import { SectionLabel } from "@/components/ui/SectionLabel";

interface GoalNavigatorProps {
  metrics: ReadinessMetrics;
  /** "Cut" | "Bulk" — settings.current_phase */
  phase: string;
  goalWeight: number | null;
  contestDate: string | null;
  /** 直近 7 暦日の平均摂取カロリー (kcal/日). 目標摂取の算出基準 */
  avgCalories: number | null;
  /** 今月目標に対する進捗 (calcMonthlyGoalProgress の結果) */
  monthlyGoalProgress: MonthlyGoalProgress;
  /** 当月内の最小実測体重 (kg) */
  currentMonthMinWeight?: number | null;
}

// ─── ステータス表示マップ ──────────────────────────────────────────────────

const STATUS_CONFIG = {
  achieved: {
    label: "目標達成",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700/50",
    icon: CheckCircle2,
  },
  on_track: {
    label: "順調",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700/50",
    icon: CheckCircle2,
  },
  adjust: {
    label: "要調整",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700/50",
    icon: CircleDot,
  },
  behind: {
    label: "遅れ気味",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 border-rose-200 dark:bg-rose-900/30 dark:border-rose-700/50",
    icon: AlertTriangle,
  },
  no_contest: {
    label: "", // phase に応じて動的に上書き (see getStatusLabel)
    color: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-600",
    icon: HelpCircle,
  },
  contest_imminent: {
    label: "", // phase に応じて動的に上書き (see getStatusLabel)
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-600",
    icon: CalendarDays,
  },
  unknown: {
    label: "データ不足",
    color: "text-slate-400 dark:text-slate-500",
    bg: "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-600",
    icon: HelpCircle,
  },
} as const;

// ─── 今月目標進捗 状態表示マップ ─────────────────────────────────────────────

const MONTHLY_STATE_CONFIG = {
  achieved:           { label: "今月達成済", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700/50" },
  on_track:           { label: "計画内",     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700/50" },
  slightly_behind:    { label: "やや遅れ",   color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700/50"         },
  replan_recommended: { label: "再計画推奨", color: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-50 border-rose-200 dark:bg-rose-900/30 dark:border-rose-700/50"             },
  unavailable:        { label: "データ不足", color: "text-slate-400 dark:text-slate-500",     bg: "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-600"               },
} as const;

// ─── ヘルパー関数 ────────────────────────────────────────────────────────────

function fmt1(v: number | null, fallback = "—"): string {
  return v !== null ? v.toFixed(1) : fallback;
}

function fmtRate2W(v: number | null, fallback = "—"): string {
  if (v === null) return fallback;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)} kg/2週`;
}

function fmtKcal(v: number | null, fallback = "—"): string {
  if (v === null) return fallback;
  return `${v > 0 ? "+" : ""}${v.toLocaleString()} kcal/日`;
}

/** 差の符号をわかりやすくラベル化 (kg/2週) */
function paceGapLabel(gap: number | null, isCut: boolean): string {
  if (gap === null) return "—";
  const abs = Math.abs(gap).toFixed(1);
  if (Math.abs(gap) < 0.04) return "ほぼ一致";
  // Cut: gap > 0 = 遅れ, gap < 0 = 先行
  // Bulk: gap < 0 = 遅れ, gap > 0 = 先行
  const isBehind = isCut ? gap > 0 : gap < 0;
  return `${gap > 0 ? "+" : ""}${abs} kg/2週 (${isBehind ? "遅れ" : "先行"})`;
}

// ─── サブセクション ─────────────────────────────────────────────────────────


function MetricRow({
  label,
  value,
  valueColor,
  note,
}: {
  label: string;
  value: string;
  valueColor?: string;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-right font-semibold tabular-nums ${valueColor ?? "text-slate-800 dark:text-slate-300"}`}>
        {value}
        {note && <span className="ml-1 text-[10px] font-normal text-slate-400 dark:text-slate-500">{note}</span>}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="hidden sm:block w-px bg-slate-100 self-stretch dark:bg-slate-700" />;
}

/** 調整提案の理由を一行で生成 */
function buildReasonLabel(
  paceGap: number | null,
  kcalCorrection: number | null,
  isCut: boolean
): string {
  if (kcalCorrection === null) {
    return "データ不足のため、推奨調整は参考値として扱ってください";
  }
  if (Math.abs(kcalCorrection) < 50) {
    return "現状ペースが必要ペースを満たしているため、現状維持を推奨";
  }
  if (paceGap === null) {
    return "ペース差を算出できません";
  }
  const isBehind = isCut ? paceGap > 0 : paceGap < 0;
  const absGap = Math.abs(paceGap).toFixed(1);
  if (isBehind) {
    return `必要ペースより ${absGap} kg/2週 遅いため、${kcalCorrection < 0 ? "" : "+"}${kcalCorrection.toLocaleString()} kcal/日 を推奨`;
  } else {
    return `目標に対して ${absGap} kg/2週 先行しているため、調整は最小限でよい`;
  }
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function GoalNavigator({
  metrics,
  phase,
  goalWeight,
  avgCalories,
  monthlyGoalProgress,
  currentMonthMinWeight,
}: GoalNavigatorProps) {
  const isCut = phase !== "Bulk";

  // ── 基準体重: 7日平均 優先、なければ単日最新 ──
  const refWeight = metrics.weight_7d_avg ?? metrics.current_weight;
  const refWeightLabel = metrics.weight_7d_avg !== null ? "7日平均" : "最新値";

  // ── 7d avg ベースで必要ペース・残りを再計算 (kg/2週) ──
  const remainingKg =
    refWeight !== null && goalWeight !== null ? refWeight - goalWeight : null;

  // 必要ペース: calcReadiness の required_rate_kg_per_2weeks を参照
  // ただし 7d avg ベースで再計算（calcReadiness は current_weight ベース）
  const daysLeft2W = metrics.days_to_contest;

  // 大会直前フラグ: PACE_CALC_MIN_DAYS 未満では週次ペースが非現実的な値になるため算出しない
  const isTooCloseToContest =
    daysLeft2W !== null && daysLeft2W >= 0 && daysLeft2W < PACE_CALC_MIN_DAYS;

  const requiredRateKg2W =
    remainingKg !== null && daysLeft2W !== null && daysLeft2W >= PACE_CALC_MIN_DAYS
      ? (-remainingKg / daysLeft2W) * 14
      : null;

  // ── 実績ペース (kg/2週) ──
  const actualRateKg2W = metrics.weekly_rate_kg_per_2weeks;

  // ── ペース差 (actual - required): 正=遅れ(Cut), 正=先行(Bulk) によって意味が変わる ──
  // kg/2週 ベースで統一: 比較の単位を揃えることで誤判定を防ぐ
  const paceGap =
    actualRateKg2W !== null && requiredRateKg2W !== null
      ? actualRateKg2W - requiredRateKg2W
      : null;

  // ── kcal 補正 (calcKcalCorrection は kg/週ベース引数を期待するため週次換算して渡す) ──
  const actualRateKgWeek = metrics.weekly_rate_kg;
  const requiredRateKgWeek =
    requiredRateKg2W !== null ? requiredRateKg2W / 2 : null;
  const kcalCorrection = calcKcalCorrection(actualRateKgWeek, requiredRateKgWeek);

  // ── ステータス (kg/2週 ベースで統一して渡す) ──
  const status = calcGoalStatus(
    actualRateKg2W,
    requiredRateKg2W,
    remainingKg,
    metrics.days_to_contest
  );

  const deadlineLabel = isCut ? "大会日" : "目標日";

  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;
  // no_contest / contest_imminent ラベルは phase によって異なるため動的に解決する
  const statusLabel =
    status === "no_contest"
      ? `${deadlineLabel}未設定`
      : status === "contest_imminent"
      ? `${deadlineLabel}直前`
      : statusCfg.label;

  // ── 設定欠落フォールバック ──
  const missingGoal = goalWeight === null;

  // ── kcal 表示の補足 ──
  // 現在の平均摂取カロリー + 推奨調整 で目標摂取を算出
  const recommendedIntake =
    avgCalories !== null && kcalCorrection !== null
      ? Math.round(avgCalories + kcalCorrection)
      : null;

  return (
    <div className={`rounded-2xl border bg-white shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-900 dark:shadow-none`}>
      {/* ── ヘッダー ── */}
      <div className={`flex items-center justify-between border-b px-5 py-3 ${statusCfg.bg}`}>
        <div className="flex items-center gap-2">
          <Gauge size={16} className={statusCfg.color} />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">目標達成ナビ</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              isCut
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
            }`}
          >
            {phase}
          </span>
          <span
            className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusCfg.color} ${statusCfg.bg}`}
          >
            <StatusIcon size={11} />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* ── 本体: 3 列 ── */}
      <div className="grid grid-cols-1 gap-0 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {/* ─── 列1: 体重進捗 ─── */}
        <div className="flex flex-col gap-1.5 p-5">
          <SectionLabel icon={<Target size={11} />}>体重進捗</SectionLabel>

          {missingGoal ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">目標体重が未設定です</p>
          ) : (
            <>
              <MetricRow
                label={`現在 (${refWeightLabel})`}
                value={`${fmt1(refWeight)} kg`}
                valueColor="text-slate-900 dark:text-slate-300"
              />
              <MetricRow label="目標" value={`${fmt1(goalWeight)} kg`} />
              <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
              <MetricRow
                label="残り"
                value={
                  remainingKg !== null
                    ? `${remainingKg > 0 ? "" : "+"}${(-remainingKg).toFixed(1)} kg`
                    : "—"
                }
                valueColor={
                  remainingKg === null
                    ? "text-slate-400"
                    : Math.abs(remainingKg) < 0.2
                    ? "text-emerald-600"
                    : isCut && remainingKg > 0
                    ? "text-rose-600"
                    : !isCut && remainingKg < 0
                    ? "text-amber-600"
                    : "text-slate-700"
                }
                note={
                  remainingKg !== null && remainingKg > 0 && isCut
                    ? "減量必要"
                    : remainingKg !== null && remainingKg < 0 && !isCut
                    ? "増量必要"
                    : undefined
                }
              />
            </>
          )}
        </div>

        <Divider />

        {/* ─── 列2: ペース分析 ─── */}
        <div className="flex flex-col gap-1.5 border-t border-slate-100 p-5 sm:border-t-0 dark:border-slate-700">
          <SectionLabel
            icon={
              actualRateKg2W !== null && actualRateKg2W < 0
                ? <TrendingDown size={11} />
                : <TrendingUp size={11} />
            }
          >
            ペース分析
          </SectionLabel>

          <MetricRow
            label="必要ペース"
            value={fmtRate2W(requiredRateKg2W)}
            valueColor={requiredRateKg2W === null ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-300"}
            note={requiredRateKg2W !== null ? "(7日平均ベース)" : undefined}
          />
          <MetricRow
            label="実績ペース"
            value={fmtRate2W(actualRateKg2W)}
            valueColor={
              actualRateKg2W === null
                ? "text-slate-400"
                : (isCut ? actualRateKg2W < 0 : actualRateKg2W > 0)
                ? "text-emerald-600"
                : "text-rose-600"
            }
            note="(14日線形)"
          />
          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
          <MetricRow
            label="差"
            value={paceGapLabel(paceGap, isCut)}
            valueColor={
              paceGap === null
                ? "text-slate-400"
                : Math.abs(paceGap) < 0.02
                ? "text-slate-500"
                : (isCut ? paceGap > 0 : paceGap < 0)
                ? "text-rose-600"
                : "text-emerald-600"
            }
          />
          {/* 大会直前 fallback: PACE_CALC_MIN_DAYS 未満では週次ペース算出不可 */}
          {isTooCloseToContest && (
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {deadlineLabel}まで {daysLeft2W} 日のためペース算出なし
            </p>
          )}
        </div>

        <Divider />

        {/* ─── 列3: 調整提案 ─── */}
        <div className="flex flex-col gap-1.5 border-t border-slate-100 p-5 sm:border-t-0 dark:border-slate-700">
          <SectionLabel icon={<Utensils size={11} />}>調整提案</SectionLabel>

          {kcalCorrection !== null && Math.abs(kcalCorrection) >= 50 && (
            <>
              <MetricRow
                label="推奨調整"
                value={fmtKcal(kcalCorrection)}
                valueColor={kcalCorrection < 0 ? "text-rose-600" : "text-emerald-600"}
              />
              {recommendedIntake !== null && (
                <MetricRow
                  label="目標摂取"
                  value={`${recommendedIntake.toLocaleString()} kcal/日`}
                  valueColor="text-slate-700 dark:text-slate-300"
                />
              )}
            </>
          )}
          {kcalCorrection !== null && Math.abs(kcalCorrection) < 50 && (
            <>
              <MetricRow
                label="推奨調整"
                value="現状維持"
                valueColor="text-emerald-600"
              />
              {recommendedIntake !== null && (
                <MetricRow
                  label="目標摂取"
                  value={`${recommendedIntake.toLocaleString()} kcal/日`}
                  valueColor="text-slate-700 dark:text-slate-300"
                />
              )}
            </>
          )}
          {kcalCorrection === null && !missingGoal && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              ペースデータが蓄積されると表示されます
            </p>
          )}
          {missingGoal && (
            <p className="text-xs text-slate-400 dark:text-slate-500">目標体重が未設定です</p>
          )}

          {/* 理由の一行説明 */}
          <div className="mt-auto pt-2">
            <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              {buildReasonLabel(paceGap, kcalCorrection, isCut)}
            </p>
          </div>
        </div>
      </div>

      {/* ── 今月目標進捗 ── */}
      {monthlyGoalProgress.state !== "unavailable" && (
        <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {/* セクションラベル + 状態バッジ */}
            <div className="flex items-center gap-2 shrink-0">
              <SectionLabel icon={<CalendarDays size={12} />} mb="mb-0">
                今月目標進捗
              </SectionLabel>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  MONTHLY_STATE_CONFIG[monthlyGoalProgress.state].color
                } ${MONTHLY_STATE_CONFIG[monthlyGoalProgress.state].bg}`}
              >
                {MONTHLY_STATE_CONFIG[monthlyGoalProgress.state].label}
              </span>
            </div>

            {/* 現在体重 (最新実測値) */}
            {monthlyGoalProgress.comparisonWeight !== null && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                現在:{" "}
                <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                  {monthlyGoalProgress.comparisonWeight.toFixed(1)} kg
                </span>
              </span>
            )}

            {/* 当月最小体重 */}
            {currentMonthMinWeight !== null && currentMonthMinWeight !== undefined && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                当月最小:{" "}
                <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                  {currentMonthMinWeight.toFixed(1)} kg
                </span>
              </span>
            )}

            {/* 今月末目標 */}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              今月末目標:{" "}
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                {monthlyGoalProgress.monthlyTargetWeight?.toFixed(1) ?? "—"} kg
              </span>
            </span>

            {/* 差分 */}
            {monthlyGoalProgress.deltaKg !== null && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                差分:{" "}
                <span
                  className={`font-semibold tabular-nums ${
                    monthlyGoalProgress.state === "achieved"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : Math.abs(monthlyGoalProgress.deltaKg) < 0.5
                      ? "text-slate-700 dark:text-slate-300"
                      : isCut && monthlyGoalProgress.deltaKg > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : !isCut && monthlyGoalProgress.deltaKg < 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {monthlyGoalProgress.deltaKg > 0 ? "+" : ""}
                  {monthlyGoalProgress.deltaKg.toFixed(1)} kg
                </span>
              </span>
            )}

            {/* 残必要ペース */}
            {monthlyGoalProgress.requiredPaceKgPerWeek !== null && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                残必要ペース:{" "}
                <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                  {monthlyGoalProgress.requiredPaceKgPerWeek > 0 ? "+" : ""}
                  {monthlyGoalProgress.requiredPaceKgPerWeek.toFixed(1)} kg/週
                </span>
                <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">
                  (残{monthlyGoalProgress.daysToMonthEnd}日)
                </span>
              </span>
            )}

            {/* 警告あり補足 */}
            {monthlyGoalProgress.hasWarnings && (
              <span className="text-[10px] text-amber-600">⚠ 計画に警告あり</span>
            )}
          </div>
        </div>
      )}

      {/* ── フッター注記 ── */}
      <div className="border-t border-slate-50 bg-slate-50 px-5 py-2 text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
        体重進捗は 7 日移動平均ベース / 今月進捗は最新体重ベース / ペースは 14 日線形回帰・kg/2週 表示 / 推定値のため目安としてご利用ください
      </div>
    </div>
  );
}
