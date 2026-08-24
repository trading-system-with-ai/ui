"use client";

/**
 * Research hub (IA consolidation 2026-08-20): the idea-generation half of
 * the pipeline — Recommendations (LLM screening), Catalysts (event
 * intelligence) and the Watchlist (the tracked universe) — as tabs of one
 * nav destination. Each tab renders the EXISTING page component
 * unmodified; the original routes stay reachable for deep links
 * (/watchlist/[ticker] and /catalysts/[eventId] remain real pages).
 */
import { Suspense } from "react";

import HubTabs from "@/components/shared/HubTabs";
import RecommendationsPage from "@/app/recommendations/page";
import CatalystsPage from "@/app/catalysts/page";
import WatchlistPage from "@/app/watchlist/page";

export default function ResearchHub() {
  return (
    <Suspense>
    <HubTabs
      defaultTab="recommendations"
      tabs={[
        { id: "recommendations", en: "Recommendations", zh: "推荐", render: () => <RecommendationsPage /> },
        { id: "catalysts", en: "Catalysts", zh: "催化剂", render: () => <CatalystsPage /> },
        { id: "watchlist", en: "Watchlist", zh: "自选列表", render: () => <WatchlistPage /> },
      ]}
    />
    </Suspense>
  );
}
