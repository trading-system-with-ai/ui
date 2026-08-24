/**
 * Phase K §62-§67 event-risk tests — the Risk tab and the trade-plan panel.
 *
 * Each pins a rule where a plausible-looking implementation lies:
 *
 *  1. UNKNOWN IS NOT LOW. The classifier emits UNKNOWN when there is neither
 *     an implied move nor one previous comparable event. A UI that badged it
 *     green, or worded it as "low", would turn an absence of evidence into a
 *     reassurance — the single most damaging thing this surface could do.
 *  2. NO STAT WITHOUT ITS n (§64). A median can never appear on either
 *     surface without the sample size that produced it, and `n = 1` must SAY
 *     it is one print rather than render as a distribution.
 *  3. AN EMPTY SAMPLE IS NOT FOUR DASHES. n = 0 renders the absence and its
 *     remedy; four dashes read as "we measured and found nothing".
 *  4. SHADOW IS ON SCREEN (§65), unconditionally and before any figure — on
 *     the tab AND on the trade plan, since the plan is where the number would
 *     otherwise be mistaken for a check that resized something.
 *  5. PERCENT NUMBERS ARE NOT SCALED. This seam sends `8.8` for 8.8% while
 *     the options seam sends `0.088`. A shared formatter would render an 8.8%
 *     earnings move as 880%, so the scaling is pinned by test.
 *  6. NULL GREEKS ARE NOT ZERO GREEKS. `option_greeks: null` must produce the
 *     "no greeks supplied" state, never three tiles reading 0.00 — which
 *     tells an options holder their position has no vega into a print.
 *  7. BOTH BARS SHARE ONE SCALE, and a bar is drawn ONLY where its value
 *     exists. Per-bar normalisation would make every comparison a tie.
 *  8. SENSITIVITY NEVER BECOMES THE STATE (§66). A HIGH sensitivity on a LOW
 *     event must still render the state as LOW.
 *  9. THE PLAN PANEL IS ABSENT, NOT EMPTY, when no event is upcoming — an
 *     "EVENT RISK: —" heading reads as a cleared check that never ran.
 * 10. THE RENDERER READS DEFENSIVELY. The seam is new and U2 owns the server
 *     half; a payload missing snapshot fields must still render.
 * 11. NOTHING IS RE-DERIVED (§63). Drivers and caveats render in the SERVER's
 *     order, verbatim — the tab formats a classification, it never recomputes
 *     one.
 * 12. zh renders too — the surface is bilingual like every other tab.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type {
  EventRiskPayload,
  EventRiskSnapshot,
  PlanEventRisk,
} from "@/lib/types-event-risk";
import { EventRiskPlanPanel, RiskTabContent } from "../RiskTab";
import {
  crushStatus,
  enforcementNote,
  fmtCountdown,
  fmtGreek,
  fmtPctNumber,
  greekRows,
  historyRows,
  impliedVsHistorical,
  isUnknown,
  planDays,
  sampleLine,
  sampleN,
  snapshotOf,
  stateBadge,
  stateLabel,
  stringList,
} from "../risk-format";

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

const t = (en: string) => en;

/* ------------------------------------------------------------- fixtures */

/**
 * Keys spelled exactly as U1's `classify_event_risk` emits them — all fifteen.
 * Getting one wrong here is precisely the seam bug this suite exists to catch.
 */
function snapshot(overrides: Partial<EventRiskSnapshot> = {}): EventRiskSnapshot {
  return {
    event_type: "EARNINGS",
    time_to_event_days: 1.3,
    historical: { median_abs: 6.4, p75_abs: 8.1, p90_abs: 9.9, max_abs: 12.7, n: 8 },
    implied: { pct: 8.8, basis: "LIVE_CHAIN_SNAPSHOT" },
    expected_move_pct: 8.8,
    expected_move_basis: "IMPLIED",
    position_exposure_usd: 12000,
    exposure_share: 12.0,
    option_greeks: { gamma: 6.2, vega: 210.5, theta: -18.4 },
    event_risk_state: "HIGH",
    sensitivity: "HIGH",
    drivers: [
      "expected move 8.8% >= HIGH threshold 8.0%",
      "position exposure 12.0% of NAV >= 10.0% — bumped one level",
    ],
    caveats: ["based on 8 events", "date ESTIMATED"],
    reason: null,
    model_version: "event-risk-1.0.0",
    event_key: "AAPL:EARNINGS:2026-08-27",
    is_estimated: false,
    coverage: { reason: "8 of the last 12 events have stored option metrics" },
    ...overrides,
  };
}

function payload(overrides: Partial<EventRiskPayload> = {}): EventRiskPayload {
  return {
    event_id: 41,
    event_key: "AAPL:EARNINGS:2026-08-27",
    ticker: "AAPL",
    as_of: "2026-08-26T14:30:00Z",
    snapshot: snapshot(),
    options: {
      event_iv: 62.5,
      // A PERCENT number, like every other figure this seam serves: the
      // gateway converts the stored 0.088 fraction at the boundary, so the
      // options block and `snapshot.implied.pct` agree (8.8 = 8.8%).
      implied_move_pct: 8.8,
      implied_basis: "LIVE_CHAIN_SNAPSHOT",
      implied_status: "OK",
      is_live_basis: true,
      expected_iv_crush: "NO_DATA",
      expected_iv_crush_note:
        "no forward volatility surface is subscribed, so the IV crush this print will produce is NOT forecast.",
      historical_iv_crush: {
        median_abs: 41.2,
        p75_abs: 48.0,
        p90_abs: 52.1,
        max_abs: 55.3,
        n: 6,
      },
      historical_implied_move: { median_abs: 7.9, n: 6 },
      explainer:
        "a long call can lose despite correct direction if realized move < priced implied move",
    },
    enforcement: "SHADOW",
    available: true,
    reason: null,
    market_wide: null,
    ...overrides,
  };
}

function renderTab(data: EventRiskPayload) {
  return render(
    <LanguageProvider>
      <RiskTabContent data={data} />
    </LanguageProvider>,
  );
}

/**
 * Wrap a snapshot the way the plans router does: `{snapshot, enforcement,
 * model_version, computed_at, note}`. The panel must read the NESTED shape —
 * the field names on this seam are the thing these tests exist to pin.
 */
function planBlock(snap: EventRiskSnapshot): PlanEventRisk {
  return {
    snapshot: snap,
    enforcement: "SHADOW",
    model_version: "event-risk-1.0.0",
    computed_at: "2026-08-26T14:30:00Z",
  };
}

function renderPlan(block: PlanEventRisk | null, enforcement?: string) {
  return render(
    <LanguageProvider>
      <EventRiskPlanPanel eventRisk={block} enforcement={enforcement} />
    </LanguageProvider>,
  );
}

/* ------------------------------------------------------------- 1. UNKNOWN */

describe("UNKNOWN is a state, never a low reading", () => {
  const unknownSnap = snapshot({
    historical: { median_abs: null, p75_abs: null, p90_abs: null, max_abs: null, n: 0 },
    implied: null,
    expected_move_pct: null,
    expected_move_basis: "NONE",
    event_risk_state: "UNKNOWN",
    sensitivity: "LOW",
    drivers: [],
    caveats: ["no previous comparable event on file"],
    reason: "no implied move and no historical sample",
  });

  it("badges UNKNOWN dim — never the green LOW wears", () => {
    expect(stateBadge("UNKNOWN")).toBe("dim");
    expect(stateBadge("LOW")).toBe("green");
    expect(stateBadge("UNKNOWN")).not.toBe(stateBadge("LOW"));
  });

  it("prints UNKNOWN as its own word, not LOW", () => {
    renderTab(payload({ snapshot: unknownSnap }));
    expect(screen.getByTestId("event-risk-state").textContent ?? "").toContain("UNKNOWN");
    expect(screen.getByTestId("event-risk-state").textContent ?? "").not.toContain("LOW");
  });

  it("says the absence of evidence is NOT a low-risk finding", () => {
    renderTab(payload({ snapshot: unknownSnap }));
    const meaning = screen.getByTestId("event-risk-meaning").textContent ?? "";
    expect(meaning).toMatch(/absence of evidence/i);
    expect(meaning).toMatch(/NOT a low-risk finding/i);
  });

  it("shows the server's own reason for the UNKNOWN verbatim", () => {
    renderTab(payload({ snapshot: unknownSnap }));
    expect(screen.getByTestId("event-risk-unknown-reason").textContent ?? "").toContain(
      "no implied move and no historical sample",
    );
  });

  it("treats a missing state as UNKNOWN rather than defaulting to LOW", () => {
    expect(isUnknown(null)).toBe(true);
    expect(isUnknown("")).toBe(true);
    expect(isUnknown("UNKNOWN")).toBe(true);
    expect(isUnknown("LOW")).toBe(false);
    renderTab(payload({ snapshot: snapshot({ event_risk_state: null }) }));
    expect(screen.getByTestId("event-risk-state").textContent ?? "").toContain("UNKNOWN");
  });

  it("carries UNKNOWN onto the trade plan with the same sentence", () => {
    renderPlan(planBlock(unknownSnap));
    expect(screen.getByTestId("event-risk-state").textContent ?? "").toContain("UNKNOWN");
    expect(screen.getByTestId("plan-event-risk-unknown").textContent ?? "").toMatch(
      /absence of evidence/i,
    );
  });
});

/* ------------------------------------------------------- 2/3. §64 sample n */

describe("§64 — no historical statistic without its sample size", () => {
  it("puts n beside the median in the tab's own tile", () => {
    renderTab(payload());
    const tile = screen.getByTestId("event-risk-historical-median");
    expect(within(tile).getByText("6.4%")).not.toBeNull();
    expect(tile.textContent ?? "").toMatch(/based on 8 events/);
  });

  it("puts n beside the median on the trade plan too", () => {
    renderPlan(planBlock(snapshot()));
    const line = screen.getByTestId("plan-event-risk-historical").textContent ?? "";
    expect(line).toMatch(/6\.4%/);
    expect(line).toMatch(/based on 8 events/);
  });

  it("names n in the history table's caption AND its sample line", () => {
    renderTab(payload());
    expect(screen.getByTestId("event-risk-history-sample").textContent ?? "").toContain(
      "based on 8 events",
    );
    expect(screen.getByTestId("event-risk-history-table").textContent ?? "").toMatch(
      /n=8/,
    );
  });

  it("calls a single print a single print, not a distribution", () => {
    expect(sampleLine(1, t)).toMatch(/single print, not a distribution/i);
    expect(sampleLine(3, t)).toMatch(/too few to be a distribution/i);
    expect(sampleLine(8, t)).toBe("based on 8 events");
  });

  it("distinguishes n=0 from a server that sent no count at all", () => {
    expect(sampleLine(0, t)).toMatch(/no previous comparable events on file/i);
    expect(sampleLine(null, t)).toMatch(/sample size not reported/i);
    expect(sampleLine(0, t)).not.toBe(sampleLine(null, t));
  });

  it("never returns an empty string — a stat can never appear unqualified", () => {
    for (const n of [null, undefined, 0, 1, 2, 8, 40]) {
      expect(sampleLine(n as number | null, t).trim()).not.toBe("");
    }
  });

  it("renders the empty sample as an absence with its remedy, not four dashes", () => {
    renderTab(
      payload({
        snapshot: snapshot({
          historical: { median_abs: null, p75_abs: null, p90_abs: null, max_abs: null, n: 0 },
        }),
      }),
    );
    expect(screen.queryByTestId("event-risk-history-table")).toBeNull();
    const empty = screen.getByTestId("event-risk-history-empty").textContent ?? "";
    expect(empty).toMatch(/no previous comparable event is on file/i);
    expect(empty).toMatch(/gap in the record, not a finding/i);
    expect(empty).toMatch(/backfill/i);
  });

  it("emits no history rows at all when the sample is empty", () => {
    expect(
      historyRows({ median_abs: null, p75_abs: null, p90_abs: null, max_abs: null, n: 0 }),
    ).toEqual([]);
    expect(historyRows(null)).toEqual([]);
    expect(historyRows({ median_abs: 6.4, n: 8 })).toHaveLength(4);
  });

  it("keeps a null p90 inside a REAL sample as a null row, not a dropped one", () => {
    const rows = historyRows({ median_abs: 6.4, p75_abs: 8.1, p90_abs: null, max_abs: 12.7, n: 3 });
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.key === "p90_abs")?.value).toBeNull();
  });

  it("reads n honestly off the block", () => {
    expect(sampleN({ n: 8 })).toBe(8);
    expect(sampleN({ n: 0 })).toBe(0);
    expect(sampleN({ n: null })).toBeNull();
    expect(sampleN(null)).toBeNull();
  });
});

/* -------------------------------------------------------------- 4. SHADOW */

describe("§65 — SHADOW is stated on screen, before any figure", () => {
  it("renders the shadow banner on the tab unconditionally", () => {
    renderTab(payload());
    const note = screen.getByTestId("event-risk-shadow-note").textContent ?? "";
    expect(note).toMatch(/SHADOW/);
    expect(note).toMatch(/changes no order/i);
    expect(note).toMatch(/blocks nothing/i);
  });

  it("keeps the shadow banner even when the server sends no enforcement field", () => {
    renderTab(payload({ enforcement: null }));
    expect(screen.getByTestId("event-risk-shadow-note").textContent ?? "").toMatch(
      /SHADOW/,
    );
  });

  it("puts the SHADOW badge on the state chip itself, with the hover text", () => {
    renderTab(payload());
    const badge = screen.getByTestId("event-risk-shadow-badge");
    expect(badge.textContent ?? "").toContain("SHADOW");
    expect(badge.getAttribute("title")).toBe("shadow only — never blocks trades");
  });

  it("states SHADOW on the trade plan too", () => {
    renderPlan(planBlock(snapshot()));
    expect(screen.getByTestId("plan-event-risk-shadow").textContent ?? "").toMatch(
      /changes no order/i,
    );
    expect(screen.getByTestId("event-risk-shadow-badge").textContent ?? "").toContain("SHADOW");
  });

  it("changes the sentence if the layer is ever promoted, instead of lying", () => {
    const promoted = enforcementNote("ENFORCED", t);
    expect(promoted).toMatch(/no longer shadow-only/i);
    expect(enforcementNote("SHADOW", t)).toMatch(/blocks nothing/i);
    expect(enforcementNote(null, t)).toMatch(/blocks nothing/i);
  });

  it("says the hard limits keep deciding alone", () => {
    expect(enforcementNote("SHADOW", t)).toMatch(/hard risk limits continue to decide alone/i);
  });
});

/* --------------------------------------------------------- 5. percent unit */

describe("percent NUMBERS are not scaled (the options seam's opposite)", () => {
  it("renders 8.8 as 8.8%, never 880% or 0.1%", () => {
    expect(fmtPctNumber(8.8)).toBe("8.8%");
    expect(fmtPctNumber(0.088)).toBe("0.1%");
    expect(fmtPctNumber(12.0, 1)).toBe("12.0%");
  });

  it("returns null (not 0.0%, not a dash) for an absent value", () => {
    expect(fmtPctNumber(null)).toBeNull();
    expect(fmtPctNumber(undefined)).toBeNull();
    expect(fmtPctNumber(Number.NaN)).toBeNull();
    expect(fmtPctNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("puts the raw percent on screen unscaled", () => {
    renderTab(payload());
    expect(screen.getByTestId("event-risk-expected-move").textContent ?? "").toContain("8.8%");
    expect(screen.getByTestId("event-risk-implied-move").textContent ?? "").toContain("8.8%");
  });

  it("renders exposure share as a percent of NAV, not a fraction", () => {
    renderTab(payload());
    expect(screen.getByTestId("event-risk-exposure").textContent ?? "").toMatch(
      /12\.0% of NAV/,
    );
  });

  it("says the NAV share is not reported rather than printing 0%", () => {
    renderTab(payload({ snapshot: snapshot({ exposure_share: null }) }));
    const tile = screen.getByTestId("event-risk-exposure").textContent ?? "";
    expect(tile).toMatch(/share of NAV not reported/i);
    expect(tile).not.toMatch(/0\.0% of NAV/);
  });

  it("keeps fractional day countdowns fractional", () => {
    expect(fmtCountdown(1.3, t)).toBe("in 1.3 days");
    expect(fmtCountdown(0.5, t)).toBe("in 12.0 hours");
    expect(fmtCountdown(0.01, t)).toBe("under an hour");
    expect(fmtCountdown(-2, t)).toBe("2.0 days ago");
    expect(fmtCountdown(null, t)).toBeNull();
  });
});

/* ---------------------------------------------------------- 6. null greeks */

describe("§66 — null greeks are not zero greeks", () => {
  it("reports the absence when option_greeks is null", () => {
    renderTab(payload({ snapshot: snapshot({ option_greeks: null }) }));
    expect(screen.queryByTestId("event-risk-greeks")).toBeNull();
    const absent = screen.getByTestId("event-risk-greeks-absent").textContent ?? "";
    expect(absent).toMatch(/absence of data/i);
    expect(absent).toMatch(/not a position with zero gamma, vega and theta/i);
  });

  it("emits no greek rows for a null block, three for a real one", () => {
    expect(greekRows(null)).toEqual([]);
    expect(greekRows(undefined)).toEqual([]);
    expect(greekRows({ gamma: 1, vega: 2, theta: 3 })).toHaveLength(3);
  });

  it("keeps a null vega INSIDE a real block as a row with no value", () => {
    const rows = greekRows({ gamma: 6.2, vega: null, theta: -18.4 });
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.key === "vega")?.value).toBeNull();
    renderTab(
      payload({ snapshot: snapshot({ option_greeks: { gamma: 6.2, vega: null, theta: -18.4 } }) }),
    );
    const vega = screen.getByTestId("event-risk-greek-vega").textContent ?? "";
    expect(vega).toMatch(/not supplied/i);
    expect(vega).not.toMatch(/0\.00/);
  });

  it("renders greeks unscaled and signed", () => {
    expect(fmtGreek(-18.4)).toBe("-18.40");
    expect(fmtGreek(210.5)).toBe("210.50");
    expect(fmtGreek(null)).toBeNull();
    renderTab(payload());
    expect(screen.getByTestId("event-risk-greek-theta").textContent ?? "").toContain("-18.40");
  });

  it("renders expected crush as a STATUS, never as a number", () => {
    renderTab(payload());
    const crush = screen.getByTestId("event-risk-expected-crush").textContent ?? "";
    expect(crush).toMatch(/NO_DATA/);
    // The SERVER's own note wins over this file's wording (§26/§36).
    expect(crush).toMatch(/no forward volatility surface is subscribed/i);
    expect(crush).toMatch(/NOT forecast/);
    // …and the local sentence stands in when the server sends no note, so the
    // cell can never be a bare status word with nothing explaining it.
    cleanup();
    renderTab(
      payload({
        options: { expected_iv_crush: "NO_DATA", expected_iv_crush_note: null },
      }),
    );
    expect(
      screen.getByTestId("event-risk-expected-crush").textContent ?? "",
    ).toMatch(/does not forecast IV crush/i);
    // Accepts the bare string the server sends AND a wrapped {status} block.
    expect(crushStatus("NO_DATA")).toBe("NO_DATA");
    expect(crushStatus({ status: "NO_DATA" })).toBe("NO_DATA");
    expect(crushStatus(null)).toBe("NO_DATA");
    expect(crushStatus({})).toBe("NO_DATA");
    expect(crushStatus("")).toBe("NO_DATA");
  });

  it("carries the historical IV crush with its own n", () => {
    renderTab(payload());
    const crush = screen.getByTestId("event-risk-iv-crush").textContent ?? "";
    // ABSOLUTE, like every other historical_event_risk block — the crushes are
    // signed, the statistic over them is not, and the label says "median abs"
    // so an unsigned 41.2% cannot be read as a 41% RISE in implied vol.
    expect(crush).toMatch(/41\.2%/);
    expect(crush).toMatch(/median abs/i);
    expect(crush).toMatch(/based on 6 events/);
  });

  it("drops the crush median when its own sample is empty", () => {
    renderTab(
      payload({
        options: { historical_iv_crush: { median_abs: null, n: 0 } },
      }),
    );
    const crush = screen.getByTestId("event-risk-iv-crush").textContent ?? "";
    expect(crush).toMatch(/no post-event IV stored/i);
    expect(crush).toMatch(/no previous comparable events on file/i);
  });

  it("always shows the long-call explainer, server-authored or local", () => {
    renderTab(payload());
    expect(screen.getByTestId("event-risk-crush-explainer").textContent ?? "").toMatch(
      /long call can lose/i,
    );
    cleanup();
    renderTab(payload({ options: { event_iv: null, explainer: null } }));
    expect(screen.getByTestId("event-risk-crush-explainer").textContent ?? "").toMatch(
      /can lose money despite being right about direction/i,
    );
  });
});

/* --------------------------------------------------------- 7. shared scale */

describe("implied vs historical share ONE scale", () => {
  it("normalises both bars against the larger of the two", () => {
    const bars = impliedVsHistorical(
      snapshot({ implied: { pct: 8.8 }, historical: { median_abs: 4.4, n: 8 } }),
    );
    expect(bars.scaleMax).toBe(8.8);
    expect(bars.impliedWidth).toBe(100);
    expect(bars.historicalWidth).toBeCloseTo(50, 5);
  });

  it("never renders both bars at equal length just because each is its own max", () => {
    const bars = impliedVsHistorical(
      snapshot({ implied: { pct: 12 }, historical: { median_abs: 3, n: 8 } }),
    );
    expect(bars.impliedWidth).not.toBe(bars.historicalWidth);
  });

  it("draws NO bar where the value is absent (a 0-width bar reads as 'no move priced')", () => {
    const bars = impliedVsHistorical(snapshot({ implied: null }));
    expect(bars.impliedWidth).toBeNull();
    expect(bars.historicalWidth).toBe(100);
    renderTab(payload({ snapshot: snapshot({ implied: null }) }));
    expect(screen.queryByTestId("event-risk-bar-implied")).toBeNull();
    expect(screen.getByTestId("event-risk-bar-historical")).not.toBeNull();
  });

  it("ignores a median whose sample is empty", () => {
    const bars = impliedVsHistorical(
      snapshot({ historical: { median_abs: 6.4, n: 0 }, implied: { pct: 8.8 } }),
    );
    expect(bars.historical).toBeNull();
    expect(bars.historicalWidth).toBeNull();
  });

  it("reports nothing to compare when neither exists", () => {
    const bars = impliedVsHistorical(
      snapshot({ implied: null, historical: { median_abs: null, n: 0 } }),
    );
    expect(bars.scaleMax).toBeNull();
    renderTab(
      payload({ snapshot: snapshot({ implied: null, historical: { median_abs: null, n: 0 } }) }),
    );
    expect(screen.getByTestId("event-risk-comparison-empty")).not.toBeNull();
  });

  it("keeps the §64 sample line beside the historical bar", () => {
    renderTab(payload());
    expect(screen.getByTestId("event-risk-comparison-sample").textContent ?? "").toContain(
      "based on 8 events",
    );
  });

  it("says both bars are on the same scale and that neither is a forecast", () => {
    renderTab(payload());
    const note = screen.getByTestId("event-risk-comparison-note").textContent ?? "";
    expect(note).toMatch(/SAME scale/i);
    expect(note).toMatch(/Neither is a forecast/i);
  });
});

/* --------------------------------------------------------- 8. sensitivity */

describe("§66 — sensitivity is an options axis, never the state", () => {
  it("keeps a LOW state LOW under a HIGH sensitivity", () => {
    renderTab(
      payload({ snapshot: snapshot({ event_risk_state: "LOW", sensitivity: "HIGH" }) }),
    );
    expect(screen.getByTestId("event-risk-state").textContent ?? "").toContain("LOW");
    expect(screen.getByTestId("event-risk-sensitivity").textContent ?? "").toMatch(/HIGH/);
  });

  it("says out loud that sensitivity is never folded into the state", () => {
    renderTab(payload());
    expect(screen.getByTestId("event-risk-sensitivity").textContent ?? "").toMatch(
      /never folded into it/i,
    );
  });

  it("reports an absent sensitivity as unreported rather than LOW", () => {
    renderPlan(planBlock(snapshot({ sensitivity: null })));
    expect(screen.getByTestId("plan-event-risk-sensitivity").textContent ?? "").toMatch(
      /not reported/i,
    );
  });
});

/* ------------------------------------------------------- 9. plan panel gate */

describe("the trade-plan panel is absent, not empty, with no event", () => {
  it("renders nothing at all for a null block", () => {
    const { container } = renderPlan(null);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByTestId("plan-event-risk")).toBeNull();
  });

  it("renders nothing for an object that is not a snapshot", () => {
    const { container } = renderPlan({} as PlanEventRisk);
    expect(container.innerHTML).toBe("");
  });

  it("renders the §65 list in order when an event IS upcoming", () => {
    renderPlan(planBlock(snapshot()));
    const panel = screen.getByTestId("plan-event-risk");
    expect(within(panel).getByTestId("plan-event-risk-headline").textContent ?? "").toMatch(
      /Earnings in 1\.3 days/,
    );
    expect(within(panel).getByTestId("plan-event-risk-historical")).not.toBeNull();
    expect(within(panel).getByTestId("plan-event-risk-implied").textContent ?? "").toContain("8.8%");
    expect(within(panel).getByTestId("plan-event-risk-sensitivity").textContent ?? "").toContain(
      "HIGH",
    );
    expect(within(panel).getByTestId("event-risk-state").textContent ?? "").toContain("HIGH");
    expect(within(panel).getByTestId("event-risk-shadow-badge").textContent ?? "").toContain(
      "SHADOW",
    );
  });

  it("prefers the plan's own days_to_event over the snapshot's countdown", () => {
    expect(planDays({ days_to_event: 2.5, time_to_event_days: 9 })).toBe(2.5);
    expect(planDays({ days_to_event: null, time_to_event_days: 9 })).toBe(9);
    expect(planDays({})).toBeNull();
    expect(planDays(null)).toBeNull();
  });

  it("shows the plan's caveats verbatim", () => {
    renderPlan(planBlock(snapshot()));
    const items = within(screen.getByTestId("plan-event-risk-caveats")).getAllByRole(
      "listitem",
    );
    expect(items.map((li) => li.textContent)).toEqual([
      "based on 8 events",
      "date ESTIMATED",
    ]);
  });

  it("says 'no sample' rather than a bare dash when the plan has no history", () => {
    renderPlan(planBlock(snapshot({ historical: { median_abs: null, n: 0 } })));
    const line = screen.getByTestId("plan-event-risk-historical").textContent ?? "";
    expect(line).toMatch(/no sample/i);
    expect(line).toMatch(/no previous comparable events on file/i);
  });
});

/* ------------------------------------------- 13. no-ticker + market-wide (§62) */

describe("§62 — an event with no issuer, and the market-wide flag", () => {
  it("renders available:false as a STATE with its reason, not an UNKNOWN chip", () => {
    renderTab({
      event_id: 9,
      event_key: "CPI:2026-09-10",
      as_of: "2026-09-01T12:00:00Z",
      available: false,
      reason:
        "this event has no ticker — event risk is measured for ONE position against ONE issuer's print",
      snapshot: null,
      options: null,
      enforcement: "SHADOW",
    });
    expect(screen.getByTestId("event-risk-unavailable").textContent ?? "").toContain(
      "this event has no ticker",
    );
    // Crucially NOT an UNKNOWN chip: that would claim a measurement was
    // attempted on this ticker and came back empty.
    expect(screen.queryByTestId("event-risk-state")).toBeNull();
    // …but SHADOW is still stated, since the banner is unconditional.
    expect(screen.getByTestId("event-risk-shadow-note")).not.toBeNull();
  });

  it("still shows the market-wide flag on a no-ticker event — that part DOES apply", () => {
    renderTab({
      available: false,
      reason: "this event has no ticker",
      market_wide: {
        event_key: "FOMC:2026-09-16",
        title: "FOMC decision",
        days_away: 2.2,
        note: "MARKET-WIDE: an FOMC decision moves every position in the book.",
      },
    });
    const flag = screen.getByTestId("event-risk-market-wide").textContent ?? "";
    expect(flag).toContain("FOMC decision");
    expect(flag).toMatch(/in 2\.2 days/);
    expect(flag).toMatch(/moves every position in the book/i);
  });

  it("renders the flag BESIDE a ticker's own state, never folded into it", () => {
    renderTab(
      payload({
        snapshot: snapshot({ event_risk_state: "LOW" }),
        market_wide: { title: "FOMC decision", days_away: 1.0 },
      }),
    );
    // The ticker's own state is untouched by a market-wide meeting.
    expect(screen.getByTestId("event-risk-state").textContent ?? "").toContain("LOW");
    expect(screen.getByTestId("event-risk-market-wide")).not.toBeNull();
  });

  it("renders no flag row at all when no meeting is close (an absence, not a cleared flag)", () => {
    renderTab(payload({ market_wide: null }));
    expect(screen.queryByTestId("event-risk-market-wide")).toBeNull();
  });
});

/* ------------------------------------------ 14. the server's own wording wins */

describe("§26/§36 — the server's audit-worthy wording is preferred", () => {
  it("prefers the server's SHADOW note over this file's sentence", () => {
    renderTab(payload({ note: "SHADOW: nothing here has ever resized an order." }));
    expect(screen.getByTestId("event-risk-shadow-note").textContent ?? "").toContain(
      "nothing here has ever resized an order",
    );
  });

  it("falls back to the local SHADOW sentence when the server sends none", () => {
    renderTab(payload({ note: null }));
    expect(screen.getByTestId("event-risk-shadow-note").textContent ?? "").toMatch(
      /blocks nothing/i,
    );
  });

  it("reads the coverage reason from INSIDE the snapshot, where the server puts it", () => {
    renderTab(
      payload({
        snapshot: snapshot({
          coverage: {
            history_events: 12,
            history_with_metrics: 0,
            reason:
              "no stored option metrics for this event or its previous prints — use POST /api/events/{id}/options/backfill",
          },
        }),
      }),
    );
    const coverage = screen.getByTestId("event-risk-coverage").textContent ?? "";
    expect(coverage).toMatch(/no stored option metrics/);
    // The remedy travels with the gap — a coverage reason that named no fix
    // would leave n=0 looking like a property of the stock.
    expect(coverage).toMatch(/backfill/);
  });
});

/* ------------------------------------ 15. the plan block's real nested shape */

describe("the plan block nests its snapshot, as the plans router builds it", () => {
  it("reads {snapshot, enforcement, note} rather than a flat snapshot", () => {
    renderPlan({
      snapshot: snapshot(),
      enforcement: "SHADOW",
      model_version: "event-risk-1.0.0",
      computed_at: "2026-08-26T14:30:00Z",
      note: "SHADOW: computed fresh on read; it changed nothing.",
    });
    expect(screen.getByTestId("plan-event-risk")).not.toBeNull();
    expect(screen.getByTestId("plan-event-risk-implied").textContent ?? "").toContain(
      "8.8%",
    );
    expect(screen.getByTestId("plan-event-risk-shadow").textContent ?? "").toContain(
      "it changed nothing",
    );
  });

  it("takes the countdown and the event key off the SNAPSHOT", () => {
    renderPlan(
      planBlock(
        snapshot({ time_to_event_days: 4.5, event_key: "MSFT:EARNINGS:2026-10-24" }),
      ),
    );
    const head = screen.getByTestId("plan-event-risk-headline").textContent ?? "";
    expect(head).toMatch(/in 4\.5 days/);
    expect(head).toContain("MSFT:EARNINGS:2026-10-24");
  });

  it("states an honest null exposure share — a plan is not a position", () => {
    // The plans router omits exposure and NAV deliberately, so the panel must
    // never render a 0% share of a portfolio the plan does not own.
    renderPlan(planBlock(snapshot({ exposure_share: null, position_exposure_usd: null })));
    expect(screen.getByTestId("plan-event-risk").textContent ?? "").not.toContain(
      "0.0% of NAV",
    );
  });

  it("still renders nothing for a wrapper whose snapshot is null", () => {
    const { container } = renderPlan({ snapshot: null, enforcement: "SHADOW" });
    expect(container.innerHTML).toBe("");
  });
});

/* ---------------------------------------------------------- 10. defensive */

describe("the renderer reads defensively — the server half is new", () => {
  it("renders a payload with an empty snapshot", () => {
    renderTab({ snapshot: {} });
    expect(screen.getByTestId("event-risk-state").textContent ?? "").toContain("UNKNOWN");
    expect(screen.getByTestId("event-risk-shadow-note")).not.toBeNull();
  });

  it("renders a payload with NO snapshot key at all", () => {
    renderTab({});
    expect(screen.getByTestId("event-risk-headline")).not.toBeNull();
  });

  it("renders with null drivers/caveats rather than crashing on .map", () => {
    renderTab(payload({ snapshot: snapshot({ drivers: null, caveats: null }) }));
    expect(screen.getByTestId("event-risk-drivers-empty")).not.toBeNull();
    expect(screen.getByTestId("event-risk-caveats-empty")).not.toBeNull();
  });

  it("filters non-strings out of a list without dropping the list", () => {
    expect(stringList(["a", "", "b"])).toEqual(["a", "b"]);
    expect(stringList(null)).toEqual([]);
    expect(stringList(undefined)).toEqual([]);
  });

  it("accepts the nested (event endpoint) and flat (plan) snapshot shapes alike", () => {
    expect(snapshotOf({ snapshot: { event_risk_state: "HIGH" } })?.event_risk_state).toBe(
      "HIGH",
    );
    expect(snapshotOf({ event_risk_state: "LOW" })?.event_risk_state).toBe("LOW");
    expect(snapshotOf(null)).toBeNull();
    expect(snapshotOf({})).toBeNull();
    expect(snapshotOf({ unrelated: 1 } as never)).toBeNull();
  });

  it("renders an unknown state token verbatim rather than crashing", () => {
    renderTab(payload({ snapshot: snapshot({ event_risk_state: "CATASTROPHIC" }) }));
    expect(screen.getByTestId("event-risk-state").textContent ?? "").toContain("CATASTROPHIC");
    expect(stateBadge("CATASTROPHIC")).toBe("dim");
  });

  it("keeps the coverage reason verbatim (§26/§36)", () => {
    renderTab(payload());
    expect(screen.getByTestId("event-risk-coverage").textContent ?? "").toContain(
      "8 of the last 12 events have stored option metrics",
    );
  });
});

/* ------------------------------------------------------ 11. no re-deriving */

describe("§63 — the tab formats a classification, it never recomputes one", () => {
  it("renders drivers in the SERVER's order, verbatim", () => {
    renderTab(payload());
    const items = within(screen.getByTestId("event-risk-drivers")).getAllByRole(
      "listitem",
    );
    expect(items.map((li) => li.textContent)).toEqual([
      "expected move 8.8% >= HIGH threshold 8.0%",
      "position exposure 12.0% of NAV >= 10.0% — bumped one level",
    ]);
  });

  it("does not contradict the server's state from the numbers it can see", () => {
    // An 'inconsistent' payload — a tiny move badged EXTREME — must render as
    // EXTREME. The classifier is the authority (§63); a UI that second-guessed
    // it would be a second, undocumented classifier.
    renderTab(
      payload({
        snapshot: snapshot({ event_risk_state: "EXTREME", expected_move_pct: 0.4 }),
      }),
    );
    expect(screen.getByTestId("event-risk-state").textContent ?? "").toContain("EXTREME");
    expect(screen.getByTestId("event-risk-expected-move").textContent ?? "").toContain("0.4%");
  });

  it("shows the basis beside the expected move and explains what it means", () => {
    renderTab(payload());
    expect(screen.getByTestId("event-risk-expected-move").textContent ?? "").toContain("IMPLIED");
    expect(screen.getByTestId("event-risk-basis-note").textContent ?? "").toMatch(
      /OPTION MARKET'S PRICE/,
    );
    cleanup();
    renderTab(
      payload({ snapshot: snapshot({ expected_move_basis: "HISTORICAL_MEDIAN" }) }),
    );
    expect(screen.getByTestId("event-risk-basis-note").textContent ?? "").toMatch(
      /MEDIAN ABSOLUTE MOVE/,
    );
  });

  it("states the model version so a state can be traced to the classifier that made it", () => {
    renderTab(payload());
    expect(screen.getByText(/event-risk-1\.0\.0/)).not.toBeNull();
  });

  it("says the state describes SIZE and never direction", () => {
    renderTab(payload());
    expect(screen.getByTestId("event-risk-meaning").textContent ?? "").toMatch(
      /not direction/i,
    );
    expect(screen.getByTestId("event-risk-limits").textContent ?? "").toMatch(
      /never direction/i,
    );
    expect(screen.getByTestId("event-risk-limits").textContent ?? "").toMatch(
      /no language model is involved/i,
    );
  });

  it("says the historical statistics are absolute", () => {
    renderTab(payload());
    expect(screen.getByText(/These are ABSOLUTE moves/)).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ 12. zh */

describe("bilingual", () => {
  it("renders the tab in Simplified Chinese when lang=zh", () => {
    store.set("lang", "zh");
    renderTab(payload());
    expect(screen.getByTestId("event-risk-state").textContent ?? "").toContain("高");
    expect(screen.getByText(/影子模式/)).not.toBeNull();
    expect(screen.getByTestId("event-risk-history-sample").textContent ?? "").toContain(
      "基于 8 次事件",
    );
  });

  it("renders the plan panel in Simplified Chinese too", () => {
    store.set("lang", "zh");
    renderPlan(planBlock(snapshot()));
    expect(screen.getByTestId("plan-event-risk-headline").textContent ?? "").toMatch(
      /财报/,
    );
    expect(screen.getByTestId("plan-event-risk-shadow").textContent ?? "").toMatch(
      /影子模式/,
    );
  });

  it("keeps the state word bilingual without changing its identity", () => {
    const zh = (en: string, z: string) => z;
    expect(stateLabel("UNKNOWN", zh)).toBe("未知");
    expect(stateLabel("UNKNOWN", t)).toBe("UNKNOWN");
    expect(stateLabel("LOW", zh)).toBe("低");
  });
});
