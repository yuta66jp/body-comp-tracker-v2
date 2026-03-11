/**
 * GoalNavigator — 目標達成ナビ + 大会カウントダウン
 *
 * KpiCards の「パッと見」5枚カードを補完し、
 * 「このままで大会に間に合うか」を一体として判断できるパネル。
 *
 * Server Component (状態・イベントなし)
 *
 * 設計方針:
 *   - 基準体重には weight_7d_avg を優先 (単日ノイズ排除)
 *   - 必要ペースも 7d avg ベースで再計算してペース差と一致させる
 *   - 実績ペースは calcReadiness の weekly_rate_kg (14日線形回帰)
 *   - ステータス判定・kcal補正は calcReadiness エクスポートの純粋関数を使う
 */

import {
  TrendingDown,
  TrendingUp,
  Target,
  CalendarDays,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  HelpCircle,
} from "lucide-react";
import type { ReadinessMetrics } from "@/lib/utils/calcReadiness";
import { calcGoalStatus, calcKcalCorrection } from "@/lib/utils/calcReadiness";

interface GoalNavigatorProps {
  metrics: ReadinessMetrics;
  /** "Cut" | "Bulk" — settings.current_phase */
  phase: string;
  goalWeight: number | null;
  contestDate: string | null;
  /** 直近の推定 TDEE (kcal). 表示参考値として利用 */
  avgTdee: number | null;
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

// ─── ヘルパー関数 ────────────────────────────────────────────────────────────

function fmt1(v: number | null, fallback = "—"): string {
  return v !== null ? v.toFixed(1) : fallback;
}

function fmtRate(v: number | null, fallback = "—"): string {
  if (v === null) return fallback;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)} kg/週`;
}

function fmtKcal(v: number | null, fallback = "—"): string {
  if (v === null) return fallback;
  return `${v > 0 ? "+" : ""}${v.toLocaleString()} kcal/日`;
}

/** 差の符号をわかりやすくラベル化 */
function paceGapLabel(gap: number | null, isCut: boolean): string {
  if (gap === null) return "—";
  const abs = Math.abs(gap).toFixed(2);
  if (Math.abs(gap) < 0.02) return "ほぼ一致";
  // Cut: gap > 0 = 遅れ, gap < 0 = 先行
  // Bulk: gap < 0 = 遅れ, gap > 0 = 先行
  const isBehind = isCut ? gap > 0 : gap < 0;
  return `${gap > 0 ? "+" : ""}${abs} kg/週 (${isBehind ? "遅れ" : "先行"})`;
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

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function GoalNavigator({
  metrics,
  phase,
  goalWeight,
  contestDate,
  avgTdee,
}: GoalNavigatorProps) {
  const isCut = phase !== "Bulk";

  // ── 基準体重: 7日平均 優先、なければ単日最新 ──
  const refWeight = metrics.weight_7d_avg ?? metrics.current_weight;
  const refWeightLabel = metrics.weight_7d_avg !== null ? "7日平均" : "最新値";

  // ── 7d avg ベースで必要ペース・残りを再計算 ──
  const weeksLeft =
    metrics.days_to_contest !== null && metrics.days_to_contest > 0
      ? metrics.days_to_contest / 7
      : null;

  const remainingKg =
    refWeight !== null && goalWeight !== null ? refWeight - goalWeight : null;

  const requiredRateKg =
    remainingKg !== null && weeksLeft !== null
      ? -remainingKg / weeksLeft
      : null;

  // ── 実績ペース ──
  const actualRateKg = metrics.weekly_rate_kg;

  // ── ペース差 (actual - required): 正=遅れ(Cut), 正=先行(Bulk) によって意味が変わる ──
  const paceGap =
    actualRateKg !== null && requiredRateKg !== null
      ? actualRateKg - requiredRateKg
      : null;

  // ── kcal 補正 ──
  const kcalCorrection = calcKcalCorrection(actualRateKg, requiredRateKg);

  // ── ステータス ──
  const status = calcGoalStatus(
    actualRateKg,
    requiredRateKg,
    remainingKg,
    metrics.days_to_contest
  );

  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;

  // ── 設定欠落フォールバック ──
  const missingContest = !contestDate;
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

        {/* ─── 列2: 大会カウントダウン ─── */}
        <div className="flex flex-col gap-1.5 border-t border-slate-100 p-5 sm:border-t-0">
          <SectionLabel>
            <CalendarDays size={11} className="inline mr-1" />
            大会まで
          </SectionLabel>

          {missingContest ? (
            <p className="text-xs text-slate-400">大会日が未設定です</p>
          ) : metrics.days_to_contest !== null && metrics.days_to_contest < 0 ? (
            <p className="text-xs text-slate-400">大会日を過ぎています</p>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold leading-none tracking-tight text-violet-700">
                  {metrics.days_to_contest ?? "—"}
                </span>
                <span className="text-sm text-slate-400">日</span>
              </div>
              <p className="text-xs text-slate-500">
                {weeksLeft !== null ? `${weeksLeft.toFixed(1)} 週` : "—"}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{contestDate}</p>
            </>
          )}
        </div>

        <Divider />

        {/* ─── 列3: ペース分析 ─── */}
        <div className="flex flex-col gap-1.5 border-t border-slate-100 p-5 sm:border-t-0">
          <SectionLabel>
            {actualRateKg !== null && actualRateKg < 0 ? (
              <TrendingDown size={11} className="inline mr-1" />
            ) : (
              <TrendingUp size={11} className="inline mr-1" />
            )}
            ペース分析
          </SectionLabel>

          <MetricRow
            label="必要"
            value={fmtRate(requiredRateKg)}
            valueColor={requiredRateKg === null ? "text-slate-400" : "text-slate-700"}
            note={requiredRateKg !== null ? "(7日平均ベース)" : undefined}
          />
          <MetricRow
            label="実績"
            value={fmtRate(actualRateKg)}
            valueColor={
              actualRateKg === null
                ? "text-slate-400"
                : (isCut ? actualRateKg < 0 : actualRateKg > 0)
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

          {/* kcal 補正 */}
          {kcalCorrection !== null && Math.abs(kcalCorrection) >= 50 && (
            <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <span className="text-slate-500">推奨調整: </span>
              <span
                className={`font-bold ${
                  kcalCorrection < 0 ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {fmtKcal(kcalCorrection)}
              </span>
              {recommendedIntake !== null && (
                <span className="ml-1 text-slate-400">
                  → 目標摂取 {recommendedIntake.toLocaleString()} kcal
                </span>
              )}
            </div>
          )}
          {kcalCorrection !== null && Math.abs(kcalCorrection) < 50 && (
            <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              現在のペースを維持
            </div>
          )}
          {kcalCorrection === null && !missingContest && !missingGoal && (
            <p className="mt-2 text-[11px] text-slate-400">
              ペースデータが蓄積されると表示されます
            </p>
          )}
        </div>
      </div>

      {/* ── フッター注記 ── */}
      <div className="border-t border-slate-50 bg-slate-50 px-5 py-2 text-[11px] text-slate-400">
        体重は 7 日移動平均を基準値として使用 / ペースは 14 日線形回帰 / 推定値のため目安としてご利用ください
      </div>
    </div>
  );
}
