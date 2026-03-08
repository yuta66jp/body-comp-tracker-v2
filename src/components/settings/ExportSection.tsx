"use client";

import { useState } from "react";
import { Download } from "lucide-react";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function ExportSection() {
  const [start, setStart] = useState(firstOfMonthStr);
  const [end, setEnd] = useState(todayStr);

  function download(table: string) {
    const params = new URLSearchParams({ table });
    if (table === "daily_logs") {
      params.set("start", start);
      params.set("end", end);
    }
    const url = `/api/export?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.click();
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-base font-semibold text-gray-700">データエクスポート</h2>

      {/* 日次ログ */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-600">日次ログ（daily_logs）</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">開始日</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">終了日</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <button
            onClick={() => download("daily_logs")}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            <Download size={15} />
            CSV ダウンロード
          </button>
        </div>
        <p className="text-xs text-gray-400">
          ファイル名: bodymake_log_{start}_{end}.csv
        </p>
      </div>

      <div className="my-5 border-t border-gray-100" />

      {/* その他のテーブル */}
      <p className="mb-3 text-sm font-medium text-gray-600">その他</p>
      <div className="flex flex-wrap gap-3">
        {[
          { label: "食品マスタ (food_master)", table: "food_master" },
          { label: "予測データ (predictions)", table: "predictions" },
        ].map(({ label, table }) => (
          <button
            key={table}
            onClick={() => download(table)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Download size={14} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
