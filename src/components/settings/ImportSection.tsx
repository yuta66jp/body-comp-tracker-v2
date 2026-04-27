"use client";

import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X, AlertTriangle } from "lucide-react";
import { fetchClientData } from "@/lib/clientData/fetchJson";
import { parseCSV, deduplicateByLogDate } from "@/lib/utils/csvParser";
import type { ParseResult } from "@/lib/utils/csvParser";
import { computeImportPreflight } from "@/lib/utils/importPreflight";
import type { ImportPreflightSummary } from "@/lib/utils/importPreflight";
import { importDailyLogs, revalidateAfterImport } from "@/app/actions/importDailyLogs";

const BATCH_SIZE = 50;

export function ImportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importCount, setImportCount] = useState<{ saved: number; skipped: number; sleepSkipped: number } | null>(null);

  // 事前集計 (preflight)
  const [preflight, setPreflight] = useState<ImportPreflightSummary | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  // 同一 CSV 内の同日重複行数（log_date 単位で重複排除した際に除去された行数）
  const [csvDuplicateCount, setCsvDuplicateCount] = useState(0);
  // 確認ステップ
  const [confirming, setConfirming] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setErrorMsg(null);
    setProgress(null);
    setPreflight(null);
    setConfirming(false);
    setImportCount(null);
    setCsvDuplicateCount(0);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parseResult = parseCSV(text);
      // 同一 CSV 内に同じ log_date が複数行ある場合、最後の行を採用して重複排除する。
      // これにより preflight 件数・プレビュー key・実保存件数が一致する。
      const { deduped, duplicateCount } = deduplicateByLogDate(parseResult.rows);
      setCsvDuplicateCount(duplicateCount);
      const deduped_result: ParseResult = { rows: deduped, errors: parseResult.errors };
      setParsed(deduped_result);
      if (deduped.length > 0) {
        void runPreflight(deduped, deduped_result.errors.length);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  /**
   * DB の既存 log_date を取得して事前集計を計算する。
   * 結果は preflight state に格納し、UI がサマリーを表示できるようにする。
   *
   * 全件取得ではなく CSV の日付範囲（minDate〜maxDate）に絞り込んで取得する。
   * これにより蓄積件数が増えてもクライアント転送量が CSV 件数に比例する範囲に収まる。
   * step-import の /api/step-import（#448）と同方式。
   */
  async function runPreflight(
    rows: { log_date: string }[],
    errorCount: number
  ): Promise<void> {
    setPreflightLoading(true);
    try {
      const dates = rows.map((r) => r.log_date).sort();
      const minDate = dates[0]!;
      const maxDate = dates[dates.length - 1]!;
      const params = new URLSearchParams({
        resource: "daily_log_dates",
        start: minDate,
        end: maxDate,
      });
      const data = await fetchClientData<Array<{ log_date: string }>>(`/api/client-data?${params}`);
      const existingDates = new Set(
        (data as { log_date: string }[]).map((r) => r.log_date)
      );
      setPreflight(computeImportPreflight(rows, errorCount, existingDates));
    } catch (error) {
      setErrorMsg(
        "既存データの取得に失敗しました: " +
        (error instanceof Error ? error.message : "unknown error")
      );
      setResult("error");
    } finally {
      setPreflightLoading(false);
    }
  }

  function reset() {
    setParsed(null);
    setFileName(null);
    setResult(null);
    setErrorMsg(null);
    setProgress(null);
    setPreflight(null);
    setPreflightLoading(false);
    setConfirming(false);
    setImportCount(null);
    setCsvDuplicateCount(0);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setConfirming(false);
    const total = parsed.rows.length;
    setProgress({ done: 0, total });
    setResult(null);
    setErrorMsg(null);
    setImportCount(null);

    try {
      let totalSaved = 0;
      let totalSkipped = 0;
      let totalSleepSkipped = 0;
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = parsed.rows.slice(i, i + BATCH_SIZE);
        const res = await importDailyLogs(batch);
        if (!res.ok) throw new Error(res.message);
        totalSaved += res.count;
        totalSkipped += res.skipped;
        totalSleepSkipped += res.sleepSkipped;
        setProgress({ done: Math.min(i + BATCH_SIZE, total), total });
      }
      // 全バッチ完了後に 1 回だけ revalidate する
      if (totalSaved > 0) {
        await revalidateAfterImport();
      }
      setImportCount({ saved: totalSaved, skipped: totalSkipped, sleepSkipped: totalSleepSkipped });
      setResult("success");
    } catch (e) {
      setResult("error");
      setErrorMsg(e instanceof Error ? e.message : "不明なエラー");
    }
  }

  const isImporting = !!progress && progress.done < progress.total;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <h2 className="mb-5 text-sm font-semibold text-slate-700 dark:text-slate-200">データインポート（日次ログ）</h2>

      {/* ファイル選択エリア */}
      {!parsed ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-blue-500 dark:hover:bg-blue-900/20">
          <Upload size={28} className="text-slate-400 dark:text-slate-500" />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">CSV ファイルを選択</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">log_date, weight, calories, protein, fat, carbs, note</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        </label>
      ) : (
        <div className="space-y-4">
          {/* ファイル情報 */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={16} className="flex-shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{fileName}</span>
            </div>
            <button onClick={reset} className="ml-3 flex-shrink-0 text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400">
              <X size={16} />
            </button>
          </div>

          {/* 事前集計サマリー（照合中 or 結果表示） */}
          {parsed.rows.length > 0 && (
            preflightLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                <span>既存データと照合中...</span>
              </div>
            ) : preflight ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">インポート内容</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-emerald-50 px-2 py-2 dark:bg-emerald-900/20">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{preflight.newCount.toLocaleString()}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">新規追加</p>
                  </div>
                  <div className={`rounded-lg px-2 py-2 ${preflight.updateCount > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-slate-50 dark:bg-slate-800"}`}>
                    <p className={`text-lg font-bold ${preflight.updateCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                      {preflight.updateCount.toLocaleString()}
                    </p>
                    <p className={`text-xs ${preflight.updateCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                      既存更新
                    </p>
                  </div>
                  <div className={`rounded-lg px-2 py-2 ${preflight.skipCount > 0 ? "bg-rose-50 dark:bg-rose-900/20" : "bg-slate-50 dark:bg-slate-800"}`}>
                    <p className={`text-lg font-bold ${preflight.skipCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"}`}>
                      {preflight.skipCount.toLocaleString()}
                    </p>
                    <p className={`text-xs ${preflight.skipCount > 0 ? "text-rose-500 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"}`}>
                      スキップ
                    </p>
                  </div>
                </div>
                {preflight.dateRange && (
                  <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                    対象期間: {preflight.dateRange.from} 〜 {preflight.dateRange.to}
                  </p>
                )}
              </div>
            ) : null
          )}

          {/* パースエラー詳細 */}
          {parsed.errors.length > 0 && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-900/20">
              <p className="text-xs font-semibold text-amber-700 mb-1 dark:text-amber-400">
                スキップされた行（{parsed.errors.length} 件）
              </p>
              <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                {parsed.errors.map((e) => (
                  <li key={e} className="text-xs text-amber-600 dark:text-amber-400">{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* CSV 内の同日重複通知 */}
          {csvDuplicateCount > 0 && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-400">
              <p className="font-semibold mb-0.5">
                同じ日付の行が {csvDuplicateCount} 件重複していました
              </p>
              <p>各日付の最終値（最後に出現した行の値）を採用しました。件数はその後の数値に反映されています。</p>
            </div>
          )}

          {/* 有効なデータがない場合 */}
          {parsed.rows.length === 0 && parsed.errors.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">有効なデータが見つかりませんでした。</p>
          )}

          {/* プレビュー（最初の3行） */}
          {parsed.rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                  <tr>
                    {["日付", "体重", "kcal", "P", "F", "C", "メモ"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-400 dark:text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                  {parsed.rows.slice(0, 3).map((r, i) => (
                    <tr key={`${r.log_date}-${i}`} className="dark:bg-slate-900">
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">{r.log_date}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.weight ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.calories ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.protein ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.fat ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.carbs ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 3 && (
                <p className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500">…他 {parsed.rows.length - 3} 件</p>
              )}
            </div>
          )}

          {/* 確認パネル（confirming=true のとき表示） */}
          {confirming && preflight && (
            <div className={`rounded-xl border px-4 py-4 ${
              preflight.updateCount > 0
                ? "border-amber-200 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/20"
                : "border-blue-100 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-900/20"
            }`}>
              <div className="flex items-start gap-2">
                {preflight.updateCount > 0 ? (
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Upload size={16} className="mt-0.5 flex-shrink-0 text-blue-500 dark:text-blue-400" />
                )}
                <div className="text-sm">
                  {preflight.updateCount > 0 ? (
                    <>
                      <p className="font-semibold text-amber-700 dark:text-amber-400">
                        {preflight.updateCount.toLocaleString()} 件の既存データが上書きされます
                      </p>
                      <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                        この操作は取り消せません。新規 {preflight.newCount} 件の追加と合わせて実行します。
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-blue-700 dark:text-blue-400">
                        {preflight.newCount.toLocaleString()} 件の新規データを追加します
                      </p>
                      <p className="mt-0.5 text-xs text-blue-500 dark:text-blue-400">
                        既存データへの上書きはありません。
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  やめる
                </button>
                <button
                  onClick={handleImport}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white ${
                    preflight.updateCount > 0
                      ? "bg-amber-500 hover:bg-amber-600"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  <Upload size={14} />
                  実行する
                </button>
              </div>
            </div>
          )}

          {/* 進捗バー */}
          {progress && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>インポート中...</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* 結果 */}
          {result === "success" && importCount && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm font-medium text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-700/50 dark:text-emerald-400">
                <CheckCircle2 size={16} />
                <span>
                  {importCount.saved.toLocaleString()} 件をインポートしました
                  {importCount.skipped > 0 && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">（{importCount.skipped.toLocaleString()} 件はスキップ）</span>
                  )}
                </span>
              </div>
              {importCount.sleepSkipped > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-400">
                  <AlertTriangle size={16} className="flex-shrink-0" />
                  <span>
                    {importCount.sleepSkipped.toLocaleString()} 件の睡眠データ（sleep_sessions）を保存できませんでした。日次ログ自体は保存済みです。
                  </span>
                </div>
              )}
            </div>
          )}
          {result === "error" && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700 dark:bg-rose-900/20 dark:border-rose-700/50 dark:text-rose-400">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">インポートに失敗しました</p>
                {errorMsg && <p className="mt-0.5 text-xs">{errorMsg}</p>}
              </div>
            </div>
          )}

          {/* ボタンエリア */}
          {parsed.rows.length > 0 && result !== "success" && !confirming && (
            <div className="flex justify-end gap-3">
              <button
                onClick={reset}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                キャンセル
              </button>
              <button
                onClick={() => setConfirming(true)}
                disabled={isImporting || preflightLoading || !preflight}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {isImporting
                  ? <><Loader2 size={14} className="animate-spin" /> インポート中...</>
                  : preflightLoading
                    ? <><Loader2 size={14} className="animate-spin" /> 照合中...</>
                    : <><Upload size={14} /> インポートを確認</>}
              </button>
            </div>
          )}
          {result === "success" && (
            <div className="flex justify-end">
              <button onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800">
                別のファイルを読み込む
              </button>
            </div>
          )}
        </div>
      )}

      {/* フォーマット説明 */}
      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <p className="font-semibold text-slate-500 mb-1 dark:text-slate-400">対応フォーマット（CSV ヘッダー）</p>
        <code className="font-mono">log_date, weight, calories, protein, fat, carbs, note, is_cheat_day, ...</code>
        <p className="mt-1">・同日のデータは上書き（upsert）されます</p>
        <p>・エクスポートしたCSVをそのままインポート可能です</p>
        <p className="mt-1">・note フィールドのセル内改行（改行を含むクォートフィールド）にも対応しています</p>
      </div>
    </div>
  );
}
