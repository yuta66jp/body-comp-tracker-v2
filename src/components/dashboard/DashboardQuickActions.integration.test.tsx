// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import type { GoogleHealthStatusSnapshot } from "@/lib/googleHealth/status";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/components/meal/MealLogger", () => ({
  MealLogger: ({ onSaveSuccess }: { onSaveSuccess: () => void }) => (
    <div>
      <button type="button" onClick={onSaveSuccess}>
        保存する
      </button>
    </div>
  ),
}));

import { DashboardQuickActions } from "./DashboardQuickActions";

const ACTIVITY_SCOPE = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";
const HEALTH_METRICS_SCOPE = "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly";
const SLEEP_SCOPE = "https://www.googleapis.com/auth/googlehealth.sleep.readonly";
const REQUIRED_SCOPES = [ACTIVITY_SCOPE, HEALTH_METRICS_SCOPE, SLEEP_SCOPE];

function makeStatus(
  overrides: Partial<GoogleHealthStatusSnapshot> = {},
): GoogleHealthStatusSnapshot {
  return {
    status: "connected",
    requiredScopes: REQUIRED_SCOPES,
    grantedScopes: REQUIRED_SCOPES,
    missingScopes: [],
    lastCheckedAt: "2026-06-05T23:00:00.000Z",
    lastSyncAt: null,
    lastErrorCode: null,
    ...overrides,
  };
}

describe("DashboardQuickActions", () => {
  it("食事・体重記録と Google Health 同期を同じアクション行に表示する", () => {
    render(<DashboardQuickActions googleHealthStatus={makeStatus()} />);

    expect(screen.getByRole("button", { name: "食事・体重を記録する" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google Health 同期" })).toBeInTheDocument();
  });
});
