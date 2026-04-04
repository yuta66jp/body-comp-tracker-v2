"use client";

import { useState, useRef } from "react";
import { Upload, FileArchive, CheckCircle2, AlertCircle, Loader2, X, AlertTriangle } from "lucide-react";
import type { AppleHealthPreflightResult, AppleHealthImportResult } from "@/app/api/apple-health-import/route";

type Phase =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "preflight"; result: AppleHealthPreflightResult }
  | { kind: "confirming"; result: AppleHealthPreflightResult }
  | { kind: "importing" }
  | { kind: "done"; saved: number; skipped: number }
  | { kind: "error"; message: string };

export function AppleHealthImportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith(".zip")) {
      setPhase({ kind: "error", message: "ZIP ファイルを選択してください（.zip）" });
      return;
    }
    setFileName(f.name);
    setFile(f);
    void runPreflight(f);
  }

  async function runPreflight(f: File) {
    setPhase({ kind: "parsing" });

    const formData = new FormData();
    formData.append("file", f);

    try {
      const res = await fetch("/api/apple-health-import?action=preflight", {
        method: "POST",
        body: formData,
      });
      const json: AppleHealthPreflightResult | { error: string } = await res.json();
      if (!res.ok || "error" in json) {
        setPhase({ kind: "error", message: "error" in json ? json.error : `HTTP ${res.status}` });
        return;
      }
      setPhase({ kind: "preflight", result: json });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "不明なエラー" });
    }
  }

  async function handleImport() {
    if (!file) return;
    setPhase({ kind: "importing" });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/apple-health-import?action=import", {
        method: "POST",
        body: formData,
      });
      const json: AppleHealthImportResult | { error: string } = await res.json();
      if (!res.ok || "error" in json) {
        setPhase({ kind: "error", message: "error" in json ? json.error : `HTTP ${res.status}` });
        return;
      }
      if (!json.ok) {
        setPhase({ kind: "error", message: json.message });
        return;
      }
      setPhase({ kind: "done", saved: json.savedCount, skipped: json.skippedCount });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "不明なエラー" });
    }
  }

  function reset() {
    setFileName(null);
    setFile(null);
    setPhase({ kind: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  const isIdle = phase.kind === "idle";
  const isProcessing = phase.kind === "parsing" || phase.kind === "importing";
  const preflight = phase.kind === "preflight" || phase.kind === "confirming" ? phase.result : null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Apple Health インポート（歩数）</h2>
      <p className="mb-5 text-xs text-slate-400 dark:text-slate-500">
        Apple Health からエクスポートした ZIP ファイルを読み込み、歩数（HKQuantityTypeIdentifierStepCount）を日次ログに保存します。
        体重記録がある日のみ更新し、記録のない日はスキップします。
      </p>

      {isIdle ? (
        /* ── ファイル選択エリア ── */
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-blue-500 dark:hover:bg-blue-900/20">
          <FileArchive size={28} className="text-slate-400 dark:text-slate-500" />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Apple Health の ZIP を選択</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">ヘルスケア → プロフィール → データをエクスポート</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      ) : (
        <div className="space-y-4">
          {/* ── ファイル情報 ── */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <FileArchive size={16} className="flex-shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{fileName}</span>
            </div>
            {!isProcessing && (
              <button onClick={reset} className="ml-3 flex-shrink-0 text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400">
                <X size={16} />
              </button>
            )}
          </div>

          {/* ── 解析中 ── */}
          {phase.kind === "parsing" && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
              <Loader2 size={14} className="animate-spin" />
              <span>ZIP を解析中（数秒〜数十秒かかることがあります）...</span>
            </div>
          )}

          {/* ── プレフライト結果 ── */}
          {preflight && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">インポート内容</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-emerald-50 px-2 py-2 dark:bg-emerald-900/20">
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{preflight.newDays.toLocaleString()}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">新規書き込み</p>
                </div>
                <div className={`rounded-lg px-2 py-2 ${preflight.overwriteDays > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-slate-50 dark:bg-slate-800"}`}>
                  <p className={`text-lg font-bold ${preflight.overwriteDays > 0 ? "text-amber-700 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                    {preflight.overwriteDays.toLocaleString()}
                  </p>
                  <p className={`text-xs ${preflight.overwriteDays > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                    上書き
                  </p>
                </div>
                <div className={`rounded-lg px-2 py-2 ${preflight.skippedDays > 0 ? "bg-rose-50 dark:bg-rose-900/20" : "bg-slate-50 dark:bg-slate-800"}`}>
                  <p className={`text-lg font-bold ${preflight.skippedDays > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"}`}>
                    {preflight.skippedDays.toLocaleString()}
                  </p>
                  <p className={`text-xs ${preflight.skippedDays > 0 ? "text-rose-500 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"}`}>
                    スキップ
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                ZIP 内の歩数: {preflight.totalDays.toLocaleString()} 日分 ／ 体重ログ一致: {preflight.matchedDays.toLocaleString()} 日分
              </p>
            </div>
          )}

          {/* ── 確認パネル ── */}
          {phase.kind === "confirming" && (
            <div className={`rounded-xl border px-4 py-4 ${
              phase.result.overwriteDays > 0
                ? "border-amber-200 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/20"
                : "border-blue-100 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-900/20"
            }`}>
              <div className="flex items-start gap-2">
                {phase.result.overwriteDays > 0 ? (
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Upload size={16} className="mt-0.5 flex-shrink-0 text-blue-500 dark:text-blue-400" />
                )}
                <div className="text-sm">
                  {phase.result.overwriteDays > 0 ? (
                    <>
                      <p className="font-semibold text-amber-700 dark:text-amber-400">
                        {phase.result.overwriteDays.toLocaleString()} 件の歩数が上書きされます
                      </p>
                      <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                        この操作は取り消せません。新規 {phase.result.newDays} 件の書き込みと合わせて実行します。
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-blue-700 dark:text-blue-400">
                        {phase.result.newDays.toLocaleString()} 件の歩数を書き込みます
                      </p>
                      <p className="mt-0.5 text-xs text-blue-500 dark:text-blue-400">
                        既存の歩数データへの上書きはありません。
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setPhase({ kind: "preflight", result: phase.result })}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  やめる
                </button>
                <button
                  onClick={handleImport}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white ${
                    phase.result.overwriteDays > 0
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

          {/* ── インポート中 ── */}
          {phase.kind === "importing" && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
              <Loader2 size={14} className="animate-spin" />
              <span>歩数を保存中...</span>
            </div>
          )}

          {/* ── 完了 ── */}
          {phase.kind === "done" && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm font-medium text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-700/50 dark:text-emerald-400">
              <CheckCircle2 size={16} />
              <span>
                {phase.saved.toLocaleString()} 日分の歩数を保存しました
                {phase.skipped > 0 && (
                  <span className="ml-1 text-amber-600 dark:text-amber-400">（{phase.skipped.toLocaleString()} 件はスキップ）</span>
                )}
              </span>
            </div>
          )}

          {/* ── エラー ── */}
          {phase.kind === "error" && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700 dark:bg-rose-900/20 dark:border-rose-700/50 dark:text-rose-400">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">エラーが発生しました</p>
                <p className="mt-0.5 text-xs">{phase.message}</p>
              </div>
            </div>
          )}

          {/* ── ボタンエリア ── */}
          {phase.kind === "preflight" && preflight && (preflight.newDays + preflight.overwriteDays) > 0 && (
            <div className="flex justify-end gap-3">
              <button
                onClick={reset}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                キャンセル
              </button>
              <button
                onClick={() => setPhase({ kind: "confirming", result: preflight })}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Upload size={14} />
                インポートを確認
              </button>
            </div>
          )}
          {phase.kind === "preflight" && preflight && (preflight.newDays + preflight.overwriteDays) === 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400 dark:text-slate-500">
                書き込み対象の日付が見つかりませんでした（体重記録がある日が一致しません）。
              </p>
              <button
                onClick={reset}
                className="ml-4 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                閉じる
              </button>
            </div>
          )}
          {(phase.kind === "done" || phase.kind === "error") && (
            <div className="flex justify-end">
              <button
                onClick={reset}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {phase.kind === "done" ? "別のファイルを読み込む" : "やり直す"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
