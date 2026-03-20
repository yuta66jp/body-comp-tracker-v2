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
import { calcGoalStatus, calcKcalCorrection } from "@/lib/utils/calcReadiness";
import type { MonthlyGoalProgress } from "@/lib/utils/calcMonthlyGoalProgress";

interface GoalNavigatorProps {
  metrics: ReadinessMetrics;
  /** "Cut" | "Bulk" — settings.current_phase */
  phase: string;
  goalWeight: number | null;
  contestDate: string | null;
  /** 直近の推定 TDEE (kcal). 表示参考値として利用 */
  avgTdee: number | null;
  /** 今月目標に対する進捗 (calcMonthlyGoalProgress の結果) */
  monthlyGoalProgress: MonthlyGoalProgress;
}

// ─── ステータス表示マップ ──────────────────────────────────────────────────

const STATUS_CONFIG = {
  achieved: {
    label: "目標達成",
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
  },
  on_track: {
    label: "順調",
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
  },
  adjust: {
    label: "要調整",
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    icon: CircleDot,
  },
  behind: {
    label: "遅れ気味",
    color: "text-rose-600",
    bg: "bg-rose-50 border-rose-200",
    icon: AlertTriangle,
  },
  no_contest: {
    label: "大会日未設定",
    color: "text-slate-500",
    bg: "bg-slate-50 border-slate-200",
    icon: HelpCircle,
  },
  unknown: {
    label: "データ不足",
    color: "text-slate-400",
    bg: "bg-slate-50 border-slate-200",
    icon: HelpCircle,
  },
} as const;

// ─── 今月目標進捗 状態表示マップ ─────────────────────────────────────────────

const MONTHLY_STATE_CONFIG = {
  achieved:           { label: "今月達成済", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  on_track:           { label: "計画内",     color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  slightly_behind:    { label: "やや遅れ",   color: "text-amber-600",   bg: "bg-amber-50 border-amber-200"   },
  replan_recommended: { label: "再計画推奨", color: "text-rose-600",    bg: "bg-rose-50 border-rose-200"     },
  unavailable:        { label: "データ不足", color: "text-slate-400",   bg: "bg-slate-50 border-slate-200"   },
} as const;

// ─── ヘルパー関数 ────────────────────────────────────────────────────────────

function fmt1(v: number | null, fallback = "—"): string {
  return v !== null ? v.toFixed(1) : fallback;
}

function fmtRate2W(v: number | null, fallback = "—"): string {
  if (v === null) return fallback;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)} kg/2週`;
}

function fmtKcal(v: number | null, fallback = "—"): string {
  if (v === null) return fallback;
  return `${v > 0 ? "+" : ""}${v.toLocaleString()} kcal/日`;
}

/** 差の符号をわかりやすくラベル化 (kg/2週) */
function paceGapLabel(gap: number | null, isCut: boolean): string {
  if (gap === null) return "—";
  const abs = Math.abs(gap).toFixed(2);
  if (Math.abs(gap) < 0.04) return "ほぼ一致";
  // Cut: gap > 0 = 遅れ, gap < 0 = 先行
  // Bulk: gap < 0 = 遅れ, gap > 0 = 先行
  const isBehind = isCut ? gap > 0 : gap < 0;
  return `${gap > 0 ? "+" : ""}${abs} kg/2週 (${isBehind ? "遅れ" : "先行"})`;
}

// ─── サブセクション ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
      {children}
    </p>
  );
}

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
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className={`text-right font-semibold tabular-nums ${valueColor ?? "text-slate-800"}`}>
        {value}
        {note && <span className="ml-1 text-[10px] font-normal text-slate-400">{note}</span>}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="hidden sm:block w-px bg-slate-100 self-stretch" />;
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
  const absGap = Math.abs(paceGap).toFixed(2);
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
  avgTdee,
  monthlyGoalProgress,
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
  const requiredRateKg2W =
    remainingKg !== null && daysLeft2W !== null && daysLeft2W > 0
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

  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;

  // ── 設定欠落フォールバック ──
  const missingGoal = goalWeight === null;

  // ── kcal 表示の補足 ──
  // avgTdee があれば推奨摂取量も計算
  const recommendedIntake =
    avgTdee !== null && kcalCorrection !== null
      ? Math.round(avgTdee + kcalCorrection)
      : null;

  return (
    <div className={`rounded-2xl border bg-white shadow-sm overflow-hidden`}>
      {/* ── ヘッダー ── */}
      <div className={`flex items-center justify-between border-b px-5 py-3 ${statusCfg.bg}`}>
        <div className="flex items-center gap-2">
          <Gauge size={16} className={statusCfg.color} />
          <span className="text-sm font-bold text-slate-700">目標達成ナビ</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              isCut
                ? "bg-blue-100 text-blue-700"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {phase}
          </span>
          <span
            className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusCfg.color} ${statusCfg.bg}`}
          >
            <StatusIcon size={11} />
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* ── 本体: 3 列 ── */}
      <div className="grid grid-cols-1 gap-0 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {/* ─── 列1: 体重進捗 ─── */}
        <div className="flex flex-col gap-1.5 p-5">
          <SectionLabel>
            <Target size={11} className="inline mr-1" />
            体重進捗
          </SectionLabel>

          {missingGoal ? (
            <p className="text-xs text-slate-400">目標体重が未設定です</p>
          ) : (
            <>
              <MetricRow
                label={`現在 (${refWeightLabel})`}
                value={`${fmt1(refWeight)} kg`}
                valueColor="text-slate-900"
              />
              <MetricRow label="目標" value={`${fmt1(goalWeight)} kg`} />
              <div className="my-1 border-t border-slate-100" />
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
        <div className="flex flex-col gap-1.5 border-t border-slate-100 p-5 sm:border-t-0">
          <SectionLabel>
            {actualRateKg2W !== null && actualRateKg2W < 0 ? (
              <TrendingDown size={11} className="inline mr-1" />
            ) : (
              <TrendingUp size={11} className="inline mr-1" />
            )}
            ペース分析
          </SectionLabel>

          <MetricRow
            label="必要ペース"
            value={fmtRate2W(requiredRateKg2W)}
            valueColor={requiredRateKg2W === null ? "text-slate-400" : "text-slate-700"}
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
          <div className="my-1 border-t border-slate-100" />
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
        </div>

        <Divider />

        {/* ─── 列3: 調整提案 ─── */}
        <div className="flex flex-col gap-1.5 border-t border-slate-100 p-5 sm:border-t-0">
          <SectionLabel>
            <Utensils size={11} className="inline mr-1" />
            調整提案
          </SectionLabel>

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
                  value={`${recommendedIntake.toLocaleString()} kcal`}
                  valueColor="text-slate-700"
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
                  value={`${recommendedIntake.toLocaleString()} kcal`}
                  valueColor="text-slate-700"
                />
              )}
            </>
          )}
          {kcalCorrection === null && !missingGoal && (
            <p className="text-xs text-slate-400">
              ペースデータが蓄積されると表示されます
            </p>
          )}
          {missingGoal && (
            <p className="text-xs text-slate-400">目標体重が未設定です</p>
          )}

          {/* 理由の一行説明 */}
          <div className="mt-auto pt-2">
            <p className="text-[11px] leading-relaxed text-slate-400">
              {buildReasonLabel(paceGap, kcalCorrection, isCut)}
            </p>
          </div>
        </div>
      </div>

      {/* ── 今月目標進捗 ── */}
      {monthlyGoalProgress.state !== "unavailable" && (
        <div className="border-t border-slate-100 px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {/* セクションラベル + 状態バッジ */}
            <div className="flex items-center gap-2 shrink-0">
              <CalendarDays size={12} className="text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                今月目標進捗
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  MONTHLY_STATE_CONFIG[monthlyGoalProgress.state].color
                } ${MONTHLY_STATE_CONFIG[monthlyGoalProgress.state].bg}`}
              >
                {MONTHLY_STATE_CONFIG[monthlyGoalProgress.state].label}
              </span>
            </div>

            {/* 今月末目標 */}
            <span className="text-xs text-slate-500">
              今月末目標:{" "}
              <span className="font-semibold text-slate-700 tabular-nums">
                {monthlyGoalProgress.monthlyTargetWeight?.toFixed(1) ?? "—"} kg
              </span>
            </span>

            {/* 差分 */}
            {monthlyGoalProgress.deltaKg !== null && (
              <span className="text-xs text-slate-500">
                差分:{" "}
                <span
                  className={`font-semibold tabular-nums ${
                    monthlyGoalProgress.state === "achieved"
                      ? "text-emerald-600"
                      : Math.abs(monthlyGoalProgress.deltaKg) < 0.5
                      ? "text-slate-700"
                      : isCut && monthlyGoalProgress.deltaKg > 0
                      ? "text-rose-600"
                      : !isCut && monthlyGoalProgress.deltaKg < 0
                      ? "text-amber-600"
                      : "text-slate-700"
                  }`}
                >
                  {monthlyGoalProgress.deltaKg > 0 ? "+" : ""}
                  {monthlyGoalProgress.deltaKg.toFixed(2)} kg
                </span>
              </span>
            )}

            {/* 残必要ペース */}
            {monthlyGoalProgress.requiredPaceKgPerWeek !== null && (
              <span className="text-xs text-slate-500">
                残必要ペース:{" "}
                <span className="font-semibold tabular-nums text-slate-700">
                  {monthlyGoalProgress.requiredPaceKgPerWeek > 0 ? "+" : ""}
                  {monthlyGoalProgress.requiredPaceKgPerWeek.toFixed(2)} kg/週
                </span>
                <span className="ml-1 text-[10px] text-slate-400">
                  (残{monthlyGoalProgress.daysToMonthEnd}日)
                </span>
              </span>
            )}

            {/* 警告あり補足 */}
            {monthlyGoalProgress.hasWarnings && (
              <span className="text-[10px] text-amber-500">⚠ 計画に警告あり</span>
            )}
          </div>
        </div>
      )}

      {/* ── フッター注記 ── */}
      <div className="border-t border-slate-50 bg-slate-50 px-5 py-2 text-[11px] text-slate-400">
        体重は 7 日移動平均を基準値として使用 / ペースは 14 日線形回帰・kg/2週 表示 / 推定値のため目安としてご利用ください
      </div>
    </div>
  );
}
