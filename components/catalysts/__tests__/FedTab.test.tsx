/**
 * Phase H §42-§45 Fed-tab tests.
 *
 * Each pins a rule where a plausible-looking Fed screen lies:
 *
 *  1. THERE IS NO HAWKISH/DOVISH SCORE, AND NOTHING CAN PUT ONE ON SCREEN
 *     (§43). The load-bearing test in this file. Every Fed dashboard a trader
 *     has used carries a hawk-dove dial, and the temptation to add one is
 *     permanent — so the test greps the rendered DOM for the words themselves
 *     and asserts the format module exports no scorer, on a payload that
 *     deliberately smuggles a `score` key in. The dimensions are reported
 *     separately because the configuration that matters most (rate unchanged,
 *     guidance materially changed) is exactly what a scalar destroys.
 *  2. THE TWO REACTION WINDOWS ARE SEPARATE AND NEVER SUMMED (§45). A
 *     statement at 14:00 and a press conference at 14:30 routinely move
 *     markets in OPPOSITE directions. The test plants exactly that — SPY up
 *     across the statement, down across the presser — and asserts both survive
 *     as their own cells, with neither their sum nor their average anywhere.
 *  3. A DAILY BASIS CANNOT SEPARATE THE WINDOWS AND MUST SAY SO. A daily
 *     number sitting under a "14:00-14:30 ET" heading is a lie of layout, so
 *     the daily case draws an explicit warning that the 1m case does not.
 *  4. MARKET PRICING IS UNAVAILABLE, LOUDLY, IN THE SLOT WHERE THE IMPLIED
 *     PROBABILITY WOULD LIVE (§42). Like the macro consensus: an empty cell
 *     where the most-expected number belongs gets filled in from memory.
 *  5. A PROXY IS NAMED FOR WHAT IT MEASURES. The 2Y yield change is a yield
 *     change in basis points, badged PROXY — never "implied probability".
 *  6. A CHANGED SENTENCE SHOWS BOTH TEXTS (§44). The pair IS the finding;
 *     showing only the new sentence turns a diff into a quote.
 *  7. THE SOURCE DOCUMENT IS VERBATIM AND REACHABLE (§44). No truncation, no
 *     paraphrase, and the Fed's own URL always one click away.
 *  8. THE VOTE KEEPS ITS DISSENTER NAMES. "2 against" loses which way they
 *     dissented, and a dissent for a cut and one for a hold are opposite facts.
 *  9. THE UNCHANGED BULK IS COLLAPSED BUT PRESENT. A statement is mostly
 *     boilerplate; rendering forty unchanged sentences buries the three that
 *     moved, and dropping them would edit the source document.
 * 10. THE RENDERER READS DEFENSIVELY. The packet is assembled from four
 *     independent Fed documents plus stored bars, any of which can be absent;
 *     an empty or partial payload must still render.
 * 11. NOTHING IS RECOMPUTED (§61). The diff counts, the similarity ratio and
 *     the rate direction are the server's, printed as sent.
 * 12. THE TAB IS SCOPED TO FED TYPES. `isFedEventType` covers the FOMC family
 *     and Fed speeches, and rejects the macro releases and earnings.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { EventFedPayload } from "@/lib/types-fed";
import { isFedEventType } from "@/lib/types-fed";
import { FedTabContent } from "../FedTab";
import StatementDiff from "../StatementDiff";
import * as fedFormat from "../fed-format";
import {
  allReactionSymbols,
  basisText,
  changedDiffItems,
  coverageNotes,
  dailyBasis,
  dataSlotText,
  diffCount,
  diffStatusClass,
  disclaimers,
  dimensionStatusClass,
  dissenters,
  fmtChangeBp,
  fmtReturnPct,
  fmtSimilarity,
  hasPacket,
  isUnanimous,
  marketPricingText,
  orderedDimensions,
  proxyEntries,
  stampDay,
  stampMinute,
  targetRangeText,
  voteTally,
  windowReturn,
  windowSymbols,
} from "../fed-format";

// This jsdom build ships no working localStorage (same shim as MacroTab.test).
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

/* -------------------------------------------------------------- fixtures */

/**
 * Keys spelled exactly as the U3 `build_fed_payload` contract emits them:
 * `packet.previous_statement.{url,released_at,vote,target_range,paragraphs}`,
 * `packet.statement_diff.{items,counts}`, `packet.dimensions.<DIMENSION>`,
 * `packet.policy_rate_change`, `packet.previous_minutes`,
 * `packet.subsequent_speeches[]`, `packet.data`, `packet.market_pricing`,
 * `packet.previous_reaction.{statement,press_conference,basis}`,
 * `packet.coverage`, `disclaimers[]`.
 *
 * The statement language is modelled on a real FOMC statement so the diff has
 * something realistic to align: boilerplate that repeats, one sentence that is
 * reworded, one dropped and one added.
 */
function makePayload(overrides: Partial<EventFedPayload> = {}): EventFedPayload {
  return {
    event_id: 91,
    event_key: "FOMC_DECISION:2026-09-16",
    event_type: "FOMC_DECISION",
    as_of: "2026-09-01T13:00:00+00:00",
    packet: {
      previous_statement: {
        url: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm",
        released_at: "2026-07-29T18:00:00+00:00",
        title: "Federal Reserve issues FOMC statement",
        vote: {
          for: 9,
          against: 3,
          dissenters: ["Michelle W. Bowman", "Christopher J. Waller", "Austan D. Goolsbee"],
          unanimous: false,
          text: "Voting against this action were Michelle W. Bowman, Christopher J. Waller and Austan D. Goolsbee.",
        },
        target_range: {
          low_pct: 3.5,
          high_pct: 3.75,
          text: "3-1/2 to 3-3/4 percent",
        },
        paragraphs: [
          "Recent indicators suggest that economic activity has continued to expand at a moderate pace.",
          "Job gains have slowed in recent months, and the unemployment rate has edged up but remains low.",
          "Inflation remains somewhat elevated.",
          "The Committee decided to maintain the target range for the federal funds rate at 3-1/2 to 3-3/4 percent.",
          "In considering the extent and timing of additional adjustments to the target range, the Committee will carefully assess incoming data.",
          "The Committee will continue reducing its holdings of Treasury securities and agency mortgage-backed securities.",
        ],
      },
      statement_diff: {
        items: [
          {
            status: "UNCHANGED",
            previous_text:
              "Recent indicators suggest that economic activity has continued to expand at a moderate pace.",
            current_text:
              "Recent indicators suggest that economic activity has continued to expand at a moderate pace.",
            dimensions: ["GROWTH"],
            similarity: 1,
          },
          {
            status: "CHANGED",
            previous_text:
              "Job gains have remained solid, and the unemployment rate has remained low.",
            current_text:
              "Job gains have slowed in recent months, and the unemployment rate has edged up but remains low.",
            dimensions: ["EMPLOYMENT"],
            similarity: 0.72,
          },
          {
            status: "REMOVED",
            previous_text:
              "The Committee judges that the risks to achieving its employment and inflation goals are roughly in balance.",
            current_text: null,
            dimensions: ["RISK_BALANCE"],
            similarity: null,
          },
          {
            status: "ADDED",
            previous_text: null,
            current_text:
              "Uncertainty about the economic outlook has increased, and downside risks to employment have risen.",
            dimensions: ["RISK_BALANCE", "EMPLOYMENT"],
            similarity: null,
          },
          {
            status: "UNCHANGED",
            previous_text: "Inflation remains somewhat elevated.",
            current_text: "Inflation remains somewhat elevated.",
            dimensions: ["INFLATION"],
            similarity: 1,
          },
        ],
        counts: { added: 1, removed: 1, changed: 1, unchanged: 2 },
      },
      dimensions: {
        POLICY_RATE: {
          status: "UNCHANGED",
          previous: [
            "The Committee decided to maintain the target range for the federal funds rate at 3-1/2 to 3-3/4 percent.",
          ],
          current: [
            "The Committee decided to maintain the target range for the federal funds rate at 3-1/2 to 3-3/4 percent.",
          ],
          notes: null,
        },
        INFLATION: {
          status: "UNCHANGED",
          previous: ["Inflation remains somewhat elevated."],
          current: ["Inflation remains somewhat elevated."],
          notes: null,
        },
        EMPLOYMENT: {
          status: "CHANGED",
          previous: ["Job gains have remained solid, and the unemployment rate has remained low."],
          current: [
            "Job gains have slowed in recent months, and the unemployment rate has edged up but remains low.",
          ],
          notes: "One sentence reworded; one added sentence also tagged EMPLOYMENT.",
        },
        GROWTH: {
          status: "UNCHANGED",
          previous: [
            "Recent indicators suggest that economic activity has continued to expand at a moderate pace.",
          ],
          current: [
            "Recent indicators suggest that economic activity has continued to expand at a moderate pace.",
          ],
          notes: null,
        },
        BALANCE_SHEET: {
          status: "UNCHANGED",
          previous: [
            "The Committee will continue reducing its holdings of Treasury securities and agency mortgage-backed securities.",
          ],
          current: [
            "The Committee will continue reducing its holdings of Treasury securities and agency mortgage-backed securities.",
          ],
          notes: null,
        },
        FORWARD_GUIDANCE: {
          status: "CHANGED",
          previous: [
            "In considering the extent and timing of additional adjustments to the target range, the Committee will carefully assess incoming data.",
          ],
          current: [
            "In considering the extent and timing of additional adjustments to the target range, the Committee will carefully assess incoming data.",
          ],
          notes: null,
        },
        RISK_BALANCE: {
          status: "CHANGED",
          previous: [
            "The Committee judges that the risks to achieving its employment and inflation goals are roughly in balance.",
          ],
          current: [
            "Uncertainty about the economic outlook has increased, and downside risks to employment have risen.",
          ],
          notes: null,
        },
        COMMITTEE_DISPERSION: {
          status: "CHANGED",
          previous: ["Voting against this action was Michelle W. Bowman."],
          current: [
            "Voting against this action were Michelle W. Bowman, Christopher J. Waller and Austan D. Goolsbee.",
          ],
          notes: "Dissents rose from 1 to 3.",
        },
      },
      policy_rate_change: { change_bp: 0, direction: "HOLD" },
      previous_minutes: {
        url: "https://www.federalreserve.gov/monetarypolicy/fomcminutes20260617.htm",
        released_at: "2026-07-08T18:00:00+00:00",
        key_paragraphs: [
          "Participants observed that inflation had eased but remained above the Committee's 2 percent objective.",
          "Several participants noted that downside risks to employment had become more prominent.",
        ],
      },
      subsequent_speeches: [
        {
          speaker: "Jerome H. Powell",
          title: "Economic Outlook",
          at: "2026-08-22T14:00:00+00:00",
          url: "https://www.federalreserve.gov/newsevents/speech/powell20260822a.htm",
        },
        {
          speaker: "John C. Williams",
          title: "The Path of Policy",
          at: "2026-08-27T13:30:00+00:00",
          url: "https://www.federalreserve.gov/newsevents/speech/williams20260827a.htm",
        },
      ],
      data: {
        inflation: "CPI 2026-07: +0.3% MoM",
        labor: "Payrolls 2026-07: +147k",
        growth: null,
      },
      market_pricing: {
        status: "UNAVAILABLE",
        proxy: { "2y_yield_change_bp": -7.5 },
      },
      previous_reaction: {
        decision_at: "2026-07-29T18:00:00+00:00",
        basis: "1m_bars",
        // Rule 2 — the classic FOMC afternoon: the statement reads one way and
        // the press conference reverses it inside the hour.
        statement: {
          SPY: { pre_close: 600.0, post_close: 604.8, return_pct: 0.008 },
          TLT: { pre_close: 90.0, post_close: 90.9, return_pct: 0.01 },
        },
        press_conference: {
          SPY: { pre_close: 604.8, post_close: 598.75, return_pct: -0.01 },
          TLT: { pre_close: 90.9, post_close: 90.0, return_pct: -0.0099 },
        },
      },
      coverage: { notes: ["Minutes for the July meeting were not yet published at as-of."] },
    },
    disclaimers: [
      "The source document is authoritative: statement text is stored and shown as the Federal Reserve published it.",
      "Fed funds futures pricing is unavailable on this platform; no implied probability is shown.",
    ],
    ...overrides,
  };
}

function renderFed(
  data: EventFedPayload | null | undefined,
  props: { onBackfill?: () => void; backfilling?: boolean } = {},
) {
  return render(
    <LanguageProvider>
      <FedTabContent data={data} {...props} />
    </LanguageProvider>,
  );
}

/* ============================== 1. no hawk/dove score ==================== */

describe("FedTab — there is no single hawkish/dovish score (§43)", () => {
  /**
   * The load-bearing test of this file. It scans the whole rendered DOM rather
   * than one element, because the failure mode is not "the score is wrong" —
   * it is that some future summary line, tooltip or badge introduces one,
   * anywhere.
   *
   * The two blocks whose JOB is to talk about the refusal are removed before
   * the scan: the §43 banner says "NO SINGLE HAWKISH/DOVISH SCORE" and the
   * §45 note explains a statement "read as dovish" that the press conference
   * reverses. Naming the thing being refused is the point of that copy, so a
   * blanket ban on the vocabulary would force the tab to explain itself in
   * euphemisms. What must not exist is a hawk/dove READING — a badge, a value,
   * a label attached to the statement — which is what the rest of the DOM is
   * scanned for here.
   */
  it("renders no hawkish/dovish reading outside the copy explaining its absence", () => {
    const { container } = renderFed(makePayload());
    const clone = container.cloneNode(true) as HTMLElement;
    for (const testid of ["fed-no-score", "fed-reaction"]) {
      clone.querySelector(`[data-testid="${testid}"] .an-note`)?.remove();
      clone.querySelector(`[data-testid="${testid}"] .cb-line`)?.remove();
    }
    const text = (clone.textContent ?? "").toLowerCase();
    expect(text).not.toContain("hawkish");
    expect(text).not.toContain("dovish");
    expect(text).not.toContain("hawk");
    expect(text).not.toContain("dove");
  });

  /**
   * Neither word may reach a VALUE slot — a badge, a chip or a table cell.
   *
   * The §43 banner is excluded: its badge text IS the sentence "NO SINGLE
   * HAWKISH/DOVISH SCORE", which declares the refusal rather than reporting a
   * reading. Every other badge and cell on the tab is a slot where a stance
   * label could plausibly be introduced, and none may carry one.
   */
  it("puts no hawk/dove word in any badge, chip or table cell", () => {
    const { container } = renderFed(makePayload());
    const banner = container.querySelector('[data-testid="fed-no-score"]');
    const slots = container.querySelectorAll(".badge, .chip, td, .mt-yield-v");
    for (const slot of Array.from(slots)) {
      if (banner?.contains(slot)) continue;
      const text = (slot.textContent ?? "").toLowerCase();
      expect(text).not.toContain("hawk");
      expect(text).not.toContain("dove");
    }
  });

  it("states the absence explicitly rather than leaving a gap where the dial would be", () => {
    renderFed(makePayload());
    const note = screen.getByTestId("fed-no-score");
    expect(note.textContent).toContain("NO SINGLE HAWKISH/DOVISH SCORE");
  });

  /**
   * The dimensions must survive as separate rows. This asserts the exact
   * configuration a scalar would destroy: the policy rate unchanged while
   * forward guidance and the balance of risks both moved.
   */
  it("reports each dimension separately, keeping unchanged-rate/changed-guidance visible", () => {
    renderFed(makePayload());
    expect(screen.getByTestId("fed-dimension-status-POLICY_RATE").textContent).toBe("UNCHANGED");
    expect(screen.getByTestId("fed-dimension-status-FORWARD_GUIDANCE").textContent).toBe("CHANGED");
    expect(screen.getByTestId("fed-dimension-status-RISK_BALANCE").textContent).toBe("CHANGED");
    expect(screen.getByTestId("fed-dimension-status-INFLATION").textContent).toBe("UNCHANGED");
    // All eight dimensions render as their own rows.
    const table = screen.getByTestId("fed-dimensions-table");
    expect(
      table.querySelectorAll('tbody tr[data-testid^="fed-dimension-"]'),
    ).toHaveLength(8);
  });

  /** The format module exports no scorer — not even a private-looking one. */
  it("exports no scoring helper from fed-format", () => {
    const exported = Object.keys(fedFormat).map((k) => k.toLowerCase());
    for (const name of exported) {
      expect(name).not.toContain("hawk");
      expect(name).not.toContain("dove");
      expect(name).not.toContain("score");
      expect(name).not.toContain("tone");
      expect(name).not.toContain("stance");
    }
  });

  /**
   * A payload that smuggles a score in must not put it on screen. The server
   * does not send this shape — the point is that no renderer reads it.
   */
  it("ignores a score key smuggled into the packet", () => {
    const data = makePayload();
    (data.packet as Record<string, unknown>).hawkish_score = 0.82;
    (data.packet!.dimensions!.INFLATION as Record<string, unknown>).score = -1;
    const { container } = renderFed(data);
    // The score value itself reaches no slot on the page.
    expect(container.textContent).not.toContain("0.82");
    // And INFLATION still reports only its status, with no score beside it.
    expect(screen.getByTestId("fed-dimension-status-INFLATION").textContent).toBe("UNCHANGED");
    expect(screen.getByTestId("fed-dimension-INFLATION").textContent).not.toContain("-1");
  });

  /**
   * The status badge classes carry WEIGHT, never DIRECTION. Green or red on a
   * dimension would be the hawk/dove score drawn instead of written.
   */
  it("never colours a dimension status green or red", () => {
    for (const status of ["CHANGED", "UNCHANGED", "ADDED", "REMOVED", "NA", null]) {
      const cls = dimensionStatusClass(status);
      expect(["accent", "dim"]).toContain(cls);
    }
  });
});

/* ====================== 2/3. the two reaction windows =================== */

describe("FedTab — the statement and press-conference windows stay apart (§45)", () => {
  it("shows both windows as their own cells with their ET clock times", () => {
    renderFed(makePayload());
    const table = screen.getByTestId("fed-reaction-table");
    expect(table.textContent).toContain("14:00–14:30 ET");
    expect(table.textContent).toContain("14:30–15:30 ET");
    // Opposite directions on the same symbol, both surviving.
    expect(screen.getByTestId("fed-return-statement-SPY").textContent).toContain("+0.80%");
    expect(screen.getByTestId("fed-return-press_conference-SPY").textContent).toContain("-1.00%");
  });

  /**
   * The whole point of §45. The sum (-0.20%) and the average (-0.10%) are the
   * two numbers a merged view would produce, and neither may appear.
   */
  it("puts neither the sum nor the average of the two windows on screen", () => {
    const { container } = renderFed(makePayload());
    const text = container.textContent ?? "";
    expect(text).not.toContain("-0.20%");
    expect(text).not.toContain("-0.10%");
  });

  it("keeps the two windows as separate objects in the format layer", () => {
    const data = makePayload();
    const reaction = data.packet!.previous_reaction!;
    expect(windowReturn(reaction.statement, "SPY")).toBe(0.008);
    expect(windowReturn(reaction.press_conference, "SPY")).toBe(-0.01);
    // The one function that reads both reads only their KEYS.
    expect(allReactionSymbols(reaction)).toEqual(["SPY", "TLT"]);
  });

  it("badges a 1-minute basis without the not-separated warning", () => {
    renderFed(makePayload());
    expect(screen.getByTestId("fed-reaction-basis").textContent).toBe("1-MINUTE BARS");
    expect(screen.queryByTestId("fed-daily-warning")).toBeNull();
  });

  /* Rule 3. */
  it("warns explicitly that a daily basis cannot separate the two windows", () => {
    const data = makePayload();
    data.packet!.previous_reaction!.basis = "daily";
    renderFed(data);
    expect(screen.getByTestId("fed-reaction-basis").textContent).toBe("DAILY BARS");
    const warning = screen.getByTestId("fed-daily-warning");
    expect(warning.textContent).toContain("NOT SEPARATED");
    expect(warning.textContent).toContain("cannot tell the statement window apart");
  });

  it("treats an unknown or absent basis as not-separated", () => {
    expect(dailyBasis("daily")).toBe(true);
    expect(dailyBasis(null)).toBe(true);
    expect(dailyBasis("1m_bars")).toBe(false);
    const t = (en: string) => en;
    expect(basisText("1m_bars", t)).toBe("1-MINUTE BARS");
    expect(basisText(null, t)).toBe("BASIS UNKNOWN");
  });

  it("renders the pre/post closes behind each window return", () => {
    renderFed(makePayload());
    expect(screen.getByTestId("fed-closes-statement-SPY").textContent).toBe("600.00 → 604.80");
    expect(screen.getByTestId("fed-closes-press_conference-SPY").textContent).toBe(
      "604.80 → 598.75",
    );
  });

  it("renders a symbol present in only one window without inventing the other", () => {
    const data = makePayload();
    data.packet!.previous_reaction!.press_conference = {
      SPY: { pre_close: 604.8, post_close: 598.75, return_pct: -0.01 },
    };
    renderFed(data);
    // TLT keeps its statement cell and shows a dash for the presser.
    expect(screen.getByTestId("fed-return-statement-TLT").textContent).toContain("+1.00%");
    expect(screen.getByTestId("fed-return-press_conference-TLT").textContent).toBe("—");
  });

  it("orders the reaction rows by asset class, not by payload order", () => {
    expect(windowSymbols({ GLD: {}, SPY: {}, TLT: {} })).toEqual(["SPY", "TLT", "GLD"]);
    // An unknown symbol sorts to the end rather than being dropped.
    expect(windowSymbols({ ZZZ: {}, SPY: {} })).toEqual(["SPY", "ZZZ"]);
  });
});

/* ======================= 4/5. market pricing ============================ */

describe("FedTab — market pricing is unavailable, loudly (§42)", () => {
  it("prints the unavailable marker in the slot the implied probability would occupy", () => {
    renderFed(makePayload());
    const block = screen.getByTestId("fed-pricing-unavailable");
    expect(screen.getByTestId("fed-pricing-status").textContent).toContain("UNAVAILABLE");
    expect(block.textContent).toContain("no implied probability");
  });

  it("never prints a probability, even when one is smuggled into the payload", () => {
    const data = makePayload();
    (data.packet!.market_pricing as Record<string, unknown>).implied_cut_probability = 0.86;
    const { container } = renderFed(data);
    expect(container.textContent).not.toContain("0.86");
    expect(container.textContent).not.toContain("86%");
  });

  it("has no branch that turns market pricing into a number", () => {
    const t = (en: string) => en;
    expect(marketPricingText({ value: 0.86 } as never, t)).toBe("UNAVAILABLE");
    expect(marketPricingText({ status: "UNAVAILABLE", value: 0.86 } as never, t)).toBe(
      "UNAVAILABLE",
    );
    expect(marketPricingText(null, t)).toBe("UNAVAILABLE");
  });

  /* Rule 5. */
  it("names the proxy for what it measures and badges it", () => {
    renderFed(makePayload());
    const proxy = screen.getByTestId("fed-proxy-2y_yield_change_bp");
    expect(proxy.textContent).toContain("2Y yield change");
    expect(proxy.textContent).toContain("PROXY");
    expect(proxy.textContent).toContain("-7.5 bp");
    // It is never called a probability.
    expect(proxy.textContent?.toLowerCase()).not.toContain("probability");
    expect(screen.getByTestId("fed-proxy-note").textContent).toContain(
      "A yield move is not a probability",
    );
  });

  it("renders no proxy tiles when the server sends none", () => {
    const data = makePayload();
    data.packet!.market_pricing = { status: "UNAVAILABLE", proxy: null };
    renderFed(data);
    expect(screen.queryByTestId("fed-proxies")).toBeNull();
    // The unavailable marker still shows — the proxy is the optional half.
    expect(screen.getByTestId("fed-pricing-status").textContent).toContain("UNAVAILABLE");
  });

  it("labels an unknown proxy key by its own name rather than dropping it", () => {
    const t = (en: string) => en;
    const entries = proxyEntries({ proxy: { "5y5y_forward_bp": 4 } }, t);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("5y5y forward bp");
    expect(entries[0].text).toBe("+4 bp");
  });
});

/* ============================ 6/9. the diff ============================= */

describe("StatementDiff — what moved, sentence by sentence (§44)", () => {
  function renderDiff(data: EventFedPayload = makePayload()) {
    return render(
      <LanguageProvider>
        <StatementDiff diff={data.packet?.statement_diff} />
      </LanguageProvider>,
    );
  }

  it("shows the four counts from the server's own block", () => {
    renderDiff();
    const counts = screen.getByTestId("fed-diff-counts");
    expect(within(counts).getByTestId("fed-diff-count-ADDED").textContent).toContain("1");
    expect(within(counts).getByTestId("fed-diff-count-REMOVED").textContent).toContain("1");
    expect(within(counts).getByTestId("fed-diff-count-CHANGED").textContent).toContain("1");
    expect(within(counts).getByTestId("fed-diff-count-UNCHANGED").textContent).toContain("2");
  });

  /* Rule 6 — the load-bearing diff test. */
  it("renders BOTH texts of a changed sentence", () => {
    renderDiff();
    const changed = screen.getByTestId("fed-diff-changed");
    expect(changed.textContent).toContain(
      "Job gains have remained solid, and the unemployment rate has remained low.",
    );
    expect(changed.textContent).toContain(
      "Job gains have slowed in recent months, and the unemployment rate has edged up but remains low.",
    );
  });

  it("renders the added and removed sentences with their own statuses", () => {
    renderDiff();
    const changed = screen.getByTestId("fed-diff-changed");
    expect(changed.textContent).toContain(
      "Uncertainty about the economic outlook has increased, and downside risks to employment have risen.",
    );
    expect(changed.textContent).toContain(
      "The Committee judges that the risks to achieving its employment and inflation goals are roughly in balance.",
    );
    // Three moved items, and only those, are expanded.
    expect(changed.querySelectorAll('li[data-testid^="fd-item-"]')).toHaveLength(3);
  });

  it("tags a diff item with the dimensions the server attached", () => {
    renderDiff();
    const changed = screen.getByTestId("fed-diff-changed");
    expect(within(changed).getAllByTestId("fd-tag-RISK_BALANCE").length).toBeGreaterThan(0);
    expect(within(changed).getAllByTestId("fd-tag-EMPLOYMENT").length).toBeGreaterThan(0);
  });

  it("prints the server's similarity ratio rather than re-deriving one", () => {
    renderDiff();
    // The moved items are indexed first, so the 72% CHANGED pair is item 0 of
    // the expanded list — the UNCHANGED ones are renumbered after them.
    const changed = screen.getByTestId("fed-diff-changed");
    // Located by the ratio itself rather than by an index: which slot the
    // CHANGED pair occupies is a rendering detail, but that the server's 72%
    // reaches the screen unaltered is the rule.
    const sims = Array.from(
      changed.querySelectorAll('[data-testid^="fd-item-similarity-"]'),
    ).map((n) => n.textContent);
    expect(sims).toContain("72% similar");
    expect(fmtSimilarity(0.72)).toBe("72%");
    expect(fmtSimilarity(null)).toBeNull();
  });

  /* Rule 9. */
  it("collapses the unchanged bulk but keeps every sentence reachable", async () => {
    const user = userEvent.setup();
    renderDiff();
    const details = screen.getByTestId("fed-diff-unchanged");
    expect(details.textContent).toContain("2 unchanged sentences");
    // Present in the DOM (a <details> renders its children), and the summary
    // says how many — the reader can always reach the whole document.
    expect(details.textContent).toContain("Inflation remains somewhat elevated.");
    await user.click(within(details).getByText(/unchanged sentence/));
    expect(details.textContent).toContain(
      "Recent indicators suggest that economic activity has continued to expand at a moderate pace.",
    );
  });

  it("falls back to counting the items when the server sends no counts block", () => {
    const data = makePayload();
    data.packet!.statement_diff!.counts = null;
    renderDiff(data);
    expect(screen.getByTestId("fed-diff-count-ADDED").textContent).toContain("1");
    expect(screen.getByTestId("fed-diff-count-UNCHANGED").textContent).toContain("2");
  });

  it("reports an all-unchanged statement as the finding it is", () => {
    const data = makePayload();
    data.packet!.statement_diff = {
      items: [
        {
          status: "UNCHANGED",
          previous_text: "Inflation remains somewhat elevated.",
          current_text: "Inflation remains somewhat elevated.",
        },
      ],
      counts: { added: 0, removed: 0, changed: 0, unchanged: 1 },
    };
    renderDiff(data);
    expect(screen.getByTestId("fed-diff-nothing-moved").textContent).toContain(
      "Every sentence carried over unchanged",
    );
  });

  it("renders an empty state rather than a blank block when no diff is stored", () => {
    renderDiff(makePayload({ packet: {} }));
    expect(screen.getByTestId("fed-diff-empty").textContent).toContain(
      "No statement diff is stored",
    );
  });

  it("uses diff colours for added/removed text and dim for unchanged", () => {
    expect(diffStatusClass("ADDED")).toBe("green");
    expect(diffStatusClass("REMOVED")).toBe("red");
    expect(diffStatusClass("CHANGED")).toBe("amber");
    expect(diffStatusClass("UNCHANGED")).toBe("dim");
    expect(diffStatusClass(null)).toBe("dim");
  });

  it("separates moved from unchanged items deterministically", () => {
    const diff = makePayload().packet!.statement_diff!;
    expect(changedDiffItems(diff)).toHaveLength(3);
    expect(diffCount(diff, "UNCHANGED")).toBe(2);
    expect(changedDiffItems(null)).toEqual([]);
  });
});

/* ======================== 7/8. statement and vote ======================= */

describe("FedTab — the source document is authoritative (§44)", () => {
  it("shows the target range in the Fed's own words with the parse beside it", () => {
    renderFed(makePayload());
    const range = screen.getByTestId("fed-target-range");
    expect(range.textContent).toContain("3-1/2 to 3-3/4 percent");
    expect(range.textContent).toContain("3.50–3.75%");
  });

  it("prefers the statement's wording and only falls back to the parsed bounds", () => {
    expect(targetRangeText({ low_pct: 3.5, high_pct: 3.75, text: "3-1/2 to 3-3/4 percent" })).toBe(
      "3-1/2 to 3-3/4 percent",
    );
    expect(targetRangeText({ low_pct: 3.5, high_pct: 3.75, text: null })).toBe("3.50–3.75%");
    expect(targetRangeText({ low_pct: null, high_pct: null, text: null })).toBeNull();
    expect(targetRangeText(null)).toBeNull();
  });

  it("links to the Fed's own page for the statement, the minutes and each speech", () => {
    renderFed(makePayload());
    expect(screen.getByTestId("fed-statement-link").getAttribute("href")).toBe(
      "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm",
    );
    expect(screen.getByTestId("fed-minutes-link").getAttribute("href")).toBe(
      "https://www.federalreserve.gov/monetarypolicy/fomcminutes20260617.htm",
    );
    const speeches = screen.getByTestId("fed-speeches-list");
    expect(within(speeches).getByText("Economic Outlook").getAttribute("href")).toBe(
      "https://www.federalreserve.gov/newsevents/speech/powell20260822a.htm",
    );
  });

  it("keeps the whole statement reachable, verbatim and untruncated", () => {
    renderFed(makePayload());
    const full = screen.getByTestId("fed-statement-full");
    expect(full.textContent).toContain("Full statement text (6 paragraphs)");
    const paragraphs = within(full).getAllByTestId("fed-statement-paragraph");
    expect(paragraphs).toHaveLength(6);
    // Verbatim: no ellipsis, no trimming of the long sentence.
    expect(paragraphs[4].textContent).toBe(
      "In considering the extent and timing of additional adjustments to the target range, the Committee will carefully assess incoming data.",
    );
  });

  /* Rule 8. */
  it("shows the vote tally with every dissenter named", () => {
    renderFed(makePayload());
    expect(screen.getByTestId("fed-vote-tally").textContent).toBe("9–3");
    const names = screen.getAllByTestId("fed-dissenter").map((n) => n.textContent);
    expect(names).toEqual([
      "Michelle W. Bowman",
      "Christopher J. Waller",
      "Austan D. Goolsbee",
    ]);
    expect(screen.getByTestId("fed-vote-text").textContent).toContain(
      "Voting against this action were Michelle W. Bowman",
    );
  });

  it("badges a unanimous vote and shows no dissenter list", () => {
    const data = makePayload();
    data.packet!.previous_statement!.vote = {
      for: 12,
      against: 0,
      dissenters: [],
      unanimous: true,
      text: "Voting for the monetary policy action were all twelve members.",
    };
    renderFed(data);
    expect(screen.getByTestId("fed-vote-tally").textContent).toBe("12–0");
    expect(screen.getByTestId("fed-vote-unanimous")).toBeTruthy();
    expect(screen.queryByTestId("fed-dissenters")).toBeNull();
  });

  it("distinguishes an unparsed vote from a unanimous one", () => {
    expect(isUnanimous({ for: 12, against: 0 })).toBe(true);
    expect(isUnanimous({ for: 9, against: 3 })).toBe(false);
    // Neither flag nor count — we did not parse it, which is not "no dissents".
    expect(isUnanimous({ text: "…" })).toBeNull();
    expect(isUnanimous(null)).toBeNull();
    expect(voteTally({ for: 9, against: 3 })).toBe("9–3");
    expect(voteTally({ for: 9 })).toBeNull();
    expect(voteTally(null)).toBeNull();
    expect(dissenters({ dissenters: ["A", ""] })).toEqual(["A"]);
    expect(dissenters(null)).toEqual([]);
  });

  it("says the vote was not parsed rather than showing a 0–0 tally", () => {
    const data = makePayload();
    data.packet!.previous_statement!.vote = { text: "Voting for the action were …" };
    renderFed(data);
    expect(screen.getByTestId("fed-vote-unparsed").textContent).toContain("not parsed");
    expect(screen.queryByTestId("fed-vote-tally")).toBeNull();
  });

  it("keeps a HOLD's 0 bp on screen rather than treating it as absent", () => {
    renderFed(makePayload());
    expect(screen.getByTestId("fed-rate-direction").textContent).toBe("HOLD");
    expect(screen.getByTestId("fed-rate-change-bp").textContent).toBe("0 bp");
    expect(fmtChangeBp(0)).toBe("0 bp");
    expect(fmtChangeBp(-25)).toBe("-25 bp");
    expect(fmtChangeBp(25)).toBe("+25 bp");
    expect(fmtChangeBp(null)).toBeNull();
  });

  it("renders a cut with its signed basis-point change", () => {
    const data = makePayload();
    data.packet!.policy_rate_change = { change_bp: -25, direction: "CUT" };
    renderFed(data);
    expect(screen.getByTestId("fed-rate-direction").textContent).toBe("CUT");
    expect(screen.getByTestId("fed-rate-change-bp").textContent).toBe("-25 bp");
  });
});

/* ==================== minutes, speeches, data, coverage ================= */

describe("FedTab — the surrounding record", () => {
  it("lists the minutes' key paragraphs verbatim", () => {
    renderFed(makePayload());
    const paragraphs = screen.getAllByTestId("fed-minutes-paragraph");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe(
      "Participants observed that inflation had eased but remained above the Committee's 2 percent objective.",
    );
  });

  it("explains an absent minutes rather than showing a blank section", () => {
    const data = makePayload();
    data.packet!.previous_minutes = null;
    renderFed(data);
    expect(screen.getByTestId("fed-minutes-none").textContent).toContain(
      "published three weeks after the decision",
    );
  });

  it("lists the speeches since the last decision with speaker and date", () => {
    renderFed(makePayload());
    const speeches = screen.getAllByTestId("fed-speech");
    expect(speeches).toHaveLength(2);
    expect(speeches[0].textContent).toContain("Jerome H. Powell");
    expect(speeches[0].textContent).toContain("2026-08-22");
  });

  it("treats an empty speech list as a state, naming the blackout period", () => {
    const data = makePayload();
    data.packet!.subsequent_speeches = [];
    renderFed(data);
    expect(screen.getByTestId("fed-speeches-none").textContent).toContain("blackout period");
  });

  it("renders only the populated data slots", () => {
    renderFed(makePayload());
    expect(screen.getByTestId("fed-data-inflation").textContent).toContain("+0.3% MoM");
    expect(screen.getByTestId("fed-data-labor").textContent).toContain("+147k");
    // `growth` is null in the fixture — no empty row invented for it.
    expect(screen.queryByTestId("fed-data-growth")).toBeNull();
  });

  it("stringifies a structured data slot rather than dropping it", () => {
    expect(dataSlotText({ series: "CPI", value: 0.3 })).toBe('{"series":"CPI","value":0.3}');
    expect(dataSlotText(null)).toBeNull();
    expect(dataSlotText("")).toBeNull();
    expect(dataSlotText({})).toBeNull();
    expect(dataSlotText(0)).toBe("0");
  });

  it("prints the server's disclaimer lines verbatim", () => {
    renderFed(makePayload());
    const lines = screen.getAllByTestId("fed-disclaimer").map((l) => l.textContent);
    expect(lines[0]).toContain("The source document is authoritative");
    expect(lines[1]).toContain("Fed funds futures pricing is unavailable");
  });

  it("prints coverage notes verbatim", () => {
    renderFed(makePayload());
    expect(screen.getByTestId("fed-coverage").textContent).toContain(
      "Minutes for the July meeting were not yet published",
    );
  });

  it("flattens the several shapes a coverage block arrives in", () => {
    expect(coverageNotes(null)).toEqual([]);
    expect(coverageNotes("one note")).toEqual(["one note"]);
    expect(coverageNotes(["a", "b"])).toEqual(["a", "b"]);
    expect(coverageNotes({ notes: ["a"], reason: "b" })).toEqual(["a", "b"]);
  });
});

/* =========================== 10. defensive render ======================= */

describe("FedTab — reads defensively", () => {
  it("renders an empty payload without throwing", () => {
    renderFed({});
    expect(screen.getByTestId("fed-panel")).toBeTruthy();
    expect(screen.getByTestId("fed-empty")).toBeTruthy();
    expect(screen.getByTestId("fed-statement-none")).toBeTruthy();
    expect(screen.getByTestId("fed-dimensions-none")).toBeTruthy();
    expect(screen.getByTestId("fed-reaction-none")).toBeTruthy();
  });

  it("renders null and undefined payloads without throwing", () => {
    renderFed(null);
    expect(screen.getByTestId("fed-panel")).toBeTruthy();
    cleanup();
    renderFed(undefined);
    expect(screen.getByTestId("fed-panel")).toBeTruthy();
  });

  it("still states the two §42/§43 refusals on an empty payload", () => {
    renderFed({});
    // The rules do not depend on data being present — an empty tab must not
    // silently drop the reasons it shows no score and no pricing.
    expect(screen.getByTestId("fed-no-score")).toBeTruthy();
    expect(screen.getByTestId("fed-pricing-status").textContent).toContain("UNAVAILABLE");
  });

  it("renders a partial packet that has only a statement", () => {
    const data: EventFedPayload = {
      event_id: 5,
      packet: {
        previous_statement: {
          url: "https://www.federalreserve.gov/x.htm",
          paragraphs: ["Inflation remains somewhat elevated."],
        },
      },
    };
    renderFed(data);
    expect(screen.getByTestId("fed-statement-link")).toBeTruthy();
    expect(screen.getByTestId("fed-diff-empty")).toBeTruthy();
    expect(screen.getByTestId("fed-reaction-none")).toBeTruthy();
  });

  it("detects an empty packet", () => {
    expect(hasPacket(null)).toBe(false);
    expect(hasPacket({})).toBe(false);
    expect(hasPacket({ packet: {} })).toBe(false);
    expect(hasPacket({ packet: { previous_statement: { url: "x" } } })).toBe(true);
    expect(
      hasPacket({ packet: { statement_diff: { items: [{ status: "ADDED" }] } } }),
    ).toBe(true);
  });

  it("sorts unknown dimensions to the end rather than dropping them", () => {
    expect(orderedDimensions({ INFLATION: {}, POLICY_RATE: {} })).toEqual([
      "POLICY_RATE",
      "INFLATION",
    ]);
    expect(orderedDimensions({ FINANCIAL_CONDITIONS: {}, INFLATION: {} })).toEqual([
      "INFLATION",
      "FINANCIAL_CONDITIONS",
    ]);
    expect(orderedDimensions(null)).toEqual([]);
  });

  it("renders an unknown dimension with its raw token as the label", () => {
    const data = makePayload();
    data.packet!.dimensions = {
      FINANCIAL_CONDITIONS: { status: "CHANGED", previous: [], current: ["x"] },
    };
    renderFed(data);
    const row = screen.getByTestId("fed-dimension-FINANCIAL_CONDITIONS");
    expect(row.textContent).toContain("FINANCIAL CONDITIONS");
  });

  it("returns null rather than a dash for every absent value", () => {
    expect(stampMinute(null)).toBeNull();
    expect(stampMinute("")).toBeNull();
    expect(stampDay(undefined)).toBeNull();
    expect(fmtReturnPct(Number.NaN)).toBeNull();
    expect(fmtChangeBp(Number.POSITIVE_INFINITY)).toBeNull();
    expect(disclaimers(null)).toEqual([]);
    expect(disclaimers({ disclaimers: ["a", ""] })).toEqual(["a"]);
  });

  it("passes an unparseable stamp through rather than inventing a date", () => {
    expect(stampMinute("not-a-date")).toBe("not-a-date");
  });

  it("keeps a 0.00% window return on screen and distinguishes it from an absent one", () => {
    expect(fmtReturnPct(0)).toBe("0.00%");
    expect(fmtReturnPct(null)).toBeNull();
    expect(windowReturn({ SPY: { return_pct: 0 } }, "SPY")).toBe(0);
    expect(windowReturn({ SPY: { return_pct: null } }, "SPY")).toBeNull();
    expect(windowReturn(null, "SPY")).toBeNull();
  });
});

/* =========================== backfill control =========================== */

describe("FedTab — backfill is the only control that spends anything", () => {
  it("calls the handler and says what the button will do", async () => {
    const user = userEvent.setup();
    const onBackfill = vi.fn();
    renderFed(makePayload(), { onBackfill });
    await user.click(screen.getByTestId("fed-backfill"));
    expect(onBackfill).toHaveBeenCalledTimes(1);
  });

  it("disables the button while a backfill is in flight", () => {
    renderFed(makePayload(), { onBackfill: () => {}, backfilling: true });
    const button = screen.getByTestId("fed-backfill") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Backfilling");
  });

  it("renders no backfill button when the page passes no handler", () => {
    renderFed(makePayload());
    expect(screen.queryByTestId("fed-backfill")).toBeNull();
  });

  it("tells the reader the GET never fetches", () => {
    renderFed(makePayload());
    const panel = screen.getByTestId("fed-panel");
    expect(panel.textContent).toContain("Opening this tab fetches nothing");
  });
});

/* ============================= 12. the type gate ======================== */

describe("isFedEventType — the FOMC family and Fed speeches", () => {
  it("accepts the event types that have a policy packet behind them", () => {
    for (const type of [
      "FOMC_MEETING",
      "FOMC_DECISION",
      "FOMC_PRESS_CONFERENCE",
      "FOMC_MINUTES",
      "FED_SPEECH",
      "FED_BOARD_EVENT",
    ]) {
      expect(isFedEventType(type)).toBe(true);
    }
  });

  it("accepts a future Fed type by its issuing-institution prefix", () => {
    // A widening that names the institution, never "has no ticker".
    expect(isFedEventType("FOMC_PROJECTIONS")).toBe(true);
    expect(isFedEventType("FED_TESTIMONY")).toBe(true);
  });

  it("rejects the macro releases and company events", () => {
    expect(isFedEventType("CPI")).toBe(false);
    expect(isFedEventType("EMPLOYMENT_REPORT")).toBe(false);
    expect(isFedEventType("MARKET_HOLIDAY")).toBe(false);
    expect(isFedEventType("EARNINGS")).toBe(false);
  });

  it("rejects empty and absent types", () => {
    expect(isFedEventType(null)).toBe(false);
    expect(isFedEventType(undefined)).toBe(false);
    expect(isFedEventType("")).toBe(false);
  });
});

/* ======================= backfill counts (server shape) ======================= */

/**
 * These pin the ONE thing the rest of this file could not catch: the shape of
 * the backfill response. Every other test here mounts `FedTabContent`, which
 * never sees a mutation result, so a tab that misread the server's counters
 * passed 70 green tests while reporting a successful backfill as "nothing was
 * stored".
 *
 * The payloads below are the gateway's real emissions, quoted from
 * services/tests/test_events_fed_api.py — which asserts
 * `body["counts"]["documents"] == 3`. The counters are NESTED under `counts`;
 * there are no top-level `stored_documents` / `stored_bars` keys. If a future
 * change moves them, these fail loudly instead of degrading to zero.
 */
describe("backfillCounts — reads the counters the server actually sends", () => {
  it("reads the nested counts object from a real backfill response", () => {
    const result = {
      event_id: 7,
      event_key: "FOMC_DECISION_2026-09-16",
      available: true,
      counts: { documents: 3, bars: 780 },
      documents: [],
      bars: [],
    };
    expect(fedFormat.backfillCounts(result)).toEqual({
      documents: 3,
      bars: 780,
      total: 783,
    });
  });

  it("keeps a genuine zero as a real, reportable outcome", () => {
    // The server ran and stored nothing — a finding with a reason, not a gap.
    const result = { available: false, reason: "no previous decision", counts: { documents: 0, bars: 0 } };
    expect(fedFormat.backfillCounts(result)).toEqual({
      documents: 0,
      bars: 0,
      total: 0,
    });
  });

  it("returns null when the response carries no counts at all", () => {
    // Absent is NOT zero: the caller must not narrate an outcome it never got.
    expect(fedFormat.backfillCounts({ status: "ERROR" })).toBeNull();
    expect(fedFormat.backfillCounts(null)).toBeNull();
    expect(fedFormat.backfillCounts(undefined)).toBeNull();
  });

  it("does not read top-level stored_* keys the gateway never sends", () => {
    // Guards the exact regression: a payload shaped like the OLD assumption
    // must read as "unreported", never as a successful store.
    const wrong = { stored_documents: 3, stored_bars: 780 } as Record<string, unknown>;
    expect(fedFormat.backfillCounts(wrong)).toBeNull();
  });

  it("treats a non-numeric counter as unreported rather than as zero", () => {
    const result = { counts: { documents: "three" as unknown as number, bars: 0 } };
    expect(fedFormat.backfillCounts(result)).toBeNull();
  });
});

/* ==================== diff counts casing (server shape) ==================== */

/**
 * The server builds its tally as `counts[item.status]` over the UPPERCASE
 * status constants, and the backend suite pins the real June→July diff as
 * `{ADDED: 1, REMOVED: 0, CHANGED: 2, UNCHANGED: 6, TOTAL: 9}`.
 *
 * A lowercase lookup here missed every key and fell through to counting
 * `items`, which agrees ONLY while the payload ships every sentence — so the
 * mismatch was invisible. The third test is the one that matters: it makes
 * counts and items disagree on purpose, which is what a trimmed item list
 * looks like, and asserts the server's number wins.
 */
describe("diffCount — reads the uppercase counts the server sends", () => {
  const realCounts = { ADDED: 1, REMOVED: 0, CHANGED: 2, UNCHANGED: 6, TOTAL: 9 };

  it("reads each status off the server's uppercase counts block", () => {
    const diff = { items: [], counts: realCounts };
    expect(fedFormat.diffCount(diff, "ADDED")).toBe(1);
    expect(fedFormat.diffCount(diff, "REMOVED")).toBe(0);
    expect(fedFormat.diffCount(diff, "CHANGED")).toBe(2);
    expect(fedFormat.diffCount(diff, "UNCHANGED")).toBe(6);
  });

  it("prefers the server's count over the shipped item list", () => {
    // A trimmed payload: the server counted 6 UNCHANGED sentences but sent
    // only one. The header must report the diff, not the transport.
    const diff = {
      items: [{ status: "UNCHANGED" as const, current_text: "only one shipped" }],
      counts: realCounts,
    };
    expect(fedFormat.diffCount(diff, "UNCHANGED")).toBe(6);
  });

  it("still falls back to counting items when no counts block is sent", () => {
    const diff = {
      items: [
        { status: "ADDED" as const, current_text: "a" },
        { status: "ADDED" as const, current_text: "b" },
        { status: "CHANGED" as const, current_text: "c" },
      ],
    };
    expect(fedFormat.diffCount(diff, "ADDED")).toBe(2);
    expect(fedFormat.diffCount(diff, "CHANGED")).toBe(1);
    expect(fedFormat.diffCount(diff, "REMOVED")).toBe(0);
  });
});
