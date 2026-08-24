import { describe, expect, it } from "vitest";
import { LIVE_QUERY_INTERVALS, pollIntervalFor } from "../query-policy";

/**
 * The regression this file exists for: a blanket 15s poll on every query
 * replaced the content of long research pages while they were being read,
 * discarding the reader's scroll position several times a minute.
 */
describe("query polling policy", () => {
  it("does not poll research data", () => {
    for (const key of [
      "event-evidence",
      "event-analysis",
      "event-prediction-markets",
      "event-macro",
      "event-news",
      "event-history",
      "event-replay",
      "event-options",
      "event-fed",
      "events",
      "event",
    ]) {
      expect(pollIntervalFor([key, 1, null])).toBe(false);
    }
  });

  it("polls live data that changes without an operator acting", () => {
    for (const key of ["positions", "orders", "broker-status", "market-overview"]) {
      expect(pollIntervalFor([key])).toBeGreaterThan(0);
    }
  });

  it("treats an unrecognised key as static", () => {
    // Static is the safe direction to be wrong in: the failure mode is
    // "press refresh", not "the page moved and I lost my place".
    expect(pollIntervalFor(["something-brand-new"])).toBe(false);
    expect(pollIntervalFor([])).toBe(false);
    expect(pollIntervalFor([123])).toBe(false);
  });

  it("keeps every live interval slow enough to read against", () => {
    for (const [key, ms] of Object.entries(LIVE_QUERY_INTERVALS)) {
      expect(ms, key).toBeGreaterThanOrEqual(15_000);
    }
  });
});
