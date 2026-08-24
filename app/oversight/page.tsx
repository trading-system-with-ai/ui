"use client";

/**
 * Oversight hub (IA consolidation 2026-08-20): the two read-only
 * monitoring surfaces — Risk and the Activity audit log — as tabs of one
 * nav destination. The activity tab's ?q= deep-link filter keeps working
 * (it reads window.location, which carries the hub's query string).
 */
import { Suspense } from "react";

import HubTabs from "@/components/shared/HubTabs";
import RiskPage from "@/app/risk/page";
import ActivityPage from "@/app/activity/page";

export default function OversightHub() {
  return (
    <Suspense>
    <HubTabs
      defaultTab="risk"
      tabs={[
        { id: "risk", en: "Risk", zh: "风控", render: () => <RiskPage /> },
        { id: "activity", en: "Activity", zh: "活动日志", render: () => <ActivityPage /> },
      ]}
    />
    </Suspense>
  );
}
