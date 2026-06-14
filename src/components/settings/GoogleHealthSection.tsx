"use client";

import { useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import type {
  GoogleHealthStatusApiResponse,
  GoogleHealthStatusSnapshot,
} from "@/lib/googleHealth/status";
import { addDaysStr, toJstDateStr } from "@/lib/utils/date";

type GoogleHealthSectionProps = {
  initialStatus: GoogleHealthStatusSnapshot;
};

type ActionPhase = "idle" | "refreshing" | "syncing" | "disconnecting";

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

const STATUS_LABELS: Record<GoogleHealthStatusSnapshot["status"], {
  label: string;
  description: string;
  badgeClassName: string;
  iconClassName: string;
}> = {
  not_connected: {
    label: "未連携",
    description: "Google Health のデータ取得には連携が必要です。",
    badgeClassName: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    iconClassName: "text-slate-400 dark:text-slate-500",
  },
  connected: {
    label: "連携済み",
    description: "必要な権限が揃っています。",
    badgeClassName: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    iconClassName: "text-emerald-500 dark:text-emerald-400",
  },
  scope_missing: {
    label: "権限不足",
    description: "Google Health の必要な権限が不足しています。",
    badgeClassName: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    iconClassName: "text-amber-500 dark:text-amber-400",
  },
  reauthorization_required: {
    label: "再認可が必要",
    description: "Google Health へのアクセスを再認可してください。",
    badgeClassName: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    iconClassName: "text-amber-500 dark:text-amber-400",
  },
  error: {
    label: "確認エラー",
    description: "Google Health の連携状態を確認できませんでした。",
    badgeClassName: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    iconClassName: "text-rose-500 dark:text-rose-400",
  },
};

const CONNECT_URL = "/api/google-health/oauth/start";
const REAUTHORIZE_URL = "/api/google-health/oauth/start?prompt=consent";
const GOOGLE_HEALTH_VISIBLE_STATUSES = new Set<GoogleHealthStatusSnapshot["status"]>([
  "not_connected",
  "connected",
  "scope_missing",
  "reauthorization_required",
  "error",
]);

function getScopeLabel(scope: string): string {
  if (scope.includes("activity_and_fitness")) return "歩数・活動";
  if (scope.includes("health_metrics_and_measurements")) return "心拍・HRV";
  if (scope.includes("sleep")) return "睡眠";
  return scope;
}

function formatJstDateTime(value: string | null): string {
  if (!value) return "未記録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未記録";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildDisconnectedStatus(current: GoogleHealthStatusSnapshot): GoogleHealthStatusSnapshot {
  return {
    status: "not_connected",
    requiredScopes: current.requiredScopes,
    grantedScopes: [],
    missingScopes: current.requiredScopes,
    lastCheckedAt: null,
    lastSyncAt: null,
    lastErrorCode: null,
  };
}

function buildClientErrorStatus(current: GoogleHealthStatusSnapshot): GoogleHealthStatusSnapshot {
  return {
    ...current,
    status: "error",
    lastErrorCode: "google_health_status_client_error",
  };
}

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

export function GoogleHealthSection({ initialStatus }: GoogleHealthSectionProps) {
  const [status, setStatus] = useState<GoogleHealthStatusSnapshot>(initialStatus);
  const [phase, setPhase] = useState<ActionPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isWorking = phase !== "idle";
  const statusMeta = STATUS_LABELS[status.status];
  const grantedScopeSet = new Set(status.grantedScopes);

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

  async function refreshStatus() {
    setPhase("refreshing");
    setMessage(null);
    setErrorMessage(null);

    try {
      setStatus(await fetchStatusSnapshot());
    } catch {
      setStatus((current) => buildClientErrorStatus(current));
      setErrorMessage("連携状態の確認に失敗しました。");
    } finally {
      setPhase("idle");
    }
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

    setPhase("syncing");
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
    } catch {
      setErrorMessage("Google Health 同期に失敗しました。");
    } finally {
      setPhase("idle");
    }
  }

  async function disconnect() {
    if (!window.confirm("Google Health 連携を解除しますか？保存済みの日次データは削除されません。")) {
      return;
    }

    setPhase("disconnecting");
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/google-health/oauth/disconnect", { method: "POST" });
      if (!response.ok) {
        throw new Error("disconnect_failed");
      }
      setStatus((current) => buildDisconnectedStatus(current));
      setMessage("Google Health 連携を解除しました。");
    } catch {
      setErrorMessage("Google Health 連携の解除に失敗しました。");
    } finally {
      setPhase("idle");
    }
  }

  const primaryAction =
    status.status === "not_connected"
      ? {
          href: CONNECT_URL,
          label: "Google Health と同期",
        }
      : status.status === "scope_missing" || status.status === "reauthorization_required"
        ? {
            href: REAUTHORIZE_URL,
            label: "再認可して同期",
          }
        : null;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
            <Activity size={18} aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Google Health
              </h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.badgeClassName}`}>
                {statusMeta.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {statusMeta.description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {status.status === "connected" && (
            <button
              type="button"
              onClick={syncNow}
              disabled={isWorking}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {phase === "syncing" ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={15} aria-hidden="true" />
              )}
              {phase === "syncing" ? "同期中..." : "今すぐ同期"}
            </button>
          )}
          {primaryAction && (
            <a
              href={primaryAction.href}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <ShieldCheck size={15} aria-hidden="true" />
              {primaryAction.label}
            </a>
          )}
          {status.status === "error" && (
            <button
              type="button"
              onClick={refreshStatus}
              disabled={isWorking}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {phase === "refreshing" ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={15} aria-hidden="true" />
              )}
              状態を再確認
            </button>
          )}
          {status.status !== "not_connected" && (
            <button
              type="button"
              onClick={disconnect}
              disabled={isWorking}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-rose-700/60 dark:hover:bg-rose-900/20 dark:hover:text-rose-300"
            >
              {phase === "disconnecting" ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <Unlink size={15} aria-hidden="true" />
              )}
              連携を解除
            </button>
          )}
        </div>
      </div>

      <div aria-live="polite" className="space-y-3">
        {message && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300">
            {message}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-300">
            {errorMessage}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            権限
          </p>
          <div className="mt-3 space-y-2">
            {status.requiredScopes.map((scope) => {
              const isGranted = grantedScopeSet.has(scope);
              return (
                <div key={scope} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      {getScopeLabel(scope)}
                    </p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500" title={scope}>
                      {scope}
                    </p>
                  </div>
                  {isGranted ? (
                    <CheckCircle2 size={16} className="flex-shrink-0 text-emerald-500 dark:text-emerald-400" aria-label="許可済み" />
                  ) : (
                    <AlertCircle size={16} className="flex-shrink-0 text-amber-500 dark:text-amber-400" aria-label="不足" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            状態
          </p>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500">最終確認</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-600 dark:text-slate-300">
                {formatJstDateTime(status.lastCheckedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500">最終同期</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-600 dark:text-slate-300">
                {status.lastSyncAt ? formatJstDateTime(status.lastSyncAt) : "未同期"}
              </dd>
            </div>
            {status.lastErrorCode && (
              <div>
                <dt className="text-xs text-slate-400 dark:text-slate-500">エラーコード</dt>
                <dd className="mt-0.5 break-all text-sm font-medium text-slate-600 dark:text-slate-300">
                  {status.lastErrorCode}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </section>
  );
}
