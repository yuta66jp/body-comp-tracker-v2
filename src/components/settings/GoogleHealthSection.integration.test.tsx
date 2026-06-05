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
    jest.restoreAllMocks();
  });

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
});
