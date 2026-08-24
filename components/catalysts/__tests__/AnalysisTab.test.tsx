/**
 * Phase F §46-§52 Analysis-tab tests.
 *
 * Each of these pins a rule where a plausible-looking implementation lies:
 *
 *  1. §49's three tiers are SEPARABLE ON SCREEN. The evidence panel may
 *     never wear an LLM chip and the narrative panel may never wear a DATA
 *     one — a component that took a `tier` prop and got it wrong once would
 *     dress model prose as measurement, which is the exact failure §49
 *     exists to prevent.
 *  2. §51 is THREE cards, always, in a fixed order — never the two-sided
 *     "bullish / bearish" split, and never with a card silently dropped
 *     because the model returned nothing for it.
 *  3. NO PROBABILITIES AND NO DIRECTIONAL COLOUR. Confidence is a word, not
 *     a number, and it renders in the neutral badge; the "not a probability"
 *     note is unconditional.
 *  4. §33: CONSENSUS IS AN EXPLICIT ABSENCE. The unavailable marker renders
 *     as its own notice with the server's verbatim reason — never as a blank
 *     row, which on an earnings screen reads as "no surprise expected".
 *  5. §47: A FAILED NUMBER CHECK IS SHOWN, NOT HIDDEN. INVALID still renders
 *     the analysis, under a banner listing every violation verbatim.
 *  6. A PROVIDER FAILURE IS NOT AN EMPTY PAGE — FAILED keeps the evidence,
 *     expanded, with the error printed.
 *  7. The 404 is the ORDINARY FIRST VISIT with its remedy attached, and the
 *     503 disables the button WITH a reason rather than hiding it.
 *  8. Wire key spelling matches the U3 serializer exactly — getting this
 *     wrong is precisely the seam bug this suite exists to catch.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type {
  EventAnalysisBody,
  EventAnalysisPayload,
  EvidenceBundle,
} from "@/lib/types";
import { AnalysisTabContent } from "../AnalysisTab";
import {
  NARRATIVE_KEYS,
  SCENARIO_KEYS,
  bundleSections,
  buildRefIndex,
  confidenceBadge,
  consensusUnavailable,
  hasViolations,
  narrativeText,
  pathExists,
  quotedNumbers,
  resolveRefs,
  scenarioEmpty,
  stringList,
  tierOf,
  usageText,
} from "../analysis-format";

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
 * Keys spelled exactly as the U3 `serialize_analysis` payload emits them:
 * `bundle`, `analysis`, `event_status_badge`, `prompt_version`, `violations`.
 */
function makeBundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    as_of: "2026-08-19T13:00:00+00:00",
    event: { tier: "DATA", event_key: "ACME:EARNINGS:2026Q3", ticker: "ACME" },
    previous_event: { tier: "DATA", event_key: "ACME:EARNINGS:2026Q2" },
    previous_event_results: {
      tier: "DATA",
      kind: "REPORTED_FACT",
      eps: 1.31,
      revenue: 4210000000,
    },
    previous_market_reaction: {
      tier: "QUANT",
      coverage: { bars: "complete" },
      return_1d_pct: 6.4,
    },
    fundamentals: {
      tier: "DATA",
      available: false,
      reason: "no filings stored for this ticker",
    },
    price_analysis: {
      tier: "QUANT",
      coverage: { sessions: 63 },
      run_up_pct: 17.2,
    },
    options_analysis: { tier: "QUANT", status: "NOT_AVAILABLE_YET" },
    news: {
      tier: "DATA",
      coverage: { articles_stored: 42 },
      clusters: [
        {
          cluster_id: "c:abc123",
          canonical_article: {
            safe_title: "Acme raises full-year guidance",
            url: "https://example.com/acme-guidance",
          },
        },
      ],
    },
    consensus: {
      status: "CONSENSUS_DATA_UNAVAILABLE",
      reason: "no consensus/estimate provider in subscription",
    },
    expectations_gap: { tier: "QUANT", fundamental_momentum: 0.4 },
    source_metadata: [
      { section: "news", provider: "benzinga", as_of: "2026-08-19T13:00:00+00:00" },
    ],
    prior_analyses: [
      {
        id: 7,
        event_key: "ACME:EARNINGS:2026Q2",
        as_of: "2026-05-14T13:00:00+00:00",
        regime: "BEAT_PRICED",
        confidence: "LOW",
        executive_summary: "Expectations looked elevated into the May print.",
      },
    ],
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<EventAnalysisBody> = {}): EventAnalysisBody {
  return {
    executive_summary: "The setup rewards a guide, not a beat.",
    what_happened_last_time: "The stock rose after the May print.",
    what_changed_since: "Datacenter commentary broadened.",
    fundamental_developments: "No new filing has landed since May.",
    price_and_positioning: "Shares ran up ahead of the date.",
    market_expectations: "No consensus figure is available.",
    prediction_market_expectations:
      "Prediction-market pricing implies a modest move.",
    key_positive_catalysts: ["A raised full-year guide", "New datacenter customer"],
    key_negative_catalysts: ["Supply commentary softening"],
    what_matters_most: "The guide, not the quarter.",
    scenarios: {
      upside: {
        conditions: "Guidance raised above the prior range.",
        guidance_conditions: "Full-year revenue guided higher.",
        why_market_reacts: "The run-up already assumes an in-line quarter.",
        evidence_refs: ["c:abc123"],
      },
      base: {
        conditions: "Guidance reiterated.",
        guidance_conditions: "Full-year range unchanged.",
        why_market_reacts: "Nothing forces a repricing.",
        evidence_refs: [],
      },
      downside: {
        conditions: "Guidance trimmed.",
        guidance_conditions: "Full-year range narrowed downward.",
        why_market_reacts: "The run-up unwinds.",
        evidence_refs: ["price_analysis.run_up_pct"],
      },
    },
    surprise_threshold: {
      narrative: "A small beat is unlikely to move the stock on its own.",
      confidence: "LOW",
    },
    key_unknowns: ["Whether the supply commentary is company-specific"],
    invalidation: "A confirmed consensus figure would change the whole framing.",
    expectations_gap_regime: "BEAT_PRICED",
    confidence: "MODERATE",
    evidence_refs: ["c:abc123", "price_analysis.run_up_pct"],
    numbers_quoted: [{ path: "price_analysis.run_up_pct", value: 17.2 }],
    ...overrides,
  };
}

function makePayload(
  overrides: Partial<EventAnalysisPayload> = {},
): EventAnalysisPayload {
  return {
    event_id: 12,
    as_of: "2026-08-19T13:00:00+00:00",
    kind: "PRE_EVENT",
    status: "OK",
    cached: false,
    bundle: makeBundle(),
    analysis: makeAnalysis(),
    provider: "openai",
    model: "gpt-5.6-sol",
    prompt_version: "event-analysis-v1",
    usage: { input_tokens: 8400, output_tokens: 1200 },
    latency_ms: 9100,
    violations: [],
    created_at: "2026-08-19T13:00:04+00:00",
    event_status_badge: null,
    ...overrides,
  };
}

function renderTab(
  data: EventAnalysisPayload | null,
  opts: {
    notFound?: boolean;
    onGenerate?: (force: boolean) => void;
    generating?: boolean;
    llmUnconfigured?: boolean;
    llmMessage?: string | null;
  } = {},
) {
  return render(
    <LanguageProvider>
      <AnalysisTabContent
        data={data}
        notFound={opts.notFound ?? false}
        onGenerate={opts.onGenerate ?? (() => {})}
        generating={opts.generating ?? false}
        llmUnconfigured={opts.llmUnconfigured ?? false}
        llmMessage={opts.llmMessage ?? null}
      />
    </LanguageProvider>,
  );
}

/* ---------------------------------------------------------- §49 tier split */

describe("§49 — DATA / QUANT / LLM stay separable", () => {
  it("chips every tier the payload declares, using the payload's own tier key", () => {
    renderTab(makePayload());
    expect(screen.getAllByTestId("tier-chip-DATA").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("tier-chip-QUANT").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("tier-chip-LLM").length).toBeGreaterThan(0);
  });

  it("never puts a DATA chip on the narrative panel", () => {
    renderTab(makePayload());
    const narrative = screen.getByTestId("analysis-narrative");
    expect(within(narrative).queryByTestId("tier-chip-DATA")).toBeNull();
    expect(within(narrative).queryByTestId("tier-chip-QUANT")).toBeNull();
    expect(within(narrative).getAllByTestId("tier-chip-LLM").length).toBe(1);
  });

  it("never puts an LLM chip on the evidence panel", () => {
    renderTab(makePayload());
    const evidence = screen.getByTestId("evidence-panel");
    expect(within(evidence).queryByTestId("tier-chip-LLM")).toBeNull();
  });

  it("gives an unlabelled section NO chip rather than a guessed one", () => {
    // A section with no `tier` key must not inherit "DATA" — inventing a
    // fact badge for an unlabelled blob is the §49 failure mode.
    expect(tierOf({ foo: 1 })).toBeNull();
    expect(tierOf(null)).toBeNull();
    expect(tierOf({ tier: "SOMETHING_ELSE" })).toBeNull();
    expect(tierOf({ tier: "quant" })).toBe("QUANT");
  });

  it("carries the tier through the DOM as data-tier, not only as colour", () => {
    // Colour alone is not a distinction for a colour-blind reader; the tier
    // must be readable as text and as an attribute.
    renderTab(makePayload());
    const chips = screen.getAllByTestId("tier-chip-LLM");
    expect(chips[0].getAttribute("data-tier")).toBe("LLM");
    expect(chips[0].textContent).toContain("LLM ANALYSIS");
  });
});

/* ------------------------------------------------------------ §51 scenarios */

describe("§51 — three scenarios, fixed order, no probabilities", () => {
  it("renders exactly UPSIDE, BASE and DOWNSIDE", () => {
    renderTab(makePayload());
    for (const key of SCENARIO_KEYS) {
      expect(screen.getByTestId(`scenario-${key}`)).toBeTruthy();
    }
    expect(SCENARIO_KEYS).toEqual(["upside", "base", "downside"]);
  });

  it("keeps a missing leg as a labelled gap instead of dropping the card", () => {
    const analysis = makeAnalysis({
      scenarios: { upside: makeAnalysis().scenarios!.upside },
    });
    renderTab(makePayload({ analysis }));
    // All three cards still exist; the two empty ones say so.
    expect(screen.getByTestId("scenario-base")).toBeTruthy();
    expect(screen.getByTestId("scenario-downside")).toBeTruthy();
    expect(screen.getByTestId("scenario-empty-base")).toBeTruthy();
    expect(screen.getByTestId("scenario-empty-downside")).toBeTruthy();
    expect(screen.queryByTestId("scenario-empty-upside")).toBeNull();
  });

  it("prints no percentage, odds or probability wording on any card", () => {
    renderTab(makePayload());
    const cards = screen.getByTestId("scenario-cards");
    const text = cards.textContent ?? "";
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text.toLowerCase()).not.toContain("probability of");
    expect(text.toLowerCase()).not.toContain("likelihood");
  });

  it("leads each card with its conditions, not with the market reaction", () => {
    renderTab(makePayload());
    const card = screen.getByTestId("scenario-upside");
    const text = card.textContent ?? "";
    expect(text.indexOf("Conditions")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Conditions")).toBeLessThan(
      text.indexOf("Why the market reacts"),
    );
  });

  it("scenarioEmpty is true only when nothing renderable is present", () => {
    expect(scenarioEmpty(null)).toBe(true);
    expect(scenarioEmpty({})).toBe(true);
    expect(scenarioEmpty({ conditions: "   " })).toBe(true);
    expect(scenarioEmpty({ evidence_refs: ["c:1"] })).toBe(false);
    expect(scenarioEmpty({ conditions: "Guide raised" })).toBe(false);
  });
});

/* ------------------------------------------------------- §50 uncertainty */

describe("§50 — confidence is a word, never a probability", () => {
  it("renders the surprise threshold with a NEUTRAL confidence badge", () => {
    renderTab(makePayload());
    const chip = screen.getByTestId("threshold-confidence");
    expect(chip.textContent).toContain("Low confidence");
    // Never green/red: a self-reported confidence has no measured hit rate.
    expect(chip.className).toContain("dim");
    expect(chip.className).not.toContain("green");
    expect(chip.className).not.toContain("red");
    expect(confidenceBadge()).toBe("dim");
  });

  it("states the not-a-probability caveat unconditionally", () => {
    renderTab(makePayload());
    expect(screen.getByTestId("threshold-not-probability").textContent).toContain(
      "not a probability",
    );
  });

  it("renders the invalidation section — the part that makes it checkable", () => {
    renderTab(makePayload());
    expect(screen.getByText("What would invalidate this")).toBeTruthy();
    expect(
      screen.getByText(
        "A confirmed consensus figure would change the whole framing.",
      ),
    ).toBeTruthy();
  });

  it("keeps the regime chip neutral — BEAT_PRICED is not a sell signal", () => {
    renderTab(makePayload());
    const badge = screen.getByTestId("regime-badge");
    expect(badge.textContent).toContain("Beat already priced");
    expect(badge.className).toContain("dim");
    expect(badge.className).not.toContain("red");
  });
});

/* --------------------------------------------------------- §33 consensus */

describe("§33 — consensus is an explicit absence", () => {
  it("renders the unavailable notice with the server's verbatim reason", () => {
    renderTab(makePayload());
    const notice = screen.getByTestId("consensus-unavailable");
    expect(notice.textContent).toContain("No analyst estimate");
    expect(screen.getByTestId("consensus-reason").textContent).toContain(
      "CONSENSUS_DATA_UNAVAILABLE",
    );
    expect(screen.getByTestId("consensus-reason").textContent).toContain(
      "no consensus/estimate provider in subscription",
    );
  });

  it("never renders the absence as a blank row", () => {
    renderTab(makePayload());
    // The notice must be a visible statement, not an empty container.
    expect(
      (screen.getByTestId("consensus-unavailable").textContent ?? "").length,
    ).toBeGreaterThan(40);
  });

  it("consensusUnavailable is a positive test for the marker", () => {
    expect(consensusUnavailable(makeBundle())).toBe(true);
    expect(consensusUnavailable({ consensus: { eps: 1.42 } })).toBe(false);
    expect(consensusUnavailable({})).toBe(false);
  });
});

/* ---------------------------------------------------------- §47 violations */

describe("§47 — the number check is visible, pass or fail", () => {
  it("renders the analysis WITH a violations banner when INVALID", () => {
    const payload = makePayload({
      status: "INVALID",
      violations: [
        "numbers_quoted[0].path 'price_analysis.made_up' not in fact index",
        "numbers_quoted[1].value 21.0 != 17.2 at price_analysis.run_up_pct",
      ],
    });
    renderTab(payload);
    // The narrative is STILL shown — hiding it would hide the check itself.
    expect(screen.getByTestId("analysis-narrative")).toBeTruthy();
    const banner = screen.getByTestId("violations-banner");
    expect(banner.textContent).toContain("not in the evidence bundle");
    const list = screen.getByTestId("violation-list");
    expect(within(list).getAllByRole("listitem").length).toBe(2);
    // Verbatim validator wording, not a summary.
    expect(list.textContent).toContain("price_analysis.made_up");
    expect(screen.getByTestId("narrative-unverified")).toBeTruthy();
  });

  it("shows no banner and no unverified chip when the check passed", () => {
    renderTab(makePayload());
    expect(screen.queryByTestId("violations-banner")).toBeNull();
    expect(screen.queryByTestId("narrative-unverified")).toBeNull();
  });

  it("lists every quoted number with its bundle path, even on a clean run", async () => {
    renderTab(makePayload());
    const details = screen.getByTestId("numbers-quoted");
    await userEvent.click(within(details).getByText(/Numbers quoted/));
    expect(details.textContent).toContain("price_analysis.run_up_pct");
    expect(details.textContent).toContain("17.2");
    expect(details.textContent).toContain("The model computes nothing");
  });

  it("quotedNumbers drops rows with no usable path", () => {
    expect(
      quotedNumbers({ numbers_quoted: [{ path: "a.b", value: 1 }, { value: 2 }] }),
    ).toHaveLength(1);
    expect(quotedNumbers({})).toHaveLength(0);
  });

  it("hasViolations reads the payload, not the status alone", () => {
    expect(hasViolations(makePayload())).toBe(false);
    expect(hasViolations(makePayload({ violations: ["x"] }))).toBe(true);
  });
});

/* ---------------------------------------------------------- failure states */

describe("a provider failure is a state, not an empty page", () => {
  it("keeps the evidence when status is FAILED and prints the error verbatim", () => {
    const payload = makePayload({
      status: "FAILED",
      analysis: null,
      violations: [],
      error: "HTTP 429 from openai: rate_limit_exceeded",
    });
    renderTab(payload);
    expect(screen.getByTestId("analysis-failed")).toBeTruthy();
    expect(screen.getByTestId("analysis-error").textContent).toContain(
      "rate_limit_exceeded",
    );
    // The evidence is what the platform actually knows — still there.
    expect(screen.getByTestId("evidence-panel")).toBeTruthy();
    expect(screen.getByTestId("evidence-sections")).toBeTruthy();
    // No narrative panel at all: there is no narrative to label.
    expect(screen.queryByTestId("analysis-narrative")).toBeNull();
  });

  it("shows the last good analysis under a 'last attempt failed' notice", () => {
    // The GET now serves the last OK row when a NEWER run failed. Both facts
    // must be on screen: the research the platform still has, and the honest
    // statement that the refresh did not land so it may be stale. Showing
    // only the failure loses the analysis; showing only the analysis passes
    // off a possibly-stale answer as current.
    renderTab(
      makePayload({
        status: "OK",
        last_attempt: {
          id: 9,
          status: "FAILED",
          error: "httpx.ReadTimeout",
          created_at: "2026-08-19T12:00:00+00:00",
          provider: "openai",
          model: "gpt-5.6-sol",
        },
      }),
    );
    const notice = screen.getByTestId("last-attempt-notice");
    expect(notice.textContent).toContain("did not complete");
    expect(screen.getByTestId("last-attempt-error").textContent).toContain(
      "httpx.ReadTimeout",
    );
    // The analysis itself is STILL RENDERED — that is the whole point.
    expect(screen.getByTestId("analysis-narrative")).toBeTruthy();
    // And it is not mislabelled as a failure.
    expect(screen.queryByTestId("analysis-failed")).toBeNull();
  });

  it("shows no last-attempt notice when nothing newer failed", () => {
    renderTab(makePayload({ status: "OK" }));
    expect(screen.queryByTestId("last-attempt-notice")).toBeNull();
    expect(screen.getByTestId("analysis-narrative")).toBeTruthy();
  });

  it("renders BUNDLE_ONLY as a named state rather than a blank panel", () => {
    renderTab(makePayload({ status: "BUNDLE_ONLY", analysis: null }));
    expect(screen.getByTestId("analysis-bundle-only").textContent).toContain(
      "evidence bundle only",
    );
    expect(screen.getByTestId("evidence-sections")).toBeTruthy();
  });
});

/* ------------------------------------------------------- 404 / 503 states */

describe("the 404 is the first visit and the 503 is a setting", () => {
  it("renders the call-to-action, not an error, when nothing is stored", () => {
    renderTab(null, { notFound: true });
    const panel = screen.getByTestId("analysis-none");
    expect(panel.textContent).toContain("No analysis has been generated");
    expect(panel.textContent).toContain("never calls the model");
    // The remedy is attached to the explanation.
    expect(screen.getByTestId("generate-analysis")).toBeTruthy();
    expect(screen.queryByTestId("analysis-load-error")).toBeNull();
  });

  it("still shows the evidence on a first visit, expanded", () => {
    // The bundle came from the evidence endpoint; the model is an ADDITION
    // to this tab, not the price of admission to it.
    renderTab({ bundle: makeBundle() } as EventAnalysisPayload, { notFound: true });
    expect(screen.getByTestId("evidence-sections")).toBeTruthy();
    expect(screen.getByTestId("consensus-unavailable")).toBeTruthy();
  });

  it("fires the generate handler without force on a first visit", async () => {
    const calls: boolean[] = [];
    renderTab(null, { notFound: true, onGenerate: (f) => calls.push(f) });
    await userEvent.click(screen.getByTestId("generate-analysis"));
    expect(calls).toEqual([false]);
  });

  it("fires it WITH force from the regenerate button", async () => {
    const calls: boolean[] = [];
    renderTab(makePayload(), { onGenerate: (f) => calls.push(f) });
    await userEvent.click(screen.getByTestId("generate-analysis"));
    expect(calls).toEqual([true]);
  });

  it("disables the button WITH a reason when the LLM is unconfigured", () => {
    renderTab(null, {
      notFound: true,
      llmUnconfigured: true,
      llmMessage: "LLM_PROVIDER is not set",
    });
    const button = screen.getByTestId("generate-analysis") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const note = screen.getByTestId("llm-not-configured");
    expect(note.textContent).toContain("No language-model provider is connected");
    // Server message rendered verbatim, never paraphrased.
    expect(note.textContent).toContain("LLM_PROVIDER is not set");
  });

  it("disables the button while a generation is in flight", () => {
    renderTab(makePayload(), { generating: true });
    const button = screen.getByTestId("generate-analysis") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Generating");
  });
});

/* ------------------------------------------------------------- provenance */

describe("the header says how much to trust the prose", () => {
  it("prints as-of, provider/model, prompt version, usage and latency", () => {
    renderTab(makePayload());
    expect(screen.getByTestId("analysis-as-of").textContent).toContain("2026-08-19");
    expect(screen.getByTestId("analysis-model").textContent).toBe(
      "openai/gpt-5.6-sol",
    );
    expect(screen.getByTestId("analysis-prompt-version").textContent).toBe(
      "event-analysis-v1",
    );
    expect(screen.getByTestId("analysis-usage").textContent).toBe(
      "in 8400 · out 1200",
    );
    expect(screen.getByTestId("analysis-latency").textContent).toBe("9100 ms");
  });

  it("labels a cached answer and says no model ran", () => {
    renderTab(makePayload({ cached: true }));
    expect(screen.getByTestId("analysis-cached").textContent).toContain("CACHED");
    expect(screen.getByTestId("cached-note").textContent).toContain(
      "No model ran for this view",
    );
  });

  it("omits the cached label when a model actually ran", () => {
    renderTab(makePayload({ cached: false }));
    expect(screen.queryByTestId("analysis-cached")).toBeNull();
    expect(screen.queryByTestId("cached-note")).toBeNull();
  });

  it("badges an ESTIMATED event before a word of analysis is read (§7)", () => {
    renderTab(makePayload({ event_status_badge: "ESTIMATED" }));
    expect(screen.getByTestId("event-status-badge").textContent).toBe("ESTIMATED");
  });

  it("usageText prints only the counts the server actually sent", () => {
    expect(usageText(null)).toBeNull();
    expect(usageText({})).toBeNull();
    expect(usageText({ input_tokens: 10 })).toBe("in 10");
    expect(usageText({ input_tokens: 10, output_tokens: 2 })).toBe("in 10 · out 2");
  });
});

/* -------------------------------------------------------- §48 narrative */

describe("§48 — the narrative sections keep the spec's order", () => {
  it("renders every prose section the model filled, in order", () => {
    renderTab(makePayload());
    const panel = screen.getByTestId("analysis-narrative");
    const text = panel.textContent ?? "";
    const order = [
      "Executive summary",
      "What happened last time",
      "What changed since",
      "Fundamental developments",
      "Price & positioning",
      "Market expectations",
      // v2 (Catalyst research upgrade): prediction-market pricing is its own
      // section, between the consensus-flavoured expectations and the
      // judgement call — so the reader can see whether contract pricing was
      // discussed at all without hunting inside another paragraph.
      "Prediction-market pricing",
      "What matters most this event",
    ];
    let last = -1;
    for (const heading of order) {
      const idx = text.indexOf(heading);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
    expect(NARRATIVE_KEYS.length).toBe(order.length);
  });

  it("omits a section the model left blank instead of printing an empty heading", () => {
    renderTab(
      makePayload({ analysis: makeAnalysis({ what_changed_since: "   " }) }),
    );
    expect(screen.queryByText("What changed since")).toBeNull();
    expect(narrativeText("   ")).toBeNull();
    expect(narrativeText("x")).toBe("x");
    expect(narrativeText(42)).toBeNull();
  });

  it("renders both catalyst lists as bullets", () => {
    renderTab(makePayload());
    const positive = screen.getByTestId("positive-catalysts");
    expect(within(positive).getAllByRole("listitem").length).toBe(2);
    const negative = screen.getByTestId("negative-catalysts");
    expect(within(negative).getAllByRole("listitem").length).toBe(1);
    expect(screen.getByTestId("key-unknowns")).toBeTruthy();
  });

  it("stringList drops non-strings and blanks", () => {
    expect(stringList(["a", "", "  ", 3, null, "b"])).toEqual(["a", "b"]);
    expect(stringList(undefined)).toEqual([]);
  });
});

/* ------------------------------------------------------- §52 evidence refs */

describe("§52 — citations resolve to the bundle, and unresolvable ones show", () => {
  it("links a news ref to the publisher's own page", () => {
    renderTab(makePayload());
    const refs = screen.getByTestId("evidence-refs");
    const link = within(refs).getByText("Open source →") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://example.com/acme-guidance");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(refs.textContent).toContain("Acme raises full-year guidance");
  });

  it("accepts a dotted bundle PATH as a resolved ref with no link", () => {
    renderTab(makePayload());
    const refs = screen.getByTestId("evidence-refs");
    expect(refs.textContent).toContain("price_analysis.run_up_pct");
    // A path is legitimate — it must not be flagged.
    expect(within(refs).queryAllByTestId("unresolved-ref")).toHaveLength(0);
  });

  it("FLAGS a ref nothing in the bundle knows about instead of dropping it", () => {
    // Dropping it would erase the finding that the model cited a phantom.
    const analysis = makeAnalysis({ evidence_refs: ["c:does-not-exist"] });
    renderTab(makePayload({ analysis }));
    const refs = screen.getByTestId("evidence-refs");
    expect(refs.textContent).toContain("c:does-not-exist");
    expect(within(refs).getAllByTestId("unresolved-ref").length).toBe(1);
  });

  it("pathExists walks objects and arrays, and rejects a phantom path", () => {
    const bundle = makeBundle();
    expect(pathExists(bundle, "price_analysis.run_up_pct")).toBe(true);
    expect(pathExists(bundle, "news.clusters.0.cluster_id")).toBe(true);
    expect(pathExists(bundle, "news.clusters.9")).toBe(false);
    expect(pathExists(bundle, "price_analysis.made_up")).toBe(false);
    expect(pathExists(null, "a")).toBe(false);
  });

  it("buildRefIndex finds a title/url by any id key without cycling forever", () => {
    const cyclic: Record<string, unknown> = { tier: "DATA" };
    cyclic.self = cyclic;
    const index = buildRefIndex({ ...makeBundle(), loop: cyclic });
    expect(index.get("c:abc123")?.url).toBe("https://example.com/acme-guidance");
    const resolved = resolveRefs(["c:abc123", "nope"], index, makeBundle());
    expect(resolved[0].resolved).toBe(true);
    expect(resolved[1].resolved).toBe(false);
  });
});

/* --------------------------------------------------- §46 evidence sections */

describe("§46 — the bundle renders as it arrived", () => {
  it("orders known sections by the spec's reasoning order", () => {
    const keys = bundleSections(makeBundle()).map((s) => s.key);
    expect(keys.slice(0, 4)).toEqual([
      "event",
      "previous_event",
      "previous_event_results",
      "previous_market_reaction",
    ]);
    // The envelope is not a section.
    expect(keys).not.toContain("prior_analyses");
    expect(keys).not.toContain("source_metadata");
    expect(keys).not.toContain("as_of");
  });

  it("still renders a section the UI has never heard of", () => {
    // A new section from a later phase must not vanish because this file
    // has no label for it.
    const keys = bundleSections({
      ...makeBundle(),
      supply_chain_context: { tier: "DATA", note: "new in a later phase" },
    }).map((s) => s.key);
    expect(keys).toContain("supply_chain_context");
  });

  it("shows a NOT AVAILABLE badge and the verbatim reason for an empty section", async () => {
    renderTab(makePayload());
    await userEvent.click(screen.getByTestId("toggle-evidence"));
    expect(screen.getByTestId("section-unavailable-fundamentals")).toBeTruthy();
    const section = screen.getByTestId("evidence-section-fundamentals");
    await userEvent.click(within(section).getByText("Fundamentals"));
    expect(section.textContent).toContain("no filings stored for this ticker");
  });

  it("treats the NOT_AVAILABLE_YET placeholder as unavailable too", async () => {
    renderTab(makePayload());
    await userEvent.click(screen.getByTestId("toggle-evidence"));
    expect(screen.getByTestId("section-unavailable-options_analysis")).toBeTruthy();
  });

  it("prints a section's coverage without needing it expanded twice", async () => {
    renderTab(makePayload());
    await userEvent.click(screen.getByTestId("toggle-evidence"));
    const section = screen.getByTestId("evidence-section-price_analysis");
    await userEvent.click(within(section).getByText("Price analysis"));
    expect(screen.getByTestId("section-coverage-price_analysis").textContent).toContain(
      "sessions",
    );
  });

  it("keeps the bundle collapsed by default when a narrative is present", () => {
    renderTab(makePayload());
    expect(screen.queryByTestId("evidence-sections")).toBeNull();
    expect(screen.getByTestId("toggle-evidence")).toBeTruthy();
  });
});

/* -------------------------------------------------------- §69/§70 memory */

describe("§69/§70 — prior analyses are opinions, collapsed and labelled", () => {
  it("labels them PRIOR LLM OPINION and says they are not evidence", () => {
    renderTab(makePayload());
    const priors = screen.getByTestId("prior-analyses");
    expect(within(priors).getByTestId("tier-chip-LLM_PRIOR")).toBeTruthy();
    expect(priors.textContent).toContain("Prior analyses (1)");
  });

  it("keeps them collapsed — a past opinion must not read as an input", () => {
    renderTab(makePayload());
    const priors = screen.getByTestId("prior-analyses") as HTMLDetailsElement;
    expect(priors.open).toBe(false);
  });

  it("shows the event key, as-of and regime of each prior once expanded", async () => {
    renderTab(makePayload());
    const priors = screen.getByTestId("prior-analyses");
    await userEvent.click(within(priors).getByText("Prior analyses (1)"));
    expect(priors.textContent).toContain("ACME:EARNINGS:2026Q2");
    expect(priors.textContent).toContain("Beat already priced");
    expect(priors.textContent).toContain("not evidence");
  });

  it("renders nothing at all when the bundle carries no priors", () => {
    renderTab(makePayload({ bundle: makeBundle({ prior_analyses: [] }) }));
    expect(screen.queryByTestId("prior-analyses")).toBeNull();
  });
});

/* ----------------------------------------------------------- defensiveness */

describe("the tab renders whatever keys actually arrived", () => {
  it("survives a payload with an analysis and nothing else", () => {
    renderTab({ analysis: { executive_summary: "Short." } });
    expect(screen.getByTestId("analysis-narrative")).toBeTruthy();
    expect(screen.getByTestId("evidence-missing")).toBeTruthy();
  });

  it("survives a payload with no status and no analysis", () => {
    renderTab({ event_id: 3, bundle: makeBundle() });
    expect(screen.getByTestId("analysis-status").textContent).toContain("UNKNOWN");
    expect(screen.getByTestId("analysis-bundle-only")).toBeTruthy();
  });

  it("prints a boolean false and a numeric zero rather than a dash", async () => {
    const bundle = makeBundle({
      price_analysis: { tier: "QUANT", available: true, run_up_pct: 0, gapped: false },
    });
    renderTab(makePayload({ bundle }));
    await userEvent.click(screen.getByTestId("toggle-evidence"));
    const section = screen.getByTestId("evidence-section-price_analysis");
    await userEvent.click(within(section).getByText("Price analysis"));
    expect(section.textContent).toContain("false");
    expect(section.textContent).toContain("0");
  });

  it("renders in Chinese without leaking an English chrome string", () => {
    store.set("lang", "zh");
    renderTab(makePayload());
    const panel = screen.getByTestId("analysis-narrative");
    expect(panel.textContent).toContain("核心结论");
    expect(panel.textContent).toContain("情景框架");
  });
});
