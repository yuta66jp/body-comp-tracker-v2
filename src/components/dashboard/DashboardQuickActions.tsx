"use client";

import type { GoogleHealthStatusSnapshot } from "@/lib/googleHealth/status";
import { GoogleHealthSyncButton } from "@/components/googleHealth/GoogleHealthSyncButton";
import { MobileMealLoggerSheet } from "./MobileMealLoggerSheet";

type DashboardQuickActionsProps = {
  googleHealthStatus: GoogleHealthStatusSnapshot;
};

export function DashboardQuickActions({ googleHealthStatus }: DashboardQuickActionsProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <MobileMealLoggerSheet />
      <GoogleHealthSyncButton initialStatus={googleHealthStatus} />
    </div>
  );
}
