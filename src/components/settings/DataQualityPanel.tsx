/**
 * DataQualityPanel — 設定ページ向け詳細品質パネル
 *
 * Server Component。props は settings/page.tsx で計算済みの report を受け取る。
 */

import type { DataQualityReport, QualityWindow } from "@/lib/utils/calcDataQuality";

interface Props {
  report: DataQualityReport;
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600";
  if (score >= 70) return "text-amber-600";
  return "text-rose-600";
}

function scoreBg(score: number): string {
  if (score >= 90) return "bg-emerald-50";
  if (score >= 70) return "bg-amber-50";
  return "bg-rose-50";
}

function scoreBorder(score: number): string {
  if (score >= 90) return "border-emerald-200";
  if (score >= 70) return "border-amber-200";
  return "border-rose-200";
}

function WindowSection({ title, w }: { title: string; w: QualityWindow }) {
  return (
    <div className={`rounded-xl border p-4 ${scoreBg(w.score)} ${scoreBorder(w.score)}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-semibold text-gray-700">{title}</span>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${scoreColor(w.score)}`}>
          {w.score} / 100
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-gray-500">ウィンドウ日数</dt>
          <dd className="font-medium text-gray-800">{w.totalDays} 日</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">体重欠損日数</dt>
          <dd className={`font-medium ${w.weightMissingDays > 0 ? "text-amber-700" : "text-emerald-600"}`}>
            {w.weightMissingDays} 日
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">カロリー欠損日数</dt>
          <dd className={`font-medium ${w.caloriesMissingDays > 0 ? "text-amber-700" : "text-emerald-600"}`}>
            {w.caloriesMissingDays} 日
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">異常値候補</dt>
          <dd className={`font-medium ${w.anomalies.length > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {w.anomalies.length} 件
          </dd>
        </div>
      </dl>

      {w.anomalies.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            異常値候補 一覧
          </p>
          <ul className="space-y-1">
            {w.anomalies.map((a, i) => (
              <li
                key={`${a.date}-${a.type}-${i}`}
                className="flex flex-wrap items-baseline gap-2 rounded-lg bg-white px-3 py-2 text-xs shadow-sm"
              >
                <span className="font-mono text-gray-500">{a.date}</span>
                <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">
                  {a.type === "weight_jump"
                    ? "体重ジャンプ"
                    : a.type === "calories_low"
                    ? "低カロリー"
                    : "高カロリー"}
                </span>
                <span className="text-gray-600">{a.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DataQualityPanel({ report }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-base font-bold text-gray-800">データ品質レポート</h2>
      <p className="mb-4 text-xs text-gray-500">
        直近 7日 / 14日 ウィンドウの欠損・異常値を自動検出します。
        閾値: 体重 ±{3.0} kg 超、カロリー {500}〜{8000} kcal 範囲外。
      </p>

      <div className="space-y-4">
        <WindowSection title="直近 7 日" w={report.period7} />
        <WindowSection title="直近 14 日" w={report.period14} />

        {/* 重複日付 */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            重複日付
          </p>
          {report.duplicateDates.length === 0 ? (
            <p className="text-sm text-emerald-600">なし</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {report.duplicateDates.map((d) => (
                <li key={d} className="rounded bg-rose-100 px-2 py-0.5 text-xs font-mono text-rose-700">
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* スコア凡例 */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-400">
        <span>
          <span className="font-semibold text-emerald-600">90〜100</span>: 良好
        </span>
        <span>
          <span className="font-semibold text-amber-600">70〜89</span>: 注意
        </span>
        <span>
          <span className="font-semibold text-rose-600">0〜69</span>: 要確認
        </span>
        <span className="ml-auto">体重欠損 −10 / カロリー欠損 −5 / 異常値 −15</span>
      </div>
    </div>
  );
}
