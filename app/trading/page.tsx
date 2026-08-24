"use client";

/**
 * Trading hub (IA consolidation 2026-08-20): authorization and execution
 * side by side — the Trading Pool (which symbols MAY trade) and Positions
 * (what IS held) are consecutive pipeline stages that belong on one nav
 * destination. Positions is the default tab; the pool is the authorization
 * stage behind it.
 */
import { Suspense } from "react";

import HubTabs from "@/components/shared/HubTabs";
import TradingPoolPage from "@/app/trading-pool/page";
import PositionsPage from "@/app/positions/page";

export default function TradingHub() {
  const tabs = [
    { id: "positions", en: "Positions", zh: "持仓", render: () => <PositionsPage /> },
    { id: "pool", en: "Trading Pool", zh: "交易池", render: () => <TradingPoolPage /> },
  ];
  return (
    <Suspense>
      <HubTabs defaultTab="positions" tabs={tabs} />
    </Suspense>
  );
}
