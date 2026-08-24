/**
 * Phase J Evidence-tab tests.
 *
 * The tab exists for one reason: `GET /evidence` answers whether or not a
 * model ever ran, so the measured half of the analysis must be reachable
 * WITHOUT going through the guessed half. These tests pin that:
 *
 *  1. NO LLM TIER ON THIS TAB, EVER. §49's separation is enforced here by the
 *     tab BOUNDARY — there is no code path that renders model prose — and the
 *     assertion is the strongest available form of it: no LLM chip anywhere in
 *     the tree, even when the payload carries a full narrative alongside the
 *     bundle.
 *  2. THE BUNDLE OPENS EXPANDED. On the Analysis tab the bundle is collapsed
 *     under the narrative; here it IS the page, and making the reader press a
 *     button to see the only content presents data as an appendix to nothing.
 *  3. §33 CONSENSUS IS THE LOUD ABSENCE, on this tab too. It must render as
 *     its own notice with the server's verbatim reason — a blank consensus row
 *     on an earnings screen reads as "no surprise expected".
 *  4. A 404 IS A STATE WITH A REASON, NOT A RED ERROR. The evidence endpoint
 *     needs no model to have run, so an empty answer means the rows have not
 *     been collected — which is what it must say.
 *  5. A REAL FAILURE IS PRINTED VERBATIM. A paraphrased error cannot be matched
 *     against the log line that produced it.
 *  6. §7 TRAVELS WITH THE EVENT. A DERIVED date may be analysed, but the badge
 *     must be visible before anything scoped to that date is read.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { EventAnalysisPayload, EvidenceBundle } from "@/lib/types";
import { EvidenceTabContent } from "../EvidenceTab";

// This jsdom build ships no working localStorage (same shim as NewsTab.test).
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

/* ------------------------------------------------------------- fixtures */

/** Keys spelled exactly as the Phase F `serialize_analysis` payload emits them. */
function makeBundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    as_of: "2026-08-19T13:00:00+00:00",
    event: { tier: "DATA", event_key: "ACME:EARNINGS:2026Q3", ticker: "ACME" },
    previous_event_results: { tier: "DATA", kind: "REPORTED_FACT", eps: 1.31 },
    previous_market_reaction: { tier: "QUANT", coverage: { bars: "complete" }, return_1d_pct: 6.4 },
    price_analysis: { tier: "QUANT", coverage: { sessions: 63 }, run_up_pct: 17.2 },
    fundamentals: { tier: "DATA", available: false, reason: "no filings stored for this ticker" },
    // The verbatim server token (libs/trading_core/events/evidence.py
    // CONSENSUS_STATUS). Spelling it exactly is the point: `consensusUnavailable`
    // matches on it, and a fixture that invented a token would let the notice
    // silently regress into a generic section render.
    consensus: {
      status: "CONSENSUS_DATA_UNAVAILABLE",
      reason: "no consensus/estimate provider in subscription",
    },
    source_metadata: [{ source: "polygon", fetched_at: "2026-08-19T12:00:00+00:00" }],
    ...overrides,
  } as EvidenceBundle;
}

function makePayload(overrides: Partial<EventAnalysisPayload> = {}): EventAnalysisPayload {
  return {
    event_id: 41,
    as_of: "2026-08-19T13:00:00+00:00",
    status: "BUNDLE_ONLY",
    bundle: makeBundle(),
    analysis: null,
    ...overrides,
  };
}

function renderTab(props: Parameters<typeof EvidenceTabContent>[0]) {
  return render(
    <LanguageProvider>
      <EvidenceTabContent {...props} />
    </LanguageProvider>,
  );
}

/* ------------------------------------------------------------------ tests */

describe("EvidenceTab — the DATA/QUANT half, on its own surface (§46, §49)", () => {
  it("wears the DATA and QUANT chips on the heading", () => {
    renderTab({ data: makePayload() });
    expect(screen.getAllByTestId("tier-chip-DATA").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("tier-chip-QUANT").length).toBeGreaterThan(0);
  });

  /* Rule 1 — the whole reason this tab exists as a boundary. */
  it("carries NO LLM tier chip anywhere, even beside a stored narrative", () => {
    const { container } = renderTab({
      data: makePayload({
        status: "OK",
        analysis: {
          executive_summary: "The model's prose, which must not appear on this tab.",
        },
      }),
    });
    expect(screen.queryByTestId("tier-chip-LLM")).toBeNull();
    expect(container.querySelectorAll('[data-tier="LLM"]')).toHaveLength(0);
    expect(container.textContent).not.toContain("which must not appear on this tab");
  });

  it("says outright that nothing on the tab is model output", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("evidence-tab-header").textContent).toContain(
      "no model output at all",
    );
  });

  /* Rule 2. */
  it("opens the bundle expanded — here the bundle IS the page", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("evidence-sections")).toBeTruthy();
    expect(screen.getByTestId("evidence-section-price_analysis")).toBeTruthy();
  });

  it("renders each section under the tier its own payload declared", () => {
    renderTab({ data: makePayload() });
    const quant = screen.getByTestId("evidence-section-price_analysis");
    expect(quant.querySelector('[data-tier="QUANT"]')).toBeTruthy();
    const data = screen.getByTestId("evidence-section-previous_event_results");
    expect(data.querySelector('[data-tier="DATA"]')).toBeTruthy();
  });

  it("shows a section's coverage without needing it expanded", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("section-coverage-price_analysis").textContent).toContain("63");
  });

  it("marks an unavailable section and prints the server's reason verbatim", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("section-unavailable-fundamentals")).toBeTruthy();
    expect(screen.getByTestId("evidence-section-fundamentals").textContent).toContain(
      "no filings stored for this ticker",
    );
  });

  it("renders the source metadata — where each number came from and when", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("source-metadata").textContent).toContain("polygon");
  });
});

describe("EvidenceTab — consensus is the loud absence (§33)", () => {
  /* Rule 3 — a blank row reads as "no surprise expected". */
  it("renders the unavailable notice with the server's verbatim reason", () => {
    renderTab({ data: makePayload() });
    const notice = screen.getByTestId("consensus-unavailable");
    expect(notice.textContent).toContain("NO CONSENSUS");
    expect(screen.getByTestId("consensus-reason").textContent).toContain(
      "no consensus/estimate provider in subscription",
    );
  });

  it("never claims a beat or a miss is computable", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("consensus-unavailable").textContent).toContain(
      "beat or a miss",
    );
  });
});

describe("EvidenceTab — provenance", () => {
  it("prints the as-of instant the bundle was computed at", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("evidence-tab-as-of").textContent).toContain("2026-08-19");
  });

  /* Rule 6. */
  it("badges a DERIVED event date before anything scoped to it is read", () => {
    renderTab({ data: makePayload({ event_status_badge: "ESTIMATED DATE" }) });
    expect(screen.getByTestId("evidence-tab-event-badge").textContent).toContain(
      "ESTIMATED DATE",
    );
  });

  it("omits the badge when the event's own date is confirmed", () => {
    renderTab({ data: makePayload({ event_status_badge: null }) });
    expect(screen.queryByTestId("evidence-tab-event-badge")).toBeNull();
  });
});

describe("EvidenceTab — states", () => {
  /* Rule 4 — the 404 is not a failure here. */
  it("explains an absent bundle as uncollected rows, not as a failure", () => {
    renderTab({ data: null, notFound: true });
    const none = screen.getByTestId("evidence-tab-none").textContent ?? "";
    expect(none).toContain("never fetches and never calls a model");
    expect(none).toContain("not that anything failed");
    expect(screen.queryByTestId("evidence-tab-error")).toBeNull();
  });

  /* Rule 5. */
  it("prints a real failure verbatim", () => {
    renderTab({ data: null, errorMessage: "503 upstream unavailable" });
    expect(screen.getByTestId("evidence-tab-error").textContent).toContain(
      "503 upstream unavailable",
    );
  });

  it("says so when a 200 arrived carrying no bundle at all", () => {
    renderTab({ data: makePayload({ bundle: null }) });
    expect(screen.getByTestId("evidence-missing")).toBeTruthy();
  });

  it("renders with an entirely empty payload rather than throwing", () => {
    renderTab({ data: {} });
    expect(screen.getByTestId("evidence-tab")).toBeTruthy();
  });
});
