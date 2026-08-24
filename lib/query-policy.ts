/**
 * WHICH QUERIES POLL, AND WHY.
 *
 * The app used to poll EVERY query every 15 seconds. On a long research page
 * — the evidence bundle, an analysis, a prediction-market panel — that meant
 * the content under the reader's cursor was replaced while they were reading
 * it, and the scroll position went with it. A reader who had scrolled a
 * thousand pixels into an audit trail was returned to the top roughly four
 * times a minute.
 *
 * The fix is to make polling an OPT-IN property of the data rather than a
 * global default, because the two kinds of data genuinely differ:
 *
 * - RESEARCH data (an evidence bundle, a stored analysis, a matched
 *   prediction market, a replay) is the record of a completed computation
 *   over stored rows. It does not change unless the operator presses a
 *   button, so re-fetching it on a timer can only ever return the same bytes
 *   — the poll was pure cost, paid in the reader's place on the page.
 * - LIVE data (a quote, a position, broker connectivity, an in-flight
 *   backfill) changes on its own, and a stale number here is misleading in a
 *   way a stale evidence bundle is not.
 *
 * So: polling defaults to OFF, and this module names the exceptions. A query
 * key not listed here is static — which is the safe direction to be wrong in,
 * since the failure mode is "press refresh" rather than "the page moved and I
 * lost my place".
 */

/** Live-data query-key prefixes and how often each may poll, in ms. */
export const LIVE_QUERY_INTERVALS: Record<string, number> = {
  // Quotes and market state — the reason a polling default existed at all.
  "market-overview": 15_000,
  quotes: 15_000,
  // Broker/session connectivity: a disconnect the reader cannot see is the
  // single most dangerous stale value on the platform.
  "broker-status": 15_000,
  "trading-status": 15_000,
  "provider-connections": 30_000,
  // Live money. A filled order or a moved position must not wait for a
  // manual refresh.
  positions: 15_000,
  orders: 15_000,
  "portfolio-risk": 30_000,
  "trading-pool": 30_000,
};

/**
 * The poll interval for a query key, or `false` for "never poll".
 *
 * Matches on the FIRST key segment, which is how every key in this app is
 * namespaced (`["event-evidence", eventId, asOf]`). Anything unrecognised is
 * static by design — see the module note above.
 */
export function pollIntervalFor(queryKey: readonly unknown[]): number | false {
  const head = queryKey?.[0];
  if (typeof head !== "string") return false;
  return LIVE_QUERY_INTERVALS[head] ?? false;
}
