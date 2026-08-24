/**
 * Watchlist opportunity ranking used by the dashboard's "worth a look"
 * list. (Extracted from app/page.tsx, 2026-08-20.)
 */
import type { WatchlistOverviewItem } from "@/lib/types";

/**
 * Sort rank per opportunity status — most actionable first. Anything not
 * listed (BACKTEST_FAILED, null, unknown values) sinks below DATA_ISSUE.
 */
export const OPPORTUNITY_ORDER: Record<string, number> = {
  ENTRY_READY: 0,
  SETUP_FORMING: 1,
  WATCH: 2,
  NO_SIGNAL: 3,
  DATA_ISSUE: 4,
};

export function opportunityRank(status: string | null): number {
  return (status != null ? OPPORTUNITY_ORDER[status] : undefined) ?? 5;
}

/** Top rows: opportunity first, then |directional_edge| descending. */
export function topOpportunities(
  rows: WatchlistOverviewItem[],
  n: number,
): WatchlistOverviewItem[] {
  return [...rows]
    .sort((a, b) => {
      const byStatus =
        opportunityRank(a.opportunity_status) - opportunityRank(b.opportunity_status);
      if (byStatus !== 0) return byStatus;
      return Math.abs(b.directional_edge ?? 0) - Math.abs(a.directional_edge ?? 0);
    })
    .slice(0, n);
}
