/**
 * The price bars exist so a reader can compare contracts at a glance, which
 * scrolling a list of blocks cannot do. These tests pin the honesty rules:
 *
 *  1. THE AXIS IS ALWAYS 0–100c. Never fitted to the data. Four contracts at
 *     2–8c must render as four SHORT bars, not as a wide spread — a fitted
 *     axis is the most misleading thing this chart could do.
 *  2. AN ABSENT PRICE DRAWS NO BAR, not a zero-width one. "No observation"
 *     and "worthless contract" are opposite claims (§44 rule 18).
 *  3. THE RELATION RIDES ON EVERY ROW. A DERIVED contract at 63c is not a
 *     63% forecast of the catalyst, so the qualifier cannot live in a legend.
 *  4. THE HEADING SAYS COST, NOT PROBABILITY.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { MatchedMarket } from "@/lib/types-research";
import PredictionMarketBars from "../PredictionMarketBars";

afterEach(cleanup);

function market(over: Partial<MatchedMarket> = {}): MatchedMarket {
  return {
    market_ref: "pm:polymarket:1",
    provider: "polymarket",
    safe_question: "Will US GDP growth in Q3 2026 be less than 0.5%?",
    safe_resolution_criteria: null,
    relation: "DIRECT",
    relevance: 0.8,
    reason: "",
    ambiguity: null,
    matched_by: "DETERMINISTIC_V1",
    market_status: "ACTIVE",
    primary_outcome: "Yes",
    market_implied_probability: 0.02,
    spread: null,
    best_bid: null,
    best_ask: null,
    volume: null,
    liquidity: null,
    observed_at: null,
    snapshot_available: true,
    history: null,
    data_quality: null,
    ...over,
  } as MatchedMarket;
}

function renderBars(markets: MatchedMarket[]) {
  return render(
    <LanguageProvider>
      <PredictionMarketBars markets={markets} />
    </LanguageProvider>,
  );
}

describe("PredictionMarketBars", () => {
  it("keeps cheap contracts visually cheap — the axis is not fitted", () => {
    renderBars([
      market({ market_ref: "a", market_implied_probability: 0.02 }),
      market({ market_ref: "b", market_implied_probability: 0.08 }),
    ]);
    const fills = screen.getAllByTestId("pm-bar-fill");
    // 2c and 8c of a FIXED 100c axis — not 25% and 100% of a fitted one.
    expect(fills[0].style.width).toBe("2%");
    expect(fills[1].style.width).toBe("8%");
  });

  it("draws no bar at all for a contract with no observed price", () => {
    renderBars([
      market({ market_ref: "a", market_implied_probability: 0.5 }),
      market({ market_ref: "b", market_implied_probability: null }),
    ]);
    // One row, not two with one pinned at the origin.
    expect(screen.getAllByTestId("pm-bar-fill")).toHaveLength(1);
  });

  it("renders nothing when no contract has a price", () => {
    const { container } = renderBars([market({ market_implied_probability: null })]);
    expect(container.querySelector('[data-testid="pm-bars"]')).toBeNull();
  });

  it("carries the relation on every row, not in a legend", () => {
    renderBars([
      market({ market_ref: "a", relation: "DERIVED", market_implied_probability: 0.63 }),
    ]);
    expect(screen.getByTestId("pm-bar-fill").dataset.relation).toBe("DERIVED");
    expect(screen.getByTestId("pm-bars").textContent).toMatch(/Derived/i);
  });

  it("names the value as a cost, never as a probability", () => {
    renderBars([market()]);
    const text = screen.getByTestId("pm-bars").textContent ?? "";
    expect(text).toMatch(/costs/i);
    expect(text).not.toMatch(/probability|chance of/i);
  });

  it("states that the contracts do not sum to one", () => {
    renderBars([market()]);
    expect(screen.getByTestId("pm-bars").textContent).toMatch(/do not sum/i);
  });
});

/**
 * A partial bracket set is worse than none: four cheap brackets of a
 * seven-bracket GDP series showed every outcome priced near zero while the
 * market's real central estimate sat in the three that were missing.
 */
describe("incomplete bracket series", () => {
  const series = [
    {
      series_key: "will us gdp growth in q3 2026 be ?",
      n_brackets: 4,
      market_refs: [],
      price_sum: 0.212,
      complete: false,
      flagged_truncated: false,
    },
  ];

  it("warns when a distribution's brackets do not price to about 100c", () => {
    render(
      <LanguageProvider>
        <PredictionMarketBars markets={[market()]} series={series} />
      </LanguageProvider>,
    );
    const warn = screen.getByTestId("pm-series-incomplete").textContent ?? "";
    expect(warn).toMatch(/incomplete/i);
    // The evidence travels with the verdict so a reader can check it.
    expect(warn).toMatch(/21c/);
  });

  it("stays silent when the distribution is complete", () => {
    render(
      <LanguageProvider>
        <PredictionMarketBars
          markets={[market()]}
          series={[{ ...series[0], price_sum: 1.044, complete: true }]}
        />
      </LanguageProvider>,
    );
    expect(screen.queryByTestId("pm-series-incomplete")).toBeNull();
  });
});
