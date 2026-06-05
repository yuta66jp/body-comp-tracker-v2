import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GoogleHealthSection } from "./GoogleHealthSection";
import type { GoogleHealthStatusSnapshot } from "@/lib/googleHealth/status";

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

describe("GoogleHealthSection", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "fetch");
  });

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

  it("未連携の場合は OAuth 連携への主ボタンを表示する", () => {
    render(<GoogleHealthSection initialStatus={makeStatus()} />);

    const link = screen.getByRole("link", { name: "Google Health と同期" });
    expect(screen.getByText("未連携")).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/api/google-health/oauth/start");
    expect(screen.queryByRole("button", { name: "連携を解除" })).not.toBeInTheDocument();
  });

  it("scope 不足の場合は再認可への主ボタンと不足 scope を表示する", () => {
    render(
      <GoogleHealthSection
        initialStatus={makeStatus({
          status: "scope_missing",
          grantedScopes: [ACTIVITY_SCOPE],
          missingScopes: [HEALTH_METRICS_SCOPE, SLEEP_SCOPE],
          lastCheckedAt: "2026-06-05T23:00:00.000Z",
          lastErrorCode: "scope_missing",
        })}
      />,
    );

    const link = screen.getByRole("link", { name: "再認可して同期" });
    expect(screen.getByText("権限不足")).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/api/google-health/oauth/start?prompt=consent");
    expect(screen.getByText("心拍・HRV")).toBeInTheDocument();
    expect(screen.getByText("睡眠")).toBeInTheDocument();
    expect(screen.getByText("scope_missing")).toBeInTheDocument();
  });

  it("連携済みの場合は解除操作で未連携表示へ更新する", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    Object.defineProperty(global, "fetch", {
      value: fetchMock,
      writable: true,
    });

    render(
      <GoogleHealthSection
        initialStatus={makeStatus({
          status: "connected",
          grantedScopes: REQUIRED_SCOPES,
          missingScopes: [],
          lastCheckedAt: "2026-06-05T23:00:00.000Z",
          lastSyncAt: "2026-06-05T23:30:00.000Z",
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "連携を解除" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/google-health/oauth/disconnect", { method: "POST" });
    });
    expect(await screen.findByText("Google Health 連携を解除しました。")).toBeInTheDocument();
    expect(screen.getByText("未連携")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google Health と同期" })).toBeInTheDocument();
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
      <GoogleHealthSection
        initialStatus={makeStatus({
          status: "connected",
          grantedScopes: REQUIRED_SCOPES,
          missingScopes: [],
          lastCheckedAt: "2026-06-05T23:00:00.000Z",
          lastSyncAt: null,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "今すぐ同期" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/google-health/daily-metrics?start=2026-06-01&end=2026-06-07",
      { method: "POST" },
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/google-health/status", { method: "GET" });
    });
    expect(await screen.findByText("同期しました。保存: 2日 / スキップ: 1日")).toBeInTheDocument();
    expect(screen.getAllByText("2026/06/07 12:10")).toHaveLength(2);
  });

  it("同期 API が scope 不足を返した場合は再認可導線へ切り替える", async () => {
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
      <GoogleHealthSection
        initialStatus={makeStatus({
          status: "connected",
          grantedScopes: REQUIRED_SCOPES,
          missingScopes: [],
          lastCheckedAt: "2026-06-05T23:00:00.000Z",
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "今すぐ同期" }));

    expect(await screen.findByText("Google Health の再認可が必要です。")).toBeInTheDocument();
    expect(screen.getByText("権限不足")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "再認可して同期" })).toHaveAttribute(
      "href",
      "/api/google-health/oauth/start?prompt=consent",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
