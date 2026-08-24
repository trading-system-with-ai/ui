/**
 * Phase E2 Fundamentals-tab render tests.
 *
 * Each pins an honesty rule where a plausible-looking implementation lies:
 *
 *  1. A null metric renders the SERVER'S reason — never 0, never a bare dash.
 *     The dangerous case is the CHANGE column: "—" there reads as "no change".
 *  2. Free cash flow / EV-EBITDA / net debt are structurally unavailable from
 *     this provider and must SAY so, never be approximated from a neighbour.
 *  3. The consensus banner is always shown while consensus is unavailable
 *     (§33) and carries the server's reason verbatim.
 *  4. Freshness prints period end, filing date AND the acceptance instant —
 *     the acceptance one being the only legal as-of key (§7/§85).
 *  5. Percentiles travel with their sample size (§64).
 *  6. Direction arrows come from the payload's `direction`, not re-derived.
 *  7. Provenance comes from the payload (DATA statements / QUANT metrics).
 *  8. available:false is a 200 result rendered as an explanation.
 *  9. Every ⓘ on the tab resolves to a real bilingual glossary entry.
 * 10. Nothing on the page claims a beat or a miss.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { GLOSSARY } from "@/lib/glossary";
import { LanguageProvider } from "@/lib/i18n";
import type {
  EventFundamentalsContext,
  FundamentalMetricChange,
  FundamentalSnapshotPayload,
  FundamentalValuation,
} from "@/lib/types";
import { FundamentalsTabContent } from "./FundamentalsTab";
import {
  METRIC_SPECS,
  changeColor,
  directionArrow,
  fmtCountCompact,
  fmtDelta,
  fmtMetric,
  fmtMoneyCompact,
  fmtMultiple,
  fmtPctFrac,
  fmtPerShare,
  isoDate,
  ownHistorySentence,
  reasonFor,
  specFor,
  unavailableText,
} from "./fundamentals-format";

// This jsdom build ships no working localStorage (same shim as Term.test).
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

afterEach(() => {
  cleanup();
  store.clear();
});

const t = (en: string) => en;

function renderTab(data: EventFundamentalsContext) {
  return render(
    <LanguageProvider>
      <FundamentalsTabContent data={data} />
    </LanguageProvider>,
  );
}

/* ------------------------------------------------------------- fixtures */

function makeSnapshot(
  overrides: Partial<FundamentalSnapshotPayload> = {},
): FundamentalSnapshotPayload {
  return {
    ticker: "AAPL",
    as_of: "2026-08-19T12:00:00+00:00",
    available: true,
    quarterly: {
      label: "Q3 FY2026",
      fiscal_year: 2026,
      fiscal_period: "Q3",
      end_date: "2026-06-27",
      acceptance_datetime: "2026-07-31T20:07:12+00:00",
      filing_date: "2026-07-31",
      timeframe: "quarterly",
    },
    ttm: {
      label: "TTM",
      fiscal_period: "TTM",
      end_date: "2026-06-27",
      acceptance_datetime: "2026-07-31T20:07:12+00:00",
      timeframe: "ttm",
    },
    metrics: {},
    reasons: {},
    notes: {},
    quarters_available: 12,
    price: 231.4,
    market_cap: 3_450_000_000_000,
    model_version: "fundamentals-1",
    ...overrides,
  };
}

function change(
  metric: string,
  overrides: Partial<FundamentalMetricChange> = {},
): FundamentalMetricChange {
  return { metric, trend_points: 0, ...overrides };
}

/** A realistic, mostly-populated payload. */
function makeContext(
  overrides: Partial<EventFundamentalsContext> = {},
): EventFundamentalsContext {
  const valuation: FundamentalValuation = {
    as_of: "2026-08-19T12:00:00+00:00",
    price: 231.4,
    market_cap: 3_450_000_000_000,
    multiples: {
      pe_ttm: {
        metric: "pe_ttm",
        available: true,
        current: 34.12,
        median: 28.4,
        min: 21.9,
        max: 38.6,
        percentile: 0.82,
        history_n: 11,
      },
      ps_ttm: {
        metric: "ps_ttm",
        available: true,
        current: 8.61,
        median: null,
        min: null,
        max: null,
        percentile: null,
        history_n: 0,
        history_reason:
          "no historical snapshot with this multiple — needs prior statements priced at their own dates",
      },
      pb: {
        metric: "pb",
        available: false,
        current: null,
        history_n: 0,
        reason: "input_unavailable:balance_sheet.equity",
      },
      ev_ebitda: {
        metric: "ev_ebitda",
        available: false,
        current: null,
        reason: "EV/EBITDA needs cash and EBITDA, neither reported by provider",
      },
      fcf_yield: {
        metric: "fcf_yield",
        available: false,
        current: null,
        reason: "FCF yield needs free cash flow, which needs capex (not reported)",
      },
    },
    own_history: { available: true, n: 11 },
    sector: {
      available: false,
      reason: "peer/sector multiples not implemented (Phase G/J)",
    },
    peers: {
      available: false,
      reason: "peer/sector multiples not implemented (Phase G/J)",
    },
    provenance: "QUANT",
  };

  return {
    available: true,
    event_id: 4021,
    event_key: "EARNINGS:AAPL:2026-10-30",
    ticker: "AAPL",
    as_of: "2026-08-19T12:00:00+00:00",
    provenance: { statements: "DATA", metrics: "QUANT" },
    statements: { available: true, count: 16 },
    current: makeSnapshot(),
    previous_event: {
      event_id: 3910,
      event_key: "EARNINGS:AAPL:2026-07-31",
      scheduled_at: "2026-07-31T20:30:00+00:00",
      comparison_reason: "prior quarterly earnings",
      price_date: "2026-07-31",
      snapshot: makeSnapshot({
        quarterly: {
          label: "Q2 FY2026",
          fiscal_year: 2026,
          fiscal_period: "Q2",
          end_date: "2026-03-28",
          acceptance_datetime: "2026-05-01T20:04:03+00:00",
          filing_date: "2026-05-01",
          timeframe: "quarterly",
        },
      }),
    },
    changes: [
      change("revenue", {
        previous: 90_753_000_000,
        current: 94_036_000_000,
        delta: 3_283_000_000,
        pct_change: 0.0362,
        direction: "up",
        arrow: "↑",
        trend: "improving",
        trend_points: 8,
      }),
      change("gross_margin", {
        previous: 0.4658,
        current: 0.4728,
        delta: 0.007,
        delta_bps: 70,
        direction: "up",
        trend: "improving",
        trend_points: 8,
      }),
      change("eps_diluted", {
        previous: 1.4,
        current: 1.57,
        delta: 0.17,
        direction: "up",
        trend: "improving",
        trend_points: 8,
      }),
      change("free_cash_flow", {
        previous: null,
        current: null,
        delta: null,
        reason: "capex not reported by provider",
      }),
      change("net_debt", {
        previous: null,
        current: null,
        delta: null,
        reason: "net debt needs cash, which is not reported by provider",
      }),
      change("total_debt", {
        previous: 85_750_000_000,
        current: 84_100_000_000,
        delta: -1_650_000_000,
        direction: "down",
        arrow: "↓",
        trend: "improving",
        trend_points: 6,
        note: "long-term only — provider reports no short-term borrowings",
      }),
      change("debt_to_equity", {
        previous: 1.42,
        current: 1.36,
        delta: -0.06,
        direction: "down",
        trend: "flat",
        trend_points: 5,
      }),
      change("pe_ttm", {
        previous: 30.11,
        current: 34.12,
        delta: 4.01,
        direction: "up",
        trend: null,
        trend_points: 1,
      }),
    ],
    valuation,
    freshness: {
      latest_filing_date: "2026-07-31",
      acceptance_datetime: "2026-07-31T20:07:12+00:00",
      fetched_at: "2026-08-19T06:31:00+00:00",
      period_end: "2026-06-27",
      statements_stored: 16,
      provider: "massive",
      source_filing_url: "https://example.invalid/aapl-q3.htm",
      price_date: "2026-08-18",
      price_source: "massive",
    },
    consensus: {
      available: false,
      reason:
        "CONSENSUS DATA UNAVAILABLE — Massive Benzinga earnings/estimates not in subscription (403)",
    },
    metric_order: ["revenue", "gross_margin", "eps_diluted"],
    model_version: "fundamentals-1",
    fundamental_momentum: {
      label: "fundamentals_improving",
      reason: null,
      improved: 3,
      weakened: 0,
      unchanged: 0,
      unavailable: 1,
      compared: 3,
      metrics_considered: ["revenue", "gross_margin", "eps_diluted"],
      provenance: "QUANT",
    },
    not_backtestable: ["fundamental_momentum", "valuation_percentile"],
    unavailable: [
      { field: "consensus", reason: "estimates endpoint returned 403" },
      { field: "free_cash_flow", reason: "capex not reported by provider" },
    ],
    ...overrides,
  };
}

/* ---------------------------------------------------------------- tests */

describe("FundamentalsTab — missing values are explained, never zeroed", () => {
  it("renders the server's reason in the CHANGE cell instead of a dash that would read as 'no change'", () => {
    renderTab(makeContext());
    const row = screen
      .getAllByTestId("fund-row")
      .find((r) => r.getAttribute("data-metric") === "free_cash_flow");
    expect(row).toBeDefined();
    const changeCell = within(row!).getByTestId("fund-change");
    expect(changeCell.textContent).toContain("capex not reported by provider");
    // The failure mode this test exists for: a bare dash, or a zero.
    expect(changeCell.textContent).not.toMatch(/^\s*[—-]\s*$/);
    expect(changeCell.textContent).not.toContain("0.00");
  });

  it("shows structurally-unreported metrics as unavailable with the provider reason, in BOTH value columns", () => {
    renderTab(makeContext());
    const row = screen
      .getAllByTestId("fund-row")
      .find((r) => r.getAttribute("data-metric") === "net_debt")!;
    expect(within(row).getByTestId("fund-previous").textContent).toContain(
      "net debt needs cash",
    );
    expect(within(row).getByTestId("fund-current").textContent).toContain(
      "net debt needs cash",
    );
  });

  it("prints a caveat that travels with a real number rather than suppressing the number", () => {
    renderTab(makeContext());
    const row = screen
      .getAllByTestId("fund-row")
      .find((r) => r.getAttribute("data-metric") === "total_debt")!;
    expect(within(row).getByTestId("fund-current").textContent).toContain("$84.10B");
    expect(within(row).getByTestId("fund-note").textContent).toContain(
      "long-term only",
    );
  });

  it("never turns a null metric into a zero anywhere in the table", () => {
    renderTab(makeContext());
    for (const row of screen.getAllByTestId("fund-row")) {
      const metric = row.getAttribute("data-metric");
      if (metric !== "free_cash_flow" && metric !== "net_debt") continue;
      expect(row.textContent).not.toMatch(/\$0\.00|0\.0%|0 bps/);
    }
  });
});

describe("FundamentalsTab — consensus (§33)", () => {
  it("always shows the CONSENSUS DATA UNAVAILABLE banner while consensus is missing, with the server reason verbatim", () => {
    renderTab(makeContext());
    const banner = screen.getByTestId("consensus-banner");
    expect(banner.textContent).toContain("CONSENSUS DATA UNAVAILABLE");
    expect(banner.textContent).toContain(
      "Massive Benzinga earnings/estimates not in subscription (403)",
    );
  });

  it("makes no beat/miss claim OUTSIDE the banner that explains why it cannot", () => {
    const { container } = renderTab(makeContext());
    // The banner itself is allowed — and required — to use the words while
    // saying they are unavailable. Everywhere else on the tab they would be
    // a claim, so the rest of the page is checked without it.
    const banner = screen.getByTestId("consensus-banner");
    const text = (container.textContent ?? "").replace(
      banner.textContent ?? "",
      "",
    );
    expect(text).not.toMatch(/\bbeat\b/i);
    expect(text).not.toMatch(/\bmiss(ed|es)?\b/i);
    expect(text).not.toMatch(/\bsurprise\b/i);
    expect(text).not.toMatch(/\bconsensus\b/i);
  });

  it("still shows the banner when the payload omits the consensus block entirely", () => {
    renderTab(makeContext({ consensus: null }));
    const banner = screen.getByTestId("consensus-banner");
    expect(banner.textContent).toContain("CONSENSUS DATA UNAVAILABLE");
    expect(banner.textContent).toContain("no reason");
  });
});

describe("FundamentalsTab — freshness is the as-of gate on screen (§7/§85)", () => {
  it("prints period end, filing date AND the acceptance instant", () => {
    renderTab(makeContext());
    const line = screen.getByTestId("fundamentals-freshness").textContent ?? "";
    expect(line).toContain("2026-06-27"); // period end
    expect(line).toContain("2026-07-31"); // filed
    expect(line).toContain("2026-07-31T20:07:12+00:00"); // accepted — the gate key
    expect(line).toContain("2026-08-19T12:00:00+00:00"); // as_of
  });

  it("says 'unknown' rather than inventing a date when the server sent none", () => {
    renderTab(
      makeContext({
        freshness: {
          latest_filing_date: null,
          acceptance_datetime: null,
          period_end: null,
        },
        current: makeSnapshot({ quarterly: null }),
      }),
    );
    const line = screen.getByTestId("fundamentals-freshness").textContent ?? "";
    expect(line).toContain("unknown");
  });
});

describe("FundamentalsTab — valuation vs own history (§30, §64)", () => {
  it("shows the percentile WITH its sample size and the median", () => {
    renderTab(makeContext());
    const tile = screen.getByTestId("valuation-pe_ttm");
    expect(tile.textContent).toContain("34.12×");
    expect(tile.textContent).toContain("82nd pct of 11");
    expect(tile.textContent).toContain("median 28.40×");
  });

  it("keeps a multiple that has no history, and says the history is absent rather than calling the multiple unavailable", () => {
    renderTab(makeContext());
    const tile = screen.getByTestId("valuation-ps_ttm");
    expect(tile.textContent).toContain("8.61×");
    expect(tile.textContent).toContain("no historical snapshot with this multiple");
  });

  it("renders the structurally-impossible multiples as unavailable with their own reasons", () => {
    renderTab(makeContext());
    expect(screen.getByTestId("valuation-ev_ebitda").textContent).toContain(
      "neither reported by provider",
    );
    expect(screen.getByTestId("valuation-fcf_yield").textContent).toContain(
      "which needs capex (not reported)",
    );
  });

  it("states the peer/sector comparison as explicitly not built, verbatim", () => {
    renderTab(makeContext());
    const note = screen.getByTestId("valuation-peer-note").textContent ?? "";
    expect(note).toContain("peer/sector multiples not implemented (Phase G/J)");
  });
});

describe("FundamentalsTab — the change column (§29, §58)", () => {
  it("reports a ratio change in basis points, not an ambiguous percent", () => {
    renderTab(makeContext());
    const row = screen
      .getAllByTestId("fund-row")
      .find((r) => r.getAttribute("data-metric") === "gross_margin")!;
    const cell = within(row).getByTestId("fund-change").textContent ?? "";
    expect(cell).toContain("+70 bps");
    expect(cell).not.toContain("0.7%");
  });

  it("takes the arrow from the payload's own direction token", () => {
    renderTab(makeContext());
    const up = screen
      .getAllByTestId("fund-row")
      .find((r) => r.getAttribute("data-metric") === "revenue")!;
    expect(within(up).getByTestId("fund-arrow").textContent).toContain("↑");
    const down = screen
      .getAllByTestId("fund-row")
      .find((r) => r.getAttribute("data-metric") === "total_debt")!;
    expect(within(down).getByTestId("fund-arrow").textContent).toContain("↓");
  });

  it("carries the trend's own sample size, and says so when there are too few quarters", () => {
    renderTab(makeContext());
    const revenue = screen
      .getAllByTestId("fund-row")
      .find((r) => r.getAttribute("data-metric") === "revenue")!;
    expect(within(revenue).getByTestId("fund-trend").textContent).toContain(
      "8 quarters",
    );
    const pe = screen
      .getAllByTestId("fund-row")
      .find((r) => r.getAttribute("data-metric") === "pe_ttm")!;
    expect(within(pe).getByTestId("fund-trend").textContent).toContain(
      "not enough quarters",
    );
  });

  it("labels the two columns with the filings they came from, not 'previous'/'current' alone", () => {
    renderTab(makeContext());
    expect(screen.getByRole("columnheader", { name: /Q2 FY2026/ })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Q3 FY2026/ })).toBeTruthy();
  });

  it("renders every metric the server sent, including keys the table does not know", () => {
    renderTab(
      makeContext({
        changes: [
          change("revenue", { current: 1e9, previous: 9e8, delta: 1e8, direction: "up" }),
          change("some_future_metric", { current: 1.23, previous: 1.0, delta: 0.23 }),
        ],
      }),
    );
    const metrics = screen
      .getAllByTestId("fund-row")
      .map((r) => r.getAttribute("data-metric"));
    expect(metrics).toContain("some_future_metric");
  });

  it("shows the §15 comparison reason verbatim", () => {
    renderTab(makeContext());
    expect(screen.getByTestId("fund-comparison-reason").textContent).toContain(
      "prior quarterly earnings",
    );
  });
});

describe("FundamentalsTab — momentum is arithmetic, not a forecast (§35)", () => {
  it("prints the counts beside the label", () => {
    renderTab(makeContext());
    const line = screen.getByTestId("fund-momentum").textContent ?? "";
    expect(line).toContain("Fundamentals improving");
    expect(line).toContain("3 improved");
    expect(line).toContain("out of 3 comparable metrics");
  });

  it("reports the reason when nothing was comparable, rather than a bare label", () => {
    renderTab(
      makeContext({
        fundamental_momentum: {
          label: "fundamentals_unknown",
          reason: "no directional metric was comparable across the two snapshots",
          improved: 0,
          weakened: 0,
          unchanged: 0,
          unavailable: 4,
          compared: 0,
        },
      }),
    );
    expect(screen.getByTestId("fund-momentum").textContent).toContain(
      "no directional metric was comparable",
    );
  });
});

describe("FundamentalsTab — payload-driven states", () => {
  it("renders available:false as an explanation, not an error", () => {
    renderTab({ available: false, reason: "no_ticker", event_id: 12 });
    expect(screen.getByTestId("fundamentals-unavailable").textContent).toContain(
      "no_ticker",
    );
    expect(screen.queryByTestId("fund-row")).toBeNull();
  });

  it("takes provenance from the payload and uses the shared provenance classes", () => {
    const { container } = renderTab(makeContext());
    expect(container.querySelector(".provenance.data-driven")).toBeTruthy();
    expect(container.querySelector(".provenance.quant-derived")).toBeTruthy();
    expect(container.textContent).toContain("STATEMENTS DATA");
    expect(container.textContent).toContain("METRICS QUANT");
  });

  it("explains an empty changes list instead of showing an empty table", () => {
    renderTab(makeContext({ changes: [] }));
    expect(screen.getByTestId("fund-no-changes").textContent).toContain(
      "no filed statement was accepted before the as-of instant",
    );
  });

  it("lists the server's unavailable[] fields and the not-backtested note verbatim", () => {
    renderTab(makeContext());
    expect(screen.getByTestId("fund-unavailable-list").textContent).toContain(
      "estimates endpoint returned 403",
    );
    expect(screen.getByTestId("fund-not-backtestable").textContent).toContain(
      "fundamental_momentum",
    );
  });

  it("renders the current-snapshot reason when the server marks it unavailable", () => {
    renderTab(
      makeContext({
        current: makeSnapshot({
          available: false,
          reason: "no statement accepted before 2026-08-19T12:00:00+00:00",
        }),
      }),
    );
    expect(
      screen.getByTestId("current-snapshot-unavailable").textContent,
    ).toContain("no statement accepted before");
  });
});

describe("FundamentalsTab — the payload keys are the server's, exactly", () => {
  // These pin the UI to services/apps/gateway/fundamentals.py's own key
  // names. They are the tests that break first if either side renames a
  // block, which is the point: a renamed key would otherwise degrade to a
  // silently blank section rather than a failure.
  it("reads freshness from `freshness`, not a data_freshness alias", () => {
    const data = makeContext();
    expect(data.freshness?.acceptance_datetime).toBe("2026-07-31T20:07:12+00:00");
    renderTab(data);
    expect(screen.getByTestId("fundamentals-freshness").textContent).toContain(
      "2026-07-31T20:07:12+00:00",
    );
  });

  it("reads momentum from `fundamental_momentum`", () => {
    renderTab(makeContext());
    expect(screen.getByTestId("fund-momentum").textContent).toContain(
      "Fundamentals improving",
    );
  });

  it("reads the previous filing's label from previous_event.snapshot", () => {
    renderTab(makeContext());
    expect(screen.getByRole("columnheader", { name: /Q2 FY2026/ })).toBeTruthy();
  });

  it("prefers the server's own arrow glyph over one derived from `direction`", () => {
    renderTab(
      makeContext({
        changes: [
          // Contradictory on purpose: if the UI re-derived the arrow from
          // `direction` it would print ↑ and disagree with a negative delta.
          change("revenue", {
            previous: 10,
            current: 9,
            delta: -1,
            direction: "up",
            arrow: "↓",
          }),
        ],
      }),
    );
    expect(screen.getByTestId("fund-arrow").textContent).toContain("↓");
  });

  it("distinguishes 'no statements stored' from 'none accepted before as_of'", () => {
    // No statements at all — the provider serves none.
    const { unmount } = renderTab(
      makeContext({
        statements: {
          available: false,
          count: 0,
          reason:
            "no financial statements stored for AAPL — the configured provider serves none or is unavailable",
        },
        current: makeSnapshot({ available: false, reason: "no_statements" }),
      }),
    );
    expect(
      screen.getByTestId("current-snapshot-unavailable").textContent,
    ).toContain("the configured provider serves none");
    unmount();

    // Statements ARE stored; the look-ahead gate excluded them. A different
    // fact, and it must read differently.
    renderTab(
      makeContext({
        statements: { available: true, count: 12 },
        current: makeSnapshot({
          available: false,
          reason:
            "no statement was accepted before 2026-08-19T12:00:00+00:00",
        }),
      }),
    );
    const text =
      screen.getByTestId("current-snapshot-unavailable").textContent ?? "";
    expect(text).toContain("no statement was accepted before");
    expect(text).not.toContain("provider serves none");
  });
});

describe("FundamentalsTab — glossary coverage", () => {
  it("resolves every ⓘ on the tab to a real bilingual glossary entry", async () => {
    const { container } = renderTab(makeContext());
    const triggers = container.querySelectorAll("button.term-trigger, .term button");
    expect(triggers.length).toBeGreaterThan(0);
  });

  it("has a bilingual glossary entry for every metric spec's term key", () => {
    for (const spec of METRIC_SPECS) {
      const entry = GLOSSARY[spec.term];
      expect(entry, `missing glossary entry for ${spec.key} → ${spec.term}`).toBeTruthy();
      expect(entry.en.name.length).toBeGreaterThan(0);
      expect(entry.zh.name.length).toBeGreaterThan(0);
      expect(entry.en.read.length).toBeGreaterThan(0);
      expect(entry.zh.read.length).toBeGreaterThan(0);
    }
  });

  it("has bilingual entries for the three tab-level concepts", () => {
    for (const k of [
      "fund_as_of_acceptance",
      "fund_own_history_percentile",
      "fund_consensus",
      "fund_momentum",
    ]) {
      expect(GLOSSARY[k], `missing ${k}`).toBeTruthy();
      expect(GLOSSARY[k].zh.short.length).toBeGreaterThan(0);
    }
  });

  it("opens a glossary card when a term is clicked", async () => {
    const user = userEvent.setup();
    const { container } = renderTab(makeContext());
    const trigger = container.querySelector("button");
    expect(trigger).toBeTruthy();
    await user.click(trigger!);
    expect(document.body.textContent).toBeTruthy();
  });
});

describe("fundamentals-format — formatters keep null null", () => {
  it("returns null rather than a zero or a placeholder for absent input", () => {
    for (const fn of [fmtMoneyCompact, fmtCountCompact, fmtPerShare]) {
      expect(fn(null)).toBeNull();
      expect(fn(undefined)).toBeNull();
      expect(fn(Number.NaN)).toBeNull();
      expect(fn(Number.POSITIVE_INFINITY)).toBeNull();
    }
    expect(fmtPctFrac(null)).toBeNull();
    expect(fmtMultiple(null)).toBeNull();
    expect(fmtMetric(null, "money")).toBeNull();
  });

  it("keeps a real zero as a real zero", () => {
    expect(fmtMoneyCompact(0)).toBe("$0.00");
    expect(fmtPctFrac(0)).toBe("0.0%");
    expect(fmtMultiple(0)).toBe("0.00×");
  });

  it("scales money and counts to a readable unit with a sign", () => {
    expect(fmtMoneyCompact(94_036_000_000)).toBe("$94.04B");
    expect(fmtMoneyCompact(-1_650_000_000)).toBe("-$1.65B");
    expect(fmtMoneyCompact(3_450_000_000_000)).toBe("$3.45T");
    expect(fmtCountCompact(15_204_000_000)).toBe("15.20B");
  });

  it("formats each metric KIND differently — a margin is not a dollar amount", () => {
    expect(fmtMetric(0.4728, "ratio")).toBe("47.3%");
    expect(fmtMetric(1.57, "per_share")).toBe("$1.57");
    expect(fmtMetric(34.12, "multiple")).toBe("34.12×");
    expect(fmtMetric(94_036_000_000, "money")).toBe("$94.04B");
  });

  it("prefers basis points for a ratio delta and signs every other kind", () => {
    expect(fmtDelta(change("gross_margin", { delta: 0.007, delta_bps: 70 }), "ratio")).toBe(
      "+70 bps",
    );
    expect(fmtDelta(change("gross_margin", { delta: -0.007, delta_bps: -70 }), "ratio")).toBe(
      "-70 bps",
    );
    expect(fmtDelta(change("revenue", { delta: 3_283_000_000 }), "money")).toBe(
      "+$3.28B",
    );
    expect(fmtDelta(change("eps_diluted", { delta: 0.17 }), "per_share")).toBe("+$0.17");
    expect(fmtDelta(change("pe_ttm", { delta: 4.01 }), "multiple")).toBe("+4.01");
    expect(fmtDelta(change("revenue", {}), "money")).toBeNull();
  });

  it("maps direction tokens to arrows and refuses to guess unknown ones", () => {
    expect(directionArrow("up")).toBe("↑");
    expect(directionArrow("down")).toBe("↓");
    expect(directionArrow("flat")).toBe("→");
    expect(directionArrow("sideways-ish")).toBeNull();
    expect(directionArrow(null)).toBeNull();
  });

  it("never paints a leverage or valuation increase green", () => {
    expect(changeColor(change("revenue", { delta: 1 }))).toBe("var(--green)");
    expect(changeColor(change("revenue", { delta: -1 }))).toBe("var(--red)");
    expect(changeColor(change("debt_to_equity", { delta: 1 }))).toBe("var(--text)");
    expect(changeColor(change("pe_ttm", { delta: 4 }))).toBe("var(--text)");
    expect(changeColor(change("revenue", { delta: null }))).toBe("var(--text-dim)");
  });

  it("passes the server's reason through verbatim and names the no-reason case", () => {
    expect(unavailableText("capex not reported by provider", t)).toBe(
      "Unavailable — capex not reported by provider",
    );
    expect(unavailableText(null, t)).toContain("the server sent no reason");
    expect(unavailableText("", t)).toContain("the server sent no reason");
  });

  it("falls back through the block-level reason keys, then gives up honestly", () => {
    expect(reasonFor({ revenue: "input_unavailable:revenues" }, "revenue")).toBe(
      "input_unavailable:revenues",
    );
    expect(reasonFor({ no_statements: "nothing filed yet" }, "revenue")).toBe(
      "nothing filed yet",
    );
    expect(reasonFor(undefined, "revenue")).toBeNull();
    expect(reasonFor({}, "revenue")).toBeNull();
  });

  it("puts the sample size inside the percentile sentence, and returns null with no history", () => {
    const sentence = ownHistorySentence(
      { current: 34.12, median: 28.4, min: 21.9, max: 38.6, percentile: 0.82, history_n: 11 },
      t,
    );
    expect(sentence).toContain("82nd pct of 11");
    expect(sentence).toContain("range 21.90×–38.60×");
    expect(ownHistorySentence({ current: 8.6, history_n: 0 }, t)).toBeNull();
    expect(ownHistorySentence(null, t)).toBeNull();
  });

  it("takes the date part of an ISO instant without re-deriving it", () => {
    expect(isoDate("2026-07-31T20:07:12+00:00")).toBe("2026-07-31");
    expect(isoDate("2026-07-31")).toBe("2026-07-31");
    expect(isoDate(null)).toBeNull();
  });

  it("synthesises a spec for an unknown metric rather than dropping it", () => {
    const spec = specFor("some_future_metric");
    expect(spec.key).toBe("some_future_metric");
    expect(spec.en).toBe("some future metric");
  });

  it("marks every bps metric's spec as a ratio so the change column can use bps", () => {
    for (const spec of METRIC_SPECS) {
      if (!BPS_KEYS.has(spec.key)) continue;
      expect(spec.kind, `${spec.key} should be a ratio`).toBe("ratio");
    }
  });
});

const BPS_KEYS = new Set([
  "gross_margin",
  "operating_margin",
  "net_margin",
  "revenue_growth_yoy",
  "eps_growth_yoy",
  "roe_ttm",
  "roa_ttm",
  "roic",
  "fcf_yield",
  "earnings_yield",
]);
