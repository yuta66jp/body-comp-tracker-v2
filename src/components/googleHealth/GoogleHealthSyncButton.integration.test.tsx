import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GoogleHealthStatusSnapshot } from "@/lib/googleHealth/status";

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { GoogleHealthSyncButton } from "./GoogleHealthSyncButton";

const ACTIVITY_SCOPE = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";
const HEALTH_METRICS_SCOPE = "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly";
const SLEEP_SCOPE = "https://www.googleapis.com/auth/googlehealth.sleep.readonly";
const REQUIRED_SCOPES = [ACTIVITY_SCOPE, HEALTH_METRICS_SCOPE, SLEEP_SCOPE];

function makeStatus(
  overrides: Partial<GoogleHealthStatusSnapshot> = {},
): GoogleHealthStatusSnapshot {
  return {
    status: "not_connected",
    requiredScopes: REQUIRED_SCOPES,
    grantedScopes: [],
    missingScopes: REQUIRED_SCOPES,
    lastCheckedAt: null,
    lastSyncAt: null,
    lastErrorCode: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => key.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: jest.fn().mockResolvedValue(body),
  };
}

describe("GoogleHealthSyncButton", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    mockRefresh.mockClear();
    Reflect.deleteProperty(global, "fetch");
  });

  it("未連携の場合は設定画面へのリンクを表示し、同期 API を呼ばない", () => {
    render(<GoogleHealthSyncButton initialStatus={makeStatus()} />);

    const link = screen.getByRole("link", { name: "Google Health 設定" });
    expect(link).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("button", { name: "Google Health 同期" })).not.toBeInTheDocument();
  });

  it("連携済みの場合は JST 直近7日で同期して status を再取得する", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-07T03:00:00.000Z"));
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        savedCount: 2,
        skippedCount: 1,
        savedDates: ["2026-06-05", "2026-06-06"],
        skippedDates: ["2026-06-07"],
        weightSync: {
          syncedCount: 2,
          createdCount: 1,
          updatedCount: 1,
          skippedCount: 1,
          createdDates: ["2026-06-05"],
          updatedDates: ["2026-06-06"],
          skipped: [
            {
              date: "2026-06-07",
              reason: "multiple_weight_logs",
              count: 2,
              message: "Google Health の体重ログが同日に2件あるためスキップしました。",
            },
          ],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        status: "connected",
        requiredScopes: REQUIRED_SCOPES,
        grantedScopes: REQUIRED_SCOPES,
        missingScopes: [],
        lastCheckedAt: "2026-06-07T03:10:00.000Z",
        lastSyncAt: "2026-06-07T03:10:00.000Z",
        lastErrorCode: null,
      }));
    Object.defineProperty(global, "fetch", {
      value: fetchMock,
      writable: true,
    });

    render(
      <GoogleHealthSyncButton
        initialStatus={makeStatus({
          status: "connected",
          grantedScopes: REQUIRED_SCOPES,
          missingScopes: [],
          lastCheckedAt: "2026-06-05T23:00:00.000Z",
          lastSyncAt: null,
        })}
      />,
    );

    const syncButton = screen.getByRole("button", { name: "Google Health 同期" });
    expect(syncButton).toHaveClass("bg-white", "border-slate-100", "text-slate-700");
    expect(syncButton).not.toHaveClass("bg-blue-600");

    fireEvent.click(syncButton);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/google-health/daily-metrics?start=2026-06-01&end=2026-06-07",
      { method: "POST" },
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/google-health/status", { method: "GET" });
    });
    expect(await screen.findByText(
      "同期しました。保存: 2日 / スキップ: 1日 / 体重: 作成 1日 / 更新 1日 / スキップ 1日（2026-06-07: Google Health の体重ログが同日に2件あるためスキップしました。）",
    )).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("同期 API が scope 不足を返した場合は設定画面への再認可導線へ切り替える", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      error: "Required Google Health OAuth scopes are missing.",
      status: "scope_missing",
      requiredScopes: REQUIRED_SCOPES,
      missingScopes: [HEALTH_METRICS_SCOPE],
    }, 403));
    Object.defineProperty(global, "fetch", {
      value: fetchMock,
      writable: true,
    });

    render(
      <GoogleHealthSyncButton
        initialStatus={makeStatus({
          status: "connected",
          grantedScopes: REQUIRED_SCOPES,
          missingScopes: [],
          lastCheckedAt: "2026-06-05T23:00:00.000Z",
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Google Health 同期" }));

    expect(await screen.findByText("Google Health の再認可が必要です。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google Health 再認可" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
