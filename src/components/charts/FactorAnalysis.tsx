"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import {
  type FactorEntry,
  type FactorMeta,
  type SortedFactorRow,
  MIN_ROWS,
  HIGH_DROP_THRESHOLD,
  prepareFactorRows,
  isHighDropRate,
  calcDropPct,
} from "@/lib/utils/factorAnalysisUtils";
import {
  getFeatureDirection,
  getFeatureNote,
  getFeatureHint,
} from "@/lib/utils/featureLabels";

// FactorMeta / FactorEntry は factorAnalysisUtils からの re-export が必要な場合に備えて公開
export type { FactorMeta, FactorEntry };

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

/**
 * バッチ未実行・キャッシュなし時のプレースホルダー。
 * macro/page.tsx から factorResult が null のときに表示する。
 */
export function FactorAnalysisPlaceholder() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-700">AI 因子分析（XGBoost）</h2>
        <p className="mt-0.5 text-xs text-gray-400">翌日体重に最も影響を与えている栄養素</p>
      </div>
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-4">
        <p className="text-sm font-medium text-amber-800">分析結果がまだありません</p>
        <p className="mt-1.5 text-xs text-amber-700">
          ML バッチ（analyze.py）が実行されると結果が表示されます。
          GitHub Actions の日次 cron（毎日 AM 3:00 JST）で自動実行されます。
        </p>
        <p className="mt-3 text-xs font-medium text-amber-700">分析に必要な条件:</p>
        <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs text-amber-600">
          <li>体重・カロリー・タンパク質・脂質・炭水化物の記録が {MIN_ROWS} 日分以上</li>
          <li>欠損なしで揃っている日が {MIN_ROWS} 日以上あること</li>
        </ul>
      </div>
    </div>
  );
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
function FactorTable({ rows }: { rows: SortedFactorRow[] }) {
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

/** 解釈補助エリア（固定文 + 条件分岐文 + 上位特徴量ヒント）*/
function FactorInterpretation({
  topKey,
  topLabel,
  meta,
}: {
  topKey: string | null;
  topLabel: string | null;
  meta: FactorMeta | null | undefined;
}) {
  const hint = topKey ? getFeatureHint(topKey) : null;
  const isLowSample = meta != null && meta.sample_count < 30;
  const highDrop = meta != null && isHighDropRate(meta);
  const dropPct = meta != null ? calcDropPct(meta) : null;

  return (
    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5 space-y-2">
      <p className="text-xs font-semibold text-gray-500">分析結果の読み方</p>

      {/* 固定: 因果誤認防止 */}
      <p className="text-xs text-gray-600">
        この結果は記録データ上の統計的な関連の強さを示す<span className="font-medium">参考表示</span>です。
        重要度が高い特徴量が体重増減の「原因」であるとは限りません。
        因果関係の確認には、より多くのデータと条件の統制が必要です。
      </p>

      {/* 条件①: サンプル不足 */}
      {isLowSample && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
          現在のサンプル数（{meta!.sample_count}日分）は少なめです。
          偶然性の影響を受けやすく、週をまたいで順位が変わる可能性があります。
          継続記録により結果が安定してきます。
        </p>
      )}

      {/* 条件②: 欠損率高い */}
      {highDrop && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
          全記録の約{dropPct}%が欠損除外されています。
          記録が少ない時期のデータに偏った結果になっている可能性があります。
          記録の継続で偏りが軽減されます。
        </p>
      )}

      {/* 動的: 1位特徴量の読み方ヒント */}
      {topLabel && hint && (
        <p className="text-xs text-gray-600">
          <span className="font-medium">1位「{topLabel}」</span>について：{hint}
        </p>
      )}
      {topLabel && !hint && (
        <p className="text-xs text-gray-500">
          <span className="font-medium">1位「{topLabel}」</span>が最も強い関連を示しています。
          この特徴量が高い日・低い日の翌日体重を比較してみてください。
        </p>
      )}

      {/* 固定: 次に確認すべき観点 */}
      <p className="text-xs text-gray-400">
        仮説の確認方法：記録を続けて「順位が変わるか」「特定の時期に絞ると結果が変わるか」を見ると、より深い示唆が得られます。
      </p>
    </div>
  );
}

export function FactorAnalysis({ data, updatedAt, meta }: FactorAnalysisProps) {
  const { rows: sorted, filteredOutCount } = prepareFactorRows(data);

  // 有効な結果がゼロ件の場合: 代替表示
  if (sorted.length === 0) {
    const reason =
      Object.keys(data).length === 0
        ? "バッチの実行結果が空です。ML バッチ（analyze.py）を再実行してください。"
        : `${filteredOutCount} 件のエントリすべてに異常値（NaN・不正値）が含まれていました。ML バッチを再実行してください。`;
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-700">AI 因子分析（XGBoost）</h2>
            <p className="mt-0.5 text-xs text-gray-400">翌日体重に最も影響を与えている栄養素</p>
          </div>
          <p className="text-xs text-gray-300">{updatedAt.slice(0, 10)} 更新</p>
        </div>
        <AnalysisPremise meta={meta} />
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-4">
          <p className="text-sm font-medium text-rose-700">有効な分析結果がありません</p>
          <p className="mt-1.5 text-xs text-rose-600">{reason}</p>
        </div>
      </div>
    );
  }

  const chartData = sorted.map((d) => ({ name: d.label, pct: d.pct }));
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
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 50, bottom: 0, left: 0 }}>
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

      {/* 一部エントリ除外時の注記 */}
      {filteredOutCount > 0 && (
        <p className="mb-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
          {filteredOutCount} 件のエントリに異常値が含まれており除外しました。残り {sorted.length} 件を表示しています。
        </p>
      )}

      {/* 下段①: 説明表 */}
      <FactorTable rows={sorted} />

      {/* 下段②: 解釈補助エリア */}
      <FactorInterpretation
        topKey={sorted[0]?.key ?? null}
        topLabel={sorted[0]?.label ?? null}
        meta={meta}
      />

      {/* フッター: 技術的注記 */}
      <p className="mt-3 text-[11px] text-gray-300">
        ※ 重要度は XGBoost 特徴量ゲインの相対値（合計 100%）。傾向はドメイン知識に基づく目安。
      </p>
    </div>
  );
}
