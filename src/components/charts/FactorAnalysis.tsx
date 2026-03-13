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
} from "recharts";

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
}

interface FactorAnalysisProps {
  data: Record<string, FactorEntry>;
  updatedAt: string;
  meta?: FactorMeta | null;
}

const BAR_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

const RANK_LABELS = ["1位", "2位", "3位", "4位", "5位"];

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

/** 分析前提情報エリア */
function AnalysisPremise({ meta }: { meta: FactorMeta | null | undefined }) {
  if (!meta) {
    // バッチ未実行など _meta がない古いキャッシュ
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
  const dropped = meta.total_rows - meta.sample_count - 1; // shift(-1) で最終行が除外される分 -1

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
            {dropped > 0 ? `、${dropped}日除外` : ""}）
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

export function FactorAnalysis({ data, updatedAt, meta }: FactorAnalysisProps) {
  const sorted = Object.values(data).sort((a, b) => b.importance - a.importance);

  const chartData = sorted.map((d) => ({
    name: d.label,
    pct: d.pct,
  }));

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-700">AI 因子分析（XGBoost）</h2>
          <p className="mt-0.5 text-xs text-gray-400">翌日体重に最も影響を与えている栄養素</p>
        </div>
        <p className="text-xs text-gray-300">{updatedAt.slice(0, 10)} 更新</p>
      </div>

      {/* 分析前提情報エリア（分析結果より先に表示） */}
      <AnalysisPremise meta={meta} />

      {/* ランキングカード */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {sorted.map((d, i) => (
          <div
            key={d.label}
            className="flex-shrink-0 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center"
          >
            <p className="text-[10px] text-gray-400">{RANK_LABELS[i]}</p>
            <p className="mt-0.5 text-xs font-semibold text-gray-700">{d.label}</p>
            <p className="text-sm font-bold" style={{ color: BAR_COLORS[i] }}>
              {d.pct}%
            </p>
          </div>
        ))}
      </div>

      {/* 水平棒グラフ */}
      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
          <Tooltip
            formatter={(v: any) => [`${v}%`, "重要度"]}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="mt-3 text-xs text-gray-400">
        ※ 各特徴量が翌日の体重変化を予測する際の相対的な重要度。値が大きいほど体重増減との関連が強い。
      </p>
    </div>
  );
}
