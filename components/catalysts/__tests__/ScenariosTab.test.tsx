/**
 * Phase J §50/§51 Scenarios-tab tests.
 *
 * Each pins a rule where a plausible-looking scenarios surface lies:
 *
 *  1. THE 404 IS THE ORDINARY FIRST VISIT, WITH ITS REMEDY ATTACHED. No
 *     analysis stored is the DEFAULT state of every event here — generating
 *     costs a model call and is always explicit — so it renders as a
 *     call-to-action pointing at the Analysis tab, never as an error.
 *  2. THIS TAB OWNS NO GENERATE BUTTON. Two buttons that spend money are two
 *     places to audit; the CTA navigates, it does not generate.
 *  3. §51 IS THREE CARDS, ALWAYS, IN A FIXED ORDER — never the two-sided
 *     "bullish / bearish" split, and never with a leg silently dropped
 *     because the model returned nothing for it.
 *  4. NO PROBABILITIES AND NO DIRECTIONAL COLOUR ANYWHERE. Confidence is a
 *     word, and the §50 "not a probability" note is unconditional.
 *  5. EVERYTHING HERE IS LABELLED LLM, ONCE, AT THE BOUNDARY. A tab that is
 *     entirely one tier is most honestly labelled as one — and it must never
 *     wear a DATA or QUANT chip, which would dress prose as measurement.
 *  6. §47's FAILED NUMBER CHECK IS SHOWN, NOT HIDDEN. INVALID still renders
 *     the scenarios, under a banner listing every violation verbatim — hiding
 *     them would also hide that the check runs at all.
 *  7. §50's INVALIDATION TRAVELS WITH THE SCENARIOS. A conditional whose
 *     falsifier lives on another screen is a conditional nobody checks.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { EventAnalysisBody, EventAnalysisPayload } from "@/lib/types";
import { ScenariosTabContent } from "../ScenariosTab";
import { SCENARIO_KEYS } from "../analysis-format";

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

/**
 * Keys spelled exactly as the Phase F `serialize_analysis` payload emits them —
 * `guidance_conditions` and `why_market_reacts`, per `SCENARIO_FIELDS`. Getting
 * these wrong is precisely the seam bug this suite exists to catch: a card fed
 * invented key names renders as an EMPTY leg, which looks like "the model said
 * nothing" rather than like a test fixture typo.
 */
function makeAnalysis(overrides: Partial<EventAnalysisBody> = {}): EventAnalysisBody {
  return {
    executive_summary: "Positioning is stretched into the print.",
    scenarios: {
      upside: {
        conditions: "Cloud revenue reaccelerates above the prior quarter's rate.",
        guidance_conditions: "Full-year guidance raised at the midpoint.",
        why_market_reacts: "The run-up already prices part of this.",
        evidence_refs: ["price_analysis.run_up_pct"],
      },
      base: {
        conditions: "Revenue lands within the range the last four prints described.",
        guidance_conditions: "Guidance reiterated.",
        why_market_reacts: "Nothing forces a re-rating either way.",
      },
      downside: {
        conditions: "Margin compression continues a second quarter.",
        guidance_conditions: "Full-year guidance trimmed.",
        why_market_reacts: "The multiple carries no cushion for it.",
      },
    },
    surprise_threshold: {
      narrative: "It would take a beat of more than a few points to move this.",
      confidence: "MEDIUM",
    },
    key_unknowns: ["Whether the Q2 pricing change carried into Q3."],
    invalidation: "A confirmed consensus figure would change the whole framing.",
    expectations_gap_regime: "EXPECTATIONS_ELEVATED",
    ...overrides,
  };
}

function makePayload(overrides: Partial<EventAnalysisPayload> = {}): EventAnalysisPayload {
  return {
    event_id: 41,
    as_of: "2026-08-19T13:00:00+00:00",
    status: "OK",
    provider: "anthropic",
    model: "claude-x",
    analysis: makeAnalysis(),
    violations: [],
    ...overrides,
  };
}

function renderTab(props: Parameters<typeof ScenariosTabContent>[0]) {
  return render(
    <LanguageProvider>
      <ScenariosTabContent {...props} />
    </LanguageProvider>,
  );
}

/* ------------------------------------------------------------------ tests */

describe("ScenariosTab — the 404 is the ordinary first visit", () => {
  /* Rule 1. */
  it("renders a call-to-action, not an error, when nothing is stored", () => {
    renderTab({ data: null, notFound: true });
    const cta = screen.getByTestId("scenarios-cta").textContent ?? "";
    expect(cta).toContain("No analysis is stored for this event");
    expect(cta).toContain("Analysis tab");
    expect(screen.queryByTestId("scenarios-error")).toBeNull();
  });

  it("says why nothing was generated — a model call is always explicit", () => {
    renderTab({ data: null, notFound: true });
    expect(screen.getByTestId("scenarios-cta").textContent).toContain("spends a model call");
  });

  it("treats a 200 that carried no analysis body the same way", () => {
    renderTab({ data: makePayload({ analysis: null, status: "BUNDLE_ONLY" }) });
    expect(screen.getByTestId("scenarios-cta")).toBeTruthy();
  });

  /* Rule 2 — the CTA navigates; it never spends. */
  it("navigates to the Analysis tab rather than generating anything itself", async () => {
    const user = userEvent.setup();
    const onOpenAnalysis = vi.fn();
    renderTab({ data: null, notFound: true, onOpenAnalysis });
    await user.click(screen.getByTestId("scenarios-open-analysis"));
    expect(onOpenAnalysis).toHaveBeenCalledTimes(1);
    // The ONLY button on the tab is the one that navigates. Asserted over the
    // buttons rather than over the prose (which legitimately uses the word
    // "generated" while explaining that this tab does not generate).
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("data-testid")).toBe("scenarios-open-analysis");
  });

  it("prints a real failure verbatim instead of the CTA", () => {
    renderTab({ data: null, errorMessage: "500 boom" });
    expect(screen.getByTestId("scenarios-error").textContent).toContain("500 boom");
    expect(screen.queryByTestId("scenarios-cta")).toBeNull();
  });
});

describe("ScenariosTab — §51 is three legs, always", () => {
  /* Rule 3. */
  it("renders all three scenario cards, in the fixed order", () => {
    renderTab({ data: makePayload() });
    const cards = screen.getByTestId("scenario-cards");
    for (const key of SCENARIO_KEYS) {
      expect(within(cards).getByTestId(`scenario-${key}`)).toBeTruthy();
    }
    const order = Array.from(cards.querySelectorAll("[data-testid^='scenario-']"))
      .map((el) => el.getAttribute("data-testid"))
      .filter((id) => id != null && SCENARIO_KEYS.some((k) => id === `scenario-${k}`));
    expect(order).toEqual(["scenario-upside", "scenario-base", "scenario-downside"]);
  });

  it("keeps a leg the model left empty, labelled — never silently dropped", () => {
    renderTab({
      data: makePayload({
        analysis: makeAnalysis({
          scenarios: { upside: makeAnalysis().scenarios?.upside, base: {}, downside: {} },
        }),
      }),
    });
    expect(screen.getByTestId("scenario-empty-base")).toBeTruthy();
    expect(screen.getByTestId("scenario-downside")).toBeTruthy();
  });

  it("leads each card with its conditions, not with the market reaction", () => {
    renderTab({ data: makePayload() });
    const upside = screen.getByTestId("scenario-upside").textContent ?? "";
    expect(upside.indexOf("Cloud revenue reaccelerates")).toBeLessThan(
      upside.indexOf("already prices part of this"),
    );
  });

  it("never uses the bullish/bearish split §51 forbids", () => {
    renderTab({ data: makePayload() });
    const text = screen.getByTestId("scenarios-tab").textContent ?? "";
    expect(text.toLowerCase()).not.toContain("bullish");
    expect(text.toLowerCase()).not.toContain("bearish");
  });
});

describe("ScenariosTab — no probabilities, ever (§50, §51)", () => {
  /* Rule 4. */
  it("carries no percentage anywhere on the scenario cards", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("scenario-cards").textContent ?? "").not.toMatch(/\d+\s*%/);
  });

  it("renders confidence as a word, in the neutral badge", () => {
    renderTab({ data: makePayload() });
    const chip = screen.getByTestId("threshold-confidence");
    expect(chip.textContent ?? "").not.toMatch(/\d/);
    expect(chip.className).toContain("dim");
    expect(chip.className).not.toContain("green");
    expect(chip.className).not.toContain("red");
  });

  it("states unconditionally that confidence is not a probability", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("threshold-not-probability").textContent).toContain(
      "not a probability",
    );
  });

  it("renders the §50 surprise threshold with the scenarios", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("surprise-threshold").textContent).toContain(
      "beat of more than a few points",
    );
  });
});

describe("ScenariosTab — everything here is model output, labelled once (§49)", () => {
  /* Rule 5. */
  it("wears the LLM chip", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("tier-chip-LLM")).toBeTruthy();
  });

  it("never wears a DATA or QUANT chip — prose must not be dressed as measurement", () => {
    const { container } = renderTab({ data: makePayload() });
    expect(container.querySelectorAll('[data-tier="DATA"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-tier="QUANT"]')).toHaveLength(0);
  });

  it("names the model that wrote it — two models produce two analyses", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("scenarios-model").textContent).toContain("anthropic/claude-x");
  });

  it("points back at the evidence and the full narrative", () => {
    renderTab({ data: makePayload() });
    const text = screen.getByTestId("scenarios-tab").textContent ?? "";
    expect(text).toContain("Evidence tab");
    expect(text).toContain("Analysis tab");
  });

  it("shows the as-of instant and the regime the model reported", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("scenarios-as-of").textContent).toContain("2026-08-19");
    expect(screen.getByTestId("scenarios-regime")).toBeTruthy();
  });
});

describe("ScenariosTab — a failed number check is shown (§47)", () => {
  /* Rule 6 — the dangerous one: hiding it hides that the check exists. */
  it("still renders the scenarios under a banner listing every violation", () => {
    renderTab({
      data: makePayload({
        status: "INVALID",
        violations: ["run_up_pct 21.0 not found in bundle (bundle says 17.2)"],
      }),
    });
    const banner = screen.getByTestId("scenarios-violations").textContent ?? "";
    expect(banner).toContain("NUMBERS UNVERIFIED");
    expect(banner).toContain("run_up_pct 21.0 not found in bundle");
    // The scenarios themselves survive the failed check.
    expect(screen.getByTestId("scenario-upside")).toBeTruthy();
  });

  it("shows no banner when every quoted number reproduced", () => {
    renderTab({ data: makePayload({ status: "OK", violations: [] }) });
    expect(screen.queryByTestId("scenarios-violations")).toBeNull();
  });

  it("labels a reused answer as cached rather than presenting it as fresh", () => {
    renderTab({ data: makePayload({ cached: true }) });
    expect(screen.getByTestId("scenarios-tab").textContent).toContain("CACHED");
  });
});

describe("ScenariosTab — the falsifier travels with the conditional (§50)", () => {
  /* Rule 7. */
  it("renders the invalidation line beside the scenarios", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("scenarios-invalidation").textContent).toContain(
      "A confirmed consensus figure would change the whole framing.",
    );
  });

  it("renders the key unknowns", () => {
    renderTab({ data: makePayload() });
    expect(screen.getByTestId("scenarios-unknowns").textContent).toContain(
      "Q2 pricing change carried into Q3",
    );
  });

  it("omits both when the model returned neither, rather than showing empty headings", () => {
    renderTab({
      data: makePayload({
        analysis: makeAnalysis({ invalidation: "   ", key_unknowns: [] }),
      }),
    });
    expect(screen.queryByTestId("scenarios-invalidation")).toBeNull();
    expect(screen.queryByTestId("scenarios-unknowns")).toBeNull();
  });
});
