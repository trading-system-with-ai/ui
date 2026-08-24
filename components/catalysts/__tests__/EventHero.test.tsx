/**
 * Phase J §56 hero tests.
 *
 * Each pins a rule where a plausible-looking hero lies:
 *
 *  1. THE CERTAINTY BADGE IS UNCONDITIONAL, BOTH WAYS. §7's rule is that a
 *     DERIVED date must not read as a scheduled fact. A hero that badges only
 *     estimates trains the reader to read "no badge" as "confirmed", and then
 *     a rendering bug quietly promotes a guess into a schedule. So both the
 *     ESTIMATED and the CONFIRMED case are asserted.
 *  2. BOTH CLOCKS, ALWAYS (§10). Local wall clock + session + UTC. Dropping
 *     the local one relabels a before-market print for a traveller; dropping
 *     the UTC one hides the instant the platform actually compares on.
 *  3. THE COUNTDOWN IS SIGNED IN WORDS. Past events say POST-EVENT and T+,
 *     not a negative T-, which is ambiguous exactly when it matters.
 *  4. EXPOSURE IS COST BASIS, LABELLED — the same wording EventCard uses. The
 *     same number under two labels on two surfaces is worse than one absence.
 *  5. NO POSITION IS SAID, NOT BLANK. A missing exposure row on a risk-managed
 *     platform reads as "no risk".
 *  6. THE RISK CHIP NAMES ITS PHASE. An absent risk row reads as "checked and
 *     fine"; a green "OK" would be a lie. The honest placeholder is the point.
 *  7. §37's SENTENCE RIDES WITH EVERY IMPLIED MOVE, AS VISIBLE TEXT — not
 *     only as a title attribute, which does not exist on touch.
 *  8. NO IMPLIED-MOVE CHIP WITHOUT AN IMPLIED MOVE. A NO_DATA row carrying a
 *     stale number is a server retracting its own computation; rendering it
 *     would quote a figure nobody stands behind.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { EventDetail } from "@/lib/types";
import type { EventOptionsPayload } from "@/lib/types-options";
import EventHero, { heroCountdown } from "../EventHero";

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

/** Keys spelled exactly as the `event_out` serializer emits them. */
function makeEvent(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    event_id: 41,
    event_key: "ACME:EARNINGS:2026Q3",
    event_type: "EARNINGS",
    title: "ACME Q3 2026 earnings",
    ticker: "ACME",
    company_id: "acme",
    scheduled_at_utc: "2026-08-21T20:05:00+00:00",
    scheduled_at_local: "2026-08-21T16:05:00-04:00",
    event_timezone: "America/New_York",
    session: "AFTER_MARKET",
    status: "CONFIRMED",
    is_estimated: false,
    source: "PROVIDER",
    source_name: "acme-ir",
    source_url: "https://ir.example.com/q3",
    source_event_id: "x-1",
    last_verified_at: "2026-08-19T11:00:00+00:00",
    previous_event_id: 30,
    comparison_reason: "prior quarterly earnings",
    days_to_event: 2.4,
    lifecycle: "PRE_EVENT",
    relevance_tier: "POSITION",
    importance: 88,
    importance_stored: 88,
    importance_components: { event_type_base: 60, relevance: 28 },
    importance_raw_total: 88,
    importance_was_clamped: false,
    importance_model_version: "v1",
    series_id: null,
    agency: null,
    release_period: null,
    fiscal_quarter: 3,
    fiscal_year: 2026,
    speaker: null,
    topic: null,
    revision_history: [],
    exposure: { position_market_value: 42500, position_qty: 250, basis: "COST" },
    previous_event: null,
    ...overrides,
  } as EventDetail;
}

function makeOptions(overrides: Partial<EventOptionsPayload> = {}): EventOptionsPayload {
  return {
    event_id: 41,
    as_of: "2026-08-19T13:00:00+00:00",
    current: {
      status: "OK",
      basis: "LIVE_CHAIN_SNAPSHOT",
      implied_move_pct: 0.062,
    },
    ...overrides,
  } as EventOptionsPayload;
}

function renderHero(event: EventDetail, options?: EventOptionsPayload | null) {
  return render(
    <LanguageProvider>
      <EventHero event={event} options={options} />
    </LanguageProvider>,
  );
}

/* ------------------------------------------------------------------ tests */

describe("EventHero — identity and countdown (§56)", () => {
  it("leads with TICKER — title and the event's own subtitle", () => {
    renderHero(makeEvent());
    const hero = screen.getByTestId("event-hero");
    expect(hero.textContent).toContain("ACME");
    expect(hero.textContent).toContain("Earnings");
    expect(hero.textContent).toContain("ACME Q3 2026 earnings");
  });

  it("renders the T-n countdown in days", () => {
    renderHero(makeEvent({ days_to_event: 2.4 }));
    expect(screen.getByTestId("hero-countdown").textContent).toContain("T-2");
    expect(screen.getByTestId("hero-countdown").textContent).toContain("DAYS");
  });

  /* Rule 3 — a negative T- is ambiguous exactly when it matters. */
  it("says T+ and POST-EVENT once the event is behind us", () => {
    renderHero(makeEvent({ days_to_event: -3.2, lifecycle: "POST_EVENT" }));
    expect(screen.getByTestId("hero-countdown").textContent).toContain("T+3");
    expect(screen.getByTestId("hero-lifecycle").textContent).toContain("POST-EVENT");
  });

  it("keeps the compact hour form inside a day, where 'T-0 DAYS' says nothing", () => {
    expect(heroCountdown(0.25, t)).toContain("h");
    expect(heroCountdown(0.25, t)).not.toContain("DAYS");
  });

  it("singularises the unit at exactly one day", () => {
    expect(heroCountdown(1.2, t)).toContain("T-1 DAY");
    expect(heroCountdown(1.2, t)).not.toContain("DAYS");
  });
});

describe("EventHero — the date's certainty is never optional (§7)", () => {
  /* Rule 1, the dangerous half. */
  it("badges ESTIMATED when the date was derived", () => {
    renderHero(makeEvent({ is_estimated: true, status: "ESTIMATED" }));
    expect(screen.getByTestId("hero-estimated").textContent).toContain("ESTIMATED");
    expect(screen.queryByTestId("hero-confirmed")).toBeNull();
  });

  /* Rule 1, the half that makes the other half legible. */
  it("badges CONFIRMED when it was not — the badge is never simply absent", () => {
    renderHero(makeEvent({ is_estimated: false }));
    expect(screen.getByTestId("hero-confirmed").textContent).toContain("CONFIRMED");
    expect(screen.queryByTestId("hero-estimated")).toBeNull();
  });

  it("prints the source verbatim beside the certainty", () => {
    renderHero(makeEvent());
    const source = screen.getByTestId("hero-source").textContent ?? "";
    expect(source).toContain("acme-ir");
    expect(source).toContain("PROVIDER");
  });
});

describe("EventHero — both clocks and the session (§10)", () => {
  /* Rule 2. */
  it("shows the event's own wall clock with its zone", () => {
    renderHero(makeEvent());
    const local = screen.getByTestId("hero-local").textContent ?? "";
    // 16:05 in the event's own zone, NOT shifted into the test machine's.
    expect(local).toContain("4:05");
    expect(local).toContain("New York");
  });

  it("shows the UTC instant the platform compares on", () => {
    renderHero(makeEvent());
    const utc = screen.getByTestId("hero-utc").textContent ?? "";
    expect(utc).toContain("20:05");
    expect(utc).toContain("UTC");
  });

  it("shows the session, because 20:05 UTC is only meaningful with it", () => {
    renderHero(makeEvent());
    expect(screen.getByTestId("hero-session").textContent).toContain("After market");
  });
});

describe("EventHero — exposure carries the COST BASIS label (§54)", () => {
  /* Rule 4 — verbatim the wording EventCard uses. */
  it("labels the position value as basis, never as market value", () => {
    renderHero(makeEvent());
    const exposure = screen.getByTestId("hero-exposure").textContent ?? "";
    expect(exposure).toContain("$42,500");
    expect(exposure).toContain("COST basis");
    expect(exposure).toContain("250 qty");
  });

  /* Rule 5. */
  it("says 'no open position' rather than leaving the row blank", () => {
    renderHero(makeEvent({ exposure: null }));
    expect(screen.getByTestId("hero-exposure").textContent).toContain("No open position");
  });
});

describe("EventHero — the risk chip is an honest placeholder", () => {
  /* Rule 6. */
  it("names Phase K instead of showing a reassuring verdict", () => {
    renderHero(makeEvent());
    const risk = screen.getByTestId("hero-risk").textContent ?? "";
    expect(risk).toContain("Phase K");
    expect(risk).toContain("not yet available");
    expect(risk).not.toContain("OK");
  });
});

describe("EventHero — implied move is option-market pricing (§37)", () => {
  it("renders the ± band, since a straddle prices magnitude and has no sign", () => {
    renderHero(makeEvent(), makeOptions());
    expect(screen.getByTestId("hero-implied-move").textContent).toContain("±6.2%");
  });

  it("states which basis produced it — a live mid and a daily close differ", () => {
    renderHero(makeEvent(), makeOptions());
    expect(screen.getByTestId("hero-implied-basis").textContent).toContain("LIVE CHAIN");
  });

  /* Rule 7 — a caveat reachable only by mouse is absent on touch. */
  it("shows the not-a-forecast sentence as visible text, not only as a tooltip", () => {
    renderHero(makeEvent(), makeOptions());
    const note = screen.getByTestId("hero-implied-note").textContent ?? "";
    expect(note).toContain("not a forecast");
    expect(note).toContain("option-market pricing");
  });

  it("carries the caveat even when the server sent no disclaimer of its own", () => {
    renderHero(makeEvent(), makeOptions({ disclaimer: null }));
    expect(screen.getByTestId("hero-implied-note").textContent).toContain("not a forecast");
  });

  it("prefers the server's own wording when it sent some (§26/§36)", () => {
    renderHero(
      makeEvent(),
      makeOptions({ disclaimer: "SERVER SAYS: pricing, not a forecast." }),
    );
    expect(screen.getByTestId("hero-implied-note").textContent).toContain("SERVER SAYS");
  });

  it("omits the chip entirely when no options payload was loaded", () => {
    renderHero(makeEvent(), null);
    expect(screen.queryByTestId("hero-implied-move")).toBeNull();
    expect(screen.queryByTestId("hero-implied-note")).toBeNull();
  });

  /* Rule 8 — a finite number beside NO_DATA is a retraction. */
  it("omits the chip when the row is NO_DATA, even carrying a stale number", () => {
    renderHero(
      makeEvent(),
      makeOptions({
        current: { status: "NO_DATA", basis: "LIVE_CHAIN_SNAPSHOT", implied_move_pct: 0.062 },
      }),
    );
    expect(screen.queryByTestId("hero-implied-move")).toBeNull();
  });

  it("omits the chip when the payload carried no implied move at all", () => {
    renderHero(makeEvent(), makeOptions({ current: { status: "OK", basis: "LIVE_CHAIN_SNAPSHOT" } }));
    expect(screen.queryByTestId("hero-implied-move")).toBeNull();
  });
});

describe("EventHero — freshness is 'last verified', not 'now'", () => {
  it("labels the stamp as when a SOURCE last stood behind the date", () => {
    renderHero(makeEvent());
    const fresh = screen.getByTestId("hero-freshness").textContent ?? "";
    expect(fresh).toContain("Last verified");
    expect(fresh).toContain("2026");
  });

  it("prints a dash rather than a fabricated time when nothing verified it", () => {
    renderHero(makeEvent({ last_verified_at: null }));
    expect(screen.getByTestId("hero-freshness").textContent).toContain("—");
  });
});
