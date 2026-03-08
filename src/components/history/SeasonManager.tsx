"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";

/**
 * セキュリティノート:
 * NEXT_PUBLIC_ADMIN_SECRET はブラウザに公開される点に注意。
 * 本番環境では Supabase Auth や NextAuth.js を用いたセッションベースの認証を推奨。
 * 現在の実装は管理者用の簡易保護であり、ソースを見れば秘密を確認できるため、
 * 機密性の高い操作には使用しないこと。
 */

interface SeasonManagerProps {
  seasons: Array<{ season: string; targetDate: string; count: number; peakWeight: number }>;
}

export function SeasonManager({ seasons }: SeasonManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [season, setSeason] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [logDate, setLogDate] = useState("");
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleAdd() {
    if (!season || !targetDate || !logDate || !weight) {
      return setError("シーズン名・大会日・記録日・体重は必須です");
    }
    const parsedWeight = parseFloat(weight);
    if (isNaN(parsedWeight)) {
      return setError("体重は有効な数値を入力してください");
    }
    setError(null);

    try {
      const res = await fetch("/api/career-logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // NEXT_PUBLIC_ADMIN_SECRET はクライアントに公開される簡易保護。
          // 本番では認証ベースのアクセス制御への移行を推奨。
          "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET ?? "",
        },
        body: JSON.stringify({
          season: season.trim(),
          target_date: targetDate,
          log_date: logDate,
          weight: parsedWeight,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return setError((data as { error?: string }).error ?? `エラー (${res.status})`);
      }
    } catch (e) {
      return setError(e instanceof Error ? e.message : "ネットワークエラー");
    }

    router.refresh();
    setSuccess(true);
    setLogDate("");
    setWeight("");
    setNote("");
    setTimeout(() => setSuccess(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-gray-700">キャリアログを追加・管理</span>
        {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">
          {/* シーズン一覧 */}
          {seasons.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500">登録済みシーズン</p>
              <ul className="rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100">
                {seasons.map((s) => (
                  <li key={s.season} className="flex items-center justify-between px-4 py-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-800">{s.season}</span>
                      <span className="ml-2 text-xs text-gray-400">
                        大会: {s.targetDate} / {s.count}件 / 仕上がり {s.peakWeight.toFixed(1)}kg
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 追加フォーム */}
          <div>
            <p className="mb-3 text-xs font-medium text-gray-500">1件追加（bulk インポートは import_history.py を使用）</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-xs text-gray-500">シーズン名</label>
                <input
                  type="text"
                  placeholder="2026_TokyoNovice"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">大会日</label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">記録日</label>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">体重 (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">メモ（任意）</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
            {success && <p className="mt-2 text-xs text-emerald-600">保存しました</p>}
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => startTransition(handleAdd)}
                disabled={isPending}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-40"
              >
                <Plus size={14} />
                追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
