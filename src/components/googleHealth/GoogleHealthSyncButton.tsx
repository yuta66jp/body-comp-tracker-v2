"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronRight, Loader2, RefreshCw, Settings } from "lucide-react";
import type {
  GoogleHealthStatusApiResponse,
  GoogleHealthStatusSnapshot,
} from "@/lib/googleHealth/status";
import { addDaysStr, toJstDateStr } from "@/lib/utils/date";

type GoogleHealthSyncButtonProps = {
  initialStatus: GoogleHealthStatusSnapshot;
};

type GoogleHealthSyncSuccessResponse = {
  ok: true;
  savedCount: number;
  skippedCount: number;
  savedDates: string[];
  skippedDates: string[];
  weightSync?: {
    syncedCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    createdDates: string[];
    updatedDates: string[];
    skipped: Array<{
      date: string | null;
      reason: string;
      count?: number;
      message: string;
    }>;
  };
};

type GoogleHealthSyncErrorResponse = {
  error?: string;
  status?: string;
  missingScopes?: string[];
};

const SETTINGS_URL = "/settings";
const GOOGLE_HEALTH_VISIBLE_STATUSES = new Set<GoogleHealthStatusSnapshot["status"]>([
  "not_connected",
  "connected",
  "scope_missing",
  "reauthorization_required",
  "error",
]);

function snapshotFromApiResponse(
  body: GoogleHealthStatusApiResponse,
): GoogleHealthStatusSnapshot {
  if (body.ok) {
    const { ok, ...snapshot } = body;
    void ok;
    return snapshot;
  }

  const { ok, error, ...snapshot } = body;
  void ok;
  void error;
  return snapshot;
}

function isVisibleStatus(value: unknown): value is GoogleHealthStatusSnapshot["status"] {
  return typeof value === "string" && GOOGLE_HEALTH_VISIBLE_STATUSES.has(value as GoogleHealthStatusSnapshot["status"]);
}

function isSyncSuccessResponse(value: GoogleHealthSyncSuccessResponse | GoogleHealthSyncErrorResponse): value is GoogleHealthSyncSuccessResponse {
  return "ok" in value && value.ok === true;
}

function buildDefaultSyncRange(): { start: string; end: string } {
  const end = toJstDateStr();
  return {
    start: addDaysStr(end, -6) ?? end,
    end,
  };
}

function buildSyncUrl(): string {
  const range = buildDefaultSyncRange();
  const params = new URLSearchParams(range);
  return `/api/google-health/daily-metrics?${params.toString()}`;
}

function buildSyncSuccessMessage(result: GoogleHealthSyncSuccessResponse): string {
  const base = `同期しました。保存: ${result.savedCount.toLocaleString()}日 / スキップ: ${result.skippedCount.toLocaleString()}日`;
  const weightSync = result.weightSync;
  if (!weightSync) return base;

  const weightSummary =
    `体重: 作成 ${weightSync.createdCount.toLocaleString()}日 / ` +
    `更新 ${weightSync.updatedCount.toLocaleString()}日 / ` +
    `スキップ ${weightSync.skippedCount.toLocaleString()}日`;
  const skippedSummary = weightSync.skipped
    .slice(0, 3)
    .map((item) => `${item.date ?? "日付不明"}: ${item.message}`)
    .join(" / ");

  return skippedSummary
    ? `${base} / ${weightSummary}（${skippedSummary}）`
    : `${base} / ${weightSummary}`;
}

function buildSyncErrorMessage(result: GoogleHealthSyncErrorResponse): string {
  if (result.status === "scope_missing" || result.status === "reauthorization_required") {
    return "Google Health の再認可が必要です。";
  }
  if (result.status === "not_connected") {
    return "Google Health 連携が必要です。";
  }
  return "Google Health 同期に失敗しました。";
}

function getSettingsLinkLabel(status: GoogleHealthStatusSnapshot["status"]): string {
  if (status === "scope_missing" || status === "reauthorization_required") {
    return "Google Health 再認可";
  }
  if (status === "error") return "設定で確認";
  return "Google Health 設定";
}

export function GoogleHealthSyncButton({ initialStatus }: GoogleHealthSyncButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<GoogleHealthStatusSnapshot>(initialStatus);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function fetchStatusSnapshot(): Promise<GoogleHealthStatusSnapshot> {
    const response = await fetch("/api/google-health/status", { method: "GET" });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error("unexpected_response");
    }
    const body = await response.json() as GoogleHealthStatusApiResponse;
    if (!response.ok || !body.ok) {
      throw new Error("status_fetch_failed");
    }
    return snapshotFromApiResponse(body);
  }

  function applySyncErrorStatus(result: GoogleHealthSyncErrorResponse) {
    if (!isVisibleStatus(result.status)) return;

    setStatus((current) => ({
      ...current,
      status: result.status as GoogleHealthStatusSnapshot["status"],
      missingScopes: result.missingScopes ?? current.missingScopes,
      lastErrorCode: result.status ?? current.lastErrorCode,
    }));
  }

  async function syncNow() {
    if (status.status !== "connected") return;

    setSyncing(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(buildSyncUrl(), { method: "POST" });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("unexpected_response");
      }
      const body = await response.json() as GoogleHealthSyncSuccessResponse | GoogleHealthSyncErrorResponse;

      if (!response.ok || !isSyncSuccessResponse(body)) {
        const errorBody = isSyncSuccessResponse(body) ? {} : body;
        applySyncErrorStatus(errorBody);
        setErrorMessage(buildSyncErrorMessage(errorBody));
        return;
      }

      let statusRefreshFailed = false;
      try {
        setStatus(await fetchStatusSnapshot());
      } catch {
        statusRefreshFailed = true;
      }

      setMessage(buildSyncSuccessMessage(body));
      if (statusRefreshFailed) {
        setErrorMessage("同期は完了しましたが、最終同期の再取得に失敗しました。");
      }
      router.refresh();
    } catch {
      setErrorMessage("Google Health 同期に失敗しました。");
    } finally {
      setSyncing(false);
    }
  }

  const buttonClassName =
    "flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-56 sm:w-auto lg:max-w-xs";

  return (
    <div className="w-full sm:w-auto">
      {status.status === "connected" ? (
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          className={`${buttonClassName} border-blue-500 bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400`}
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/15">
            {syncing ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw size={15} aria-hidden="true" />
            )}
          </div>
          <span className="flex-1 text-left text-sm font-semibold">
            {syncing ? "同期中..." : "Google Health 同期"}
          </span>
        </button>
      ) : (
        <a
          href={SETTINGS_URL}
          className={`${buttonClassName} border-amber-100 bg-white text-slate-700 hover:bg-amber-50 hover:shadow-md dark:border-amber-700/50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-amber-900/20`}
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
            {status.status === "error" ? (
              <AlertCircle size={15} aria-hidden="true" />
            ) : (
              <Settings size={15} aria-hidden="true" />
            )}
          </div>
          <span className="flex-1 text-left text-sm font-semibold">
            {getSettingsLinkLabel(status.status)}
          </span>
          <ChevronRight size={14} className="flex-shrink-0 text-slate-300 dark:text-slate-600" />
        </a>
      )}

      <div aria-live="polite" className="mt-2 space-y-2">
        {message && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300">
            {message}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-300">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
