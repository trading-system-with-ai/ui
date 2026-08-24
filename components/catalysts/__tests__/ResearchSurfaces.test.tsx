/**
 * Catalyst research upgrade — the UI surfaces (plan Phase 9).
 *
 * Each of these pins a rule where a plausible-looking implementation lies:
 *
 *  1. PRICING IS NEVER RELABELLED AS PROBABILITY. Every surface that shows a
 *     contract price says "market-implied"; none of them says the outcome is
 *     that likely. A component that dropped the qualifier would read as a
 *     forecast the platform never made.
 *  2. THE THREE EMPTY STATES ARE THREE DIFFERENT SENTENCES. "never
 *     researched", "researched and found nothing relevant", and "metadata
 *     unavailable" are distinct answers, and conflating them tells the
 *     reader the platform looked when it did not (or gave up when it simply
 *     found nothing).
 *  3. ABSENT IS NOT ZERO. An unknown spread/volume/liquidity prints
 *     "unknown", never 0 — a 0 spread is a claim about a tight market.
 *  4. NO URLS. The bundle carries none by design (§81), and no component may
 *     render one.
 *  5. ONE POINT IS NOT A TREND. The chart refuses to draw a line through a
 *     single observation, and anchors render only where they honestly fall.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type {
  MatchedMarket,
  PredictionMarketsSection,
  WebResearchSection,
} from "@/lib/types-research";
import EventIntelSnapshot from "../EventIntelSnapshot";
import PredictionMarketChart from "../PredictionMarketChart";
import PredictionMarketsPanel from "../PredictionMarketsPanel";

const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});

afterEach(cleanup);

function view(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

function market(overrides: Partial<MatchedMarket> = {}): MatchedMarket {
  return {
    market_ref: "pm:polymarket:1",
    provider: "polymarket",
    safe_question: "Will revenue beat guidance?",
    safe_resolution_criteria: null,
    relation: "DIRECT",
    relevance: 0.9,
    reason: "direct measure",
    ambiguity: null,
    matched_by: "DETERMINISTIC_V1",
    market_status: "ACTIVE",
    primary_outcome: "Yes",
    market_implied_probability: 0.63,
    spread: 0.02,
    best_bid: 0.62,
    best_ask: 0.64,
    volume: 12345,
    liquidity: 6789,
    observed_at: "2026-08-18T12:00:00+00:00",
    snapshot_available: true,
    history: {
      current_price: 0.63,
      change_1d: 0.01,
      change_7d: -0.06,
      price_range: 0.12,
      observation_count: 40,
    },
    data_quality: {
      snapshot_available: true,
      liquidity_known: true,
      volume_known: true,
      history_available: true,
    },
    ...overrides,
  };
}

describe("PredictionMarketsPanel", () => {
  it("labels the number as market-implied pricing, never as probability", () => {
    view(
      <PredictionMarketsPanel
        section={{
          available: true,
          reason: null,
          tier: "DATA",
          matched_markets: [market()],
        }}
      />,
    );
    expect(screen.getByTestId("pm-implied").textContent ?? "").toMatch("63.0%");
    expect(screen.getByText(/market-implied pricing/i)).toBeTruthy();
    // Rule 1: the forecast reading must be absent from the whole surface.
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/true probability|actual probability|chance of/i);
  });

  it("shows the relation so a DERIVED contract cannot read as this event's odds", () => {
    view(
      <PredictionMarketsPanel
        section={{
          available: true,
          reason: null,
          tier: "DATA",
          matched_markets: [market({ relation: "DERIVED" })],
        }}
      />,
    );
    expect(screen.getByTestId("pm-relation").textContent ?? "").toMatch(/derived/i);
  });

  it("prints unknown — never 0 — for absent depth facts", () => {
    view(
      <PredictionMarketsPanel
        section={{
          available: true,
          reason: null,
          tier: "DATA",
          matched_markets: [
            market({
              spread: null,
              volume: null,
              liquidity: null,
              data_quality: {
                snapshot_available: true,
                liquidity_known: false,
                volume_known: false,
                history_available: false,
              },
            }),
          ],
        }}
      />,
    );
    const body = document.body.textContent ?? "";
    expect(body).toMatch(/unknown/i);
    // A zero here would assert a tight spread / no volume.
    expect(screen.queryByText(/^0$/)).toBeNull();
  });

  it("reads the history field names the backend actually sends", () => {
    // A type that spells a wire field differently does not fail loudly — it
    // reads undefined and renders as an absence the platform in fact
    // computed. These are the names from prediction_intel.py.
    view(
      <PredictionMarketsPanel
        section={{
          available: true,
          reason: null,
          tier: "DATA",
          matched_markets: [market()],
        }}
      />,
    );
    const body = document.body.textContent ?? "";
    expect(body).toMatch(/\+1\.0pp/); // change_1d rendered, not "unavailable"
    expect(body).toMatch(/-6\.0pp/); // change_7d
  });

  it("renders history unavailable rather than fabricating changes", () => {
    view(
      <PredictionMarketsPanel
        section={{
          available: true,
          reason: null,
          tier: "DATA",
          matched_markets: [market({ history: null })],
        }}
      />,
    );
    expect(screen.getByTestId("pm-no-history")).toBeTruthy();
  });

  it.each([
    ["NEVER_RUN", /not been researched/i],
    ["NO_RELEVANT_PREDICTION_MARKET", /no sufficiently relevant/i],
    ["MARKET_METADATA_UNAVAILABLE", /metadata is unavailable/i],
  ] as const)("gives %s its own sentence", (reason, pattern) => {
    view(
      <PredictionMarketsPanel
        section={{ available: false, reason, tier: "DATA" } as PredictionMarketsSection}
      />,
    );
    expect(screen.getByTestId("pm-unavailable").textContent ?? "").toMatch(pattern);
  });
});

describe("PredictionMarketsPanel — the spending control", () => {
  it("renders the list with NO providers when eventId is omitted", () => {
    // The read path must not depend on the write path's plumbing: this
    // render has no QueryClient and no Toast host and must still work.
    view(
      <PredictionMarketsPanel
        section={{
          available: true,
          reason: null,
          tier: "DATA",
          matched_markets: [market()],
        }}
      />,
    );
    expect(screen.getByTestId("pm-panel")).toBeTruthy();
    expect(screen.queryByTestId("pm-refresh")).toBeNull();
  });
});

describe("PredictionMarketChart", () => {
  it("refuses to draw a trend through a single observation", () => {
    view(<PredictionMarketChart points={[{ ts: "2026-08-18T12:00:00Z", price: 0.6 }]} />);
    expect(screen.getByTestId("pm-chart-empty")).toBeTruthy();
  });

  it("draws the series and captions it as pricing", () => {
    view(
      <PredictionMarketChart
        points={[
          { ts: "2026-08-10T12:00:00Z", price: 0.5 },
          { ts: "2026-08-18T12:00:00Z", price: 0.63 },
        ]}
      />,
    );
    expect(screen.getByTestId("pm-chart")).toBeTruthy();
    expect(screen.getByText(/what the contract cost, not a forecast/i)).toBeTruthy();
  });

  it("renders an anchor only when it falls inside the observed range", () => {
    const points = [
      { ts: "2026-08-10T12:00:00Z", price: 0.5 },
      { ts: "2026-08-18T12:00:00Z", price: 0.63 },
    ];
    // Inside → drawn.
    const inside = view(
      <PredictionMarketChart points={points} previousEventAt="2026-08-12T12:00:00Z" />,
    );
    expect(inside.getByText(/previous event/i)).toBeTruthy();
    cleanup();
    // Outside → NOT clamped to the edge, which would assert the market was
    // trading at an instant it has no observation for.
    const outside = view(
      <PredictionMarketChart points={points} previousEventAt="2020-01-01T00:00:00Z" />,
    );
    expect(outside.queryByText(/previous event/i)).toBeNull();
  });
});

describe("EventIntelSnapshot", () => {
  const research: WebResearchSection = {
    available: true,
    reason: null,
    tier: "DATA",
    results_accepted: 2,
    retrieved_at: "2026-08-18T12:00:00+00:00",
    important_evidence: [
      {
        evidence_key: "web:aaa",
        safe_title: "Official release",
        publisher: "BLS",
        domain: "bls.gov",
        published_at: "2026-08-12T09:00:00+00:00",
        source_tier: "OFFICIAL",
        topic: "inflation",
        relevance: 0.9,
        result_type: "web",
      },
      {
        evidence_key: "web:bbb",
        safe_title: "Analyst note",
        publisher: "Example",
        domain: "example.com",
        published_at: null,
        source_tier: "HIGH_QUALITY_NEWS",
        topic: "demand",
        relevance: 0.6,
        result_type: "news",
      },
    ],
  };

  it("counts evidence without folding anything into one score", () => {
    view(<EventIntelSnapshot research={research} markets={undefined} />);
    const text = screen.getByTestId("intel-evidence").textContent ?? "";
    expect(text).toMatch(/2 admitted/);
    expect(text).toMatch(/1 official/);
    // Phase 23: no single opaque score anywhere on the card.
    expect(document.body.textContent ?? "").not.toMatch(/AI score|\/100/i);
  });

  it("says never-run rather than showing a card of zeros", () => {
    view(<EventIntelSnapshot research={undefined} markets={undefined} />);
    expect(screen.getByTestId("intel-empty")).toBeTruthy();
  });

  it("headlines the DIRECT market with a humanised label, not a raw enum", () => {
    view(
      <EventIntelSnapshot
        research={research}
        markets={{
          available: true,
          reason: null,
          tier: "DATA",
          matched_markets: [
            market({ market_ref: "pm:polymarket:ctx", relation: "CONTEXT" }),
            market({ market_ref: "pm:polymarket:dir", relation: "DIRECT" }),
          ],
        }}
      />,
    );
    const row = screen.getByTestId("intel-markets").textContent ?? "";
    expect(row).toMatch(/Direct/);
    // The raw backend enum bypasses i18n and carries no explanation.
    expect(row).not.toMatch(/DIRECT/);
    expect(row).toMatch(/market-implied/i);
  });

  it("qualifies a non-DIRECT contract so it cannot read as this event's odds", () => {
    // THE case the previous test could never catch: with only a CONTEXT
    // contract accepted, the snapshot must say the price is about something
    // related — a bare "63%" beside a catalyst reads as that catalyst's odds.
    view(
      <EventIntelSnapshot
        research={research}
        markets={{
          available: true,
          reason: null,
          tier: "DATA",
          matched_markets: [
            market({ market_ref: "pm:polymarket:ctx", relation: "CONTEXT" }),
          ],
        }}
      />,
    );
    const row = screen.getByTestId("intel-markets").textContent ?? "";
    expect(row).toMatch(/Context/);
    expect(row).toMatch(/related outcome/i);
    expect(row).not.toMatch(/CONTEXT/);
  });

  it("does not read a degradation as 'never looked'", () => {
    // MARKET_METADATA_UNAVAILABLE means markets matched but could not be
    // rendered — a different answer from NEVER_RUN, and one the operator
    // would act on differently.
    view(
      <EventIntelSnapshot
        research={research}
        markets={{
          available: false,
          reason: "MARKET_METADATA_UNAVAILABLE",
          tier: "DATA",
        }}
      />,
    );
    const row = screen.getByTestId("intel-markets").textContent ?? "";
    expect(row).toMatch(/details unavailable/i);
    expect(row).not.toMatch(/not researched/i);
  });

  it("labels the match clock as matching, not as a pricing observation", () => {
    // matched_at is when MATCHING ran; each price carries its own
    // observed_at. Calling it an observation overstates price freshness.
    view(
      <EventIntelSnapshot
        research={research}
        markets={{
          available: true,
          reason: null,
          tier: "DATA",
          matched_at: "2026-08-18T12:00:00+00:00",
          matched_markets: [market()],
        }}
      />,
    );
    expect(screen.getByTestId("intel-matched").textContent ?? "").toMatch(
      /matched/i,
    );
    expect(screen.queryByTestId("intel-observed")).toBeNull();
  });

  it("reports the honest no-market state on the snapshot too", () => {
    view(
      <EventIntelSnapshot
        research={research}
        markets={{
          available: false,
          reason: "NO_RELEVANT_PREDICTION_MARKET",
          tier: "DATA",
        }}
      />,
    );
    expect(screen.getByTestId("intel-markets").textContent ?? "").toMatch(/no sufficiently relevant market/i);
  });
});
