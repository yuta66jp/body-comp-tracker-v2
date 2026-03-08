"use client";

interface TdeeKpiCardProps {
  avgTdee: number | null;
  theoreticalTdee: number | null;
  avgCalories: number | null;
}

export function TdeeKpiCard({ avgTdee, theoreticalTdee, avgCalories }: TdeeKpiCardProps) {
  const adaptation = avgTdee !== null && theoreticalTdee !== null
    ? Math.round(avgTdee - theoreticalTdee)
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-gray-500">実測 TDEE（7日平均）</p>
        <p className="mt-3 text-3xl font-bold text-orange-500">
          {avgTdee !== null ? Math.round(avgTdee).toLocaleString() : "—"}
          <span className="ml-1 text-base font-normal text-gray-400">kcal</span>
        </p>
        <p className="mt-1 text-xs text-gray-400">体重変化と摂取カロリーから逆算</p>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-gray-500">理論 TDEE（BMR×活動係数）</p>
        <p className="mt-3 text-3xl font-bold text-blue-500">
          {theoreticalTdee !== null ? Math.round(theoreticalTdee).toLocaleString() : "—"}
          <span className="ml-1 text-base font-normal text-gray-400">kcal</span>
        </p>
        <p className="mt-1 text-xs text-gray-400">Mifflin-St Jeor × 活動係数</p>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-gray-500">代謝適応量</p>
        <p className={`mt-3 text-3xl font-bold ${adaptation !== null && adaptation < 0 ? "text-rose-500" : "text-gray-800"}`}>
          {adaptation !== null ? `${adaptation > 0 ? "+" : ""}${adaptation.toLocaleString()}` : "—"}
          <span className="ml-1 text-base font-normal text-gray-400">kcal</span>
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {adaptation !== null && adaptation < -100
            ? "代謝が低下しています"
            : "実測 − 理論 TDEE"}
        </p>
      </div>
    </div>
  );
}
