"use client";

import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseCSV } from "@/lib/utils/csvParser";
import type { ParseResult } from "@/lib/utils/csvParser";

const BATCH_SIZE = 50;

export function ImportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setErrorMsg(null);
    setProgress(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setParsed(parseCSV(text));
    };
    reader.readAsText(file, "utf-8");
  }

  function reset() {
    setParsed(null);
    setFileName(null);
    setResult(null);
    setErrorMsg(null);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleImport() {
    if (!parsed || parsed.rows.length === 0) return;
    const supabase = createClient();
    const total = parsed.rows.length;
    setProgress({ done: 0, total });
    setResult(null);
    setErrorMsg(null);

    try {
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = parsed.rows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from("daily_logs").upsert(batch as never, { onConflict: "log_date" });
        if (error) throw new Error(error.message);
        setProgress({ done: Math.min(i + BATCH_SIZE, total), total });
      }
      setResult("success");
    } catch (e) {
      setResult("error");
      setErrorMsg(e instanceof Error ? e.message : "不明なエラー");
    }
  }

  const dateRange = parsed && parsed.rows.length > 0
    ? `${parsed.rows[0].log_date} 〜 ${parsed.rows[parsed.rows.length - 1].log_date}`
    : null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-sm font-semibold text-slate-700">データインポート（日次ログ）</h2>

      {/* ファイル選択エリア */}
      {!parsed ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 transition-colors hover:border-blue-400 hover:bg-blue-50">
          <Upload size={28} className="text-slate-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600">CSV ファイルを選択</p>
            <p className="mt-1 text-xs text-slate-400">log_date, weight, calories, protein, fat, carbs, note</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        </label>
      ) : (
        <div className="space-y-4">
          {/* ファイル情報 */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={16} className="flex-shrink-0 text-slate-400" />
              <span className="truncate text-sm font-medium text-slate-700">{fileName}</span>
            </div>
            <button onClick={reset} className="ml-3 flex-shrink-0 text-slate-300 hover:text-slate-500">
              <X size={16} />
            </button>
          </div>

          {/* パース結果サマリー */}
          {parsed.rows.length > 0 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm">
              <p className="font-semibold text-emerald-700">
                {parsed.rows.length.toLocaleString()} 件を読み込みました
              </p>
              {dateRange && <p className="mt-0.5 text-xs text-emerald-600">{dateRange}</p>}
            </div>
          )}

          {/* パースエラー */}
          {parsed.errors.length > 0 && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">
                スキップされた行（{parsed.errors.length} 件）
              </p>
              <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                {parsed.errors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-600">{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 読み込めるデータがない場合 */}
          {parsed.rows.length === 0 && parsed.errors.length === 0 && (
            <p className="text-sm text-slate-400">有効なデータが見つかりませんでした。</p>
          )}

          {/* プレビュー（最初の3行） */}
          {parsed.rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {["日付", "体重", "kcal", "P", "F", "C", "メモ"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {parsed.rows.slice(0, 3).map((r) => (
                    <tr key={r.log_date}>
                      <td className="px-3 py-2 font-mono text-slate-600">{r.log_date}</td>
                      <td className="px-3 py-2 text-slate-600">{r.weight ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.calories ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.protein ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.fat ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.carbs ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{r.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 3 && (
                <p className="px-3 py-1.5 text-xs text-slate-400">…他 {parsed.rows.length - 3} 件</p>
              )}
            </div>
          )}

          {/* 進捗バー */}
          {progress && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>インポート中...</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* 結果 */}
          {result === "success" && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm font-medium text-emerald-700">
              <CheckCircle2 size={16} />
              {parsed.rows.length.toLocaleString()} 件をインポートしました（既存データは上書き）
            </div>
          )}
          {result === "error" && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">インポートに失敗しました</p>
                {errorMsg && <p className="mt-0.5 text-xs">{errorMsg}</p>}
              </div>
            </div>
          )}

          {/* ボタン */}
          {parsed.rows.length > 0 && result !== "success" && (
            <div className="flex justify-end gap-3">
              <button
                onClick={reset}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleImport}
                disabled={!!progress && progress.done < progress.total}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {progress && progress.done < progress.total
                  ? <><Loader2 size={14} className="animate-spin" /> インポート中...</>
                  : <><Upload size={14} /> インポート</>}
              </button>
            </div>
          )}
          {result === "success" && (
            <div className="flex justify-end">
              <button onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50">
                別のファイルを読み込む
              </button>
            </div>
          )}
        </div>
      )}

      {/* フォーマット説明 */}
      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-400">
        <p className="font-semibold text-slate-500 mb-1">対応フォーマット（CSV ヘッダー）</p>
        <code className="font-mono">log_date, weight, calories, protein, fat, carbs, note, is_cheat_day, ...</code>
        <p className="mt-1">・同日のデータは上書き（upsert）されます</p>
        <p>・エクスポートしたCSVをそのままインポート可能です</p>
        <p className="mt-1">・note フィールドのセル内改行（改行を含むクォートフィールド）にも対応しています</p>
      </div>
    </div>
  );
}
