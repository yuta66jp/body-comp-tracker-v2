"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { getFeatureLabel, getFeatureDirection, getFeatureNote } from "@/lib/utils/featureLabels";

interface FactorEntry {
  label: string;
  importance: number;
  pct: number;
}

interface FactorMeta {
  sample_count: number;
  date_from: string | null;
  date_to: string | null;
  total_rows: number;
  dropped_count?: number;
}

interface FactorAnalysisProps {
  data: Record<string, FactorEntry>;
  updatedAt: string;
  meta?: FactorMeta | null;
}

// 重要度が高い順に青を濃くする（色だけで判断させない、位置との整合を取る）
const IMPORTANCE_COLORS = ["#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"];

/** サンプル数から参考度を判定する */
function confidenceLevel(sampleCount: number): "high" | "medium" | "low" {
  if (sampleCount >= 60) return "high";
  if (sampleCount >= 30) return "medium";
  return "low";
}

const CONFIDENCE_CFG = {
  high:   { label: "参考度: 高",   className: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  medium: { label: "参考度: 中",   className: "text-amber-700  bg-amber-50  border-amber-200"   },
  low:    { label: "参考度: 低め", className: "text-rose-600   bg-rose-50   border-rose-200"     },
};

function formatDateRange(from: string | null, to: string | null): string {
  if (!from || !to) return "不明";
  return `${from} 〜 ${to}`;
}

/** 分析前提情報エリア（Phase 5-A） */
function AnalysisPremise({ meta }: { meta: FactorMeta | null | undefined }) {
  if (!meta) {
    return (
      <div className="mb-5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <p className="text-xs font-semibold text-gray-500">分析前提</p>
        <p className="mt-1 text-xs text-gray-400">
          前提情報が未取得です。ML バッチ（analyze.py）を再実行すると表示されます。
        </p>
      </div>
    );
  }

  const level = confidenceLevel(meta.sample_count);
  const cfg = CONFIDENCE_CFG[level];
  const dropped = meta.dropped_count ?? null;

  return (
    <div className="mb-5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-500">分析前提</p>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cfg.className}`}>
          {cfg.label}
        </span>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-gray-400">分析対象</dt>
          <dd className="font-medium text-gray-700">翌日体重との関連</dd>
        </div>
        <div>
          <dt className="text-gray-400">使用サンプル</dt>
          <dd className="font-medium text-gray-700">{meta.sample_count} 日分</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-gray-400">対象期間</dt>
          <dd className="font-medium text-gray-700">{formatDateRange(meta.date_from, meta.date_to)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-gray-400">特徴量・除外条件</dt>
          <dd className="font-medium text-gray-700">
            カロリー・P/F/C（体重・栄養素のいずれかが未記録の日を除外
            {dropped !== null && dropped > 0 ? `、${dropped}日除外` : ""}）
          </dd>
        </div>
      </dl>

      {level === "low" && (
        <p className="mt-2.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
          サンプル数が少ないため参考度は低めです。記録を継続すると精度が上がります（目安: 30日以上）。
        </p>
      )}
    </div>
  );
}

/** 説明表（グラフの補助情報） */
function FactorTable({
  rows,
}: {
  rows: Array<{ key: string; label: string; pct: number; rank: number }>;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="pb-2 text-left font-medium text-gray-400 w-8">#</th>
            <th className="pb-2 text-left font-medium text-gray-400">特徴量</th>
            <th className="pb-2 text-right font-medium text-gray-400 w-16">重要度</th>
            <th className="pb-2 text-left font-medium text-gray-400 pl-4 hidden sm:table-cell">傾向（目安）</th>
            <th className="pb-2 text-left font-medium text-gray-400 pl-4 hidden md:table-cell">補足</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const direction = getFeatureDirection(row.key);
            const note = getFeatureNote(row.key);
            // 重要度に応じた文字色
            const pctColor =
              row.pct >= 30 ? "text-blue-800 font-bold"
              : row.pct >= 15 ? "text-blue-600 font-semibold"
              : "text-gray-600";

            return (
              <tr key={row.key} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-2 text-gray-400">{row.rank}</td>
                <td className="py-2 font-medium text-gray-700">{row.label}</td>
                <td className={`py-2 text-right tabular-nums ${pctColor}`}>{row.pct}%</td>
                <td className="py-2 pl-4 text-gray-500 hidden sm:table-cell">
                  {direction ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2 pl-4 text-gray-400 hidden md:table-cell">
                  {note ?? <span className="text-gray-300">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FactorAnalysis({ data, updatedAt, meta }: FactorAnalysisProps) {
  // 重要度の高い順に並べ、キーを保持しつつラベルを解決する
  const sorted = Object.entries(data)
    .sort(([, a], [, b]) => b.importance - a.importance)
    .map(([key, entry], i) => ({
      key,
      rank: i + 1,
      label: getFeatureLabel(key, entry.label),
      importance: entry.importance,
      pct: entry.pct,
    }));

  const chartData = sorted.map((d) => ({
    name: d.label,
    pct: d.pct,
  }));

  // グラフの高さはデータ数に応じて調整（1行あたり 38px 確保）
  const chartHeight = Math.max(160, sorted.length * 38);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      {/* ヘッダー */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-700">AI 因子分析（XGBoost）</h2>
          <p className="mt-0.5 text-xs text-gray-400">翌日体重に最も影響を与えている栄養素</p>
        </div>
        <p className="text-xs text-gray-300">{updatedAt.slice(0, 10)} 更新</p>
      </div>

      {/* 上段: 分析前提情報 */}
      <AnalysisPremise meta={meta} />

      {/* 中段: 横棒グラフ（重要度が高い順、上が1位） */}
      <p className="mb-2 text-xs text-gray-400">重要度（%）— 高い順</p>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 50, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
          <Tooltip formatter={(v: any) => [`${v}%`, "重要度（相対値）"]} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="pct" position="right" formatter={(v: any) => `${v}%`} style={{ fontSize: 11, fill: "#6b7280" }} />
            {chartData.map((_, i) => (
              <Cell key={i} fill={IMPORTANCE_COLORS[i % IMPORTANCE_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* 下段: 説明表 */}
      <FactorTable rows={sorted} />

      {/* 注意書き */}
      <p className="mt-4 text-xs text-gray-400">
        ※ 重要度は XGBoost の特徴量ゲインに基づく相対値（合計 100%）。
        傾向は栄養学的ドメイン知識による目安であり、統計的因果を意味しません。
      </p>
    </div>
  );
}
