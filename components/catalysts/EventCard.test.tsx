/**
 * EventCard + CapabilityBanner + ImportanceBreakdown render tests.
 *
 * These pin the three honesty rules the Catalysts surface exists to keep:
 *
 * 1. An ESTIMATED date is visibly derived — amber badge, an explanation of
 *    where the estimate came from, and the confirm action. A CONFIRMED one
 *    offers no confirm action and shows no estimate wording.
 * 2. The §13 importance score is never a bare number: its components are
 *    reachable and they add up, with the pre-clamp total shown when the raw
 *    sum exceeded 100.
 * 3. Exposure is labelled COST basis, never presented as a live market value
 *    — the events API reads stored rows and never marks to market.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type {
  EventCapabilities,
  EventCardSummary,
  EventFreshness,
  EventRow,
} from "@/lib/types";
import CapabilityBanner from "./CapabilityBanner";
import EventCard from "./EventCard";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

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

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    event_id: 42,
    event_key: "EARNINGS:NVDA:2026-08-27",
    event_type: "EARNINGS",
    title: "NVDA earnings release (8-K Item 2.02)",
    ticker: "NVDA",
    company_id: "0001045810",
    scheduled_at_utc: "2026-08-27T20:05:00+00:00",
    scheduled_at_local: "2026-08-27T16:05:00-04:00",
    event_timezone: "America/New_York",
    session: "AFTER_MARKET",
    status: "CONFIRMED",
    is_estimated: false,
    source: "COMPANY_IR_SEC",
    source_name: "sec_edgar",
    source_url: "https://www.sec.gov/Archives/edgar/data/1045810/x.htm",
    source_event_id: "0001045810-26-000123",
    last_verified_at: "2026-08-19T12:00:00+00:00",
    previous_event_id: null,
    comparison_reason: null,
    days_to_event: 2.4,
    lifecycle: "PRE_EVENT",
    relevance_tier: "POSITION",
    importance: 90,
    importance_stored: 90,
    importance_components: { event_type_base: 60, relevance: 30 },
    importance_raw_total: 90,
    importance_was_clamped: false,
    importance_model_version: "importance-v1",
    series_id: null,
    agency: null,
    release_period: null,
    fiscal_quarter: 2,
    fiscal_year: 2027,
    speaker: null,
    topic: null,
    revision_history: [],
    exposure: null,
    ...overrides,
  };
}

function renderCard(event: EventRow, onConfirm = vi.fn()) {
  render(
    <LanguageProvider>
      <EventCard event={event} onConfirm={onConfirm} />
    </LanguageProvider>,
  );
  return onConfirm;
}

describe("EventCard — ESTIMATED dates are visibly derived (§11)", () => {
  it("an ESTIMATED event shows the badge, the explanation and the confirm action", () => {
    renderCard(makeEvent({ status: "ESTIMATED", is_estimated: true }));
    expect(screen.getByText("ESTIMATED")).toBeTruthy();
    expect(screen.getByText(/derived from this company's past filing cadence/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /confirm date/i })).toBeTruthy();
  });

  it("a CONFIRMED event offers NO confirm action and no estimate wording", () => {
    renderCard(makeEvent());
    expect(screen.getByText("CONFIRMED")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /confirm date/i })).toBeNull();
    expect(screen.queryByText(/filing cadence/i)).toBeNull();
  });

  it("clicking Confirm hands the whole event up rather than mutating in place", async () => {
    const user = userEvent.setup();
    const onConfirm = renderCard(makeEvent({ status: "ESTIMATED", is_estimated: true }));
    await user.click(screen.getByRole("button", { name: /confirm date/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].event_id).toBe(42);
  });

  it("a CANCELED event still renders — it is never silently hidden", () => {
    renderCard(makeEvent({ status: "CANCELED" }));
    expect(screen.getByText("CANCELED")).toBeTruthy();
    expect(screen.getByText(/NVDA earnings release/)).toBeTruthy();
  });
});

describe("EventCard — time is the event's own, in both stamps", () => {
  it("renders the ET wall clock (4:05 PM), not the runner's browser zone", () => {
    renderCard(makeEvent());
    expect(screen.getByText(/4:05/)).toBeTruthy();
  });

  it("keeps the UTC instant reachable on the same element", () => {
    const { container } = render(
      <LanguageProvider>
        <EventCard event={makeEvent()} onConfirm={vi.fn()} />
      </LanguageProvider>,
    );
    const when = container.querySelector(".ec-when");
    expect(when?.getAttribute("title")).toContain("20:05");
  });

  it("shows the session chip so BMO/AMC is never inferred from the hour alone", () => {
    renderCard(makeEvent());
    expect(screen.getByText("AMC")).toBeTruthy();
  });

  it("an UNKNOWN session says so instead of implying a default", () => {
    renderCard(makeEvent({ session: "UNKNOWN" }));
    expect(screen.getByText(/TIME UNKNOWN/i)).toBeTruthy();
  });
});

describe("EventCard — exposure is COST basis, never a live mark", () => {
  it("labels the basis alongside the figure", () => {
    renderCard(
      makeEvent({
        exposure: { position_qty: 200, position_market_value: 91000, basis: "COST" },
      }),
    );
    expect(screen.getByText(/\$91,000/)).toBeTruthy();
    expect(screen.getByText(/COST basis/)).toBeTruthy();
    expect(screen.getByText(/200 qty/)).toBeTruthy();
  });

  it("omits the exposure line entirely when there is no position", () => {
    renderCard(makeEvent({ exposure: null }));
    expect(screen.queryByText(/basis/i)).toBeNull();
  });
});

describe("EventCard — §13 importance shows its arithmetic", () => {
  it("the score is rendered with a breakdown toggle, not as a bare number", async () => {
    const user = userEvent.setup();
    renderCard(makeEvent());
    expect(screen.getByText("90")).toBeTruthy();
    const toggle = screen.getByRole("button", { name: /show breakdown/i });
    await user.click(toggle);
    expect(screen.getByText("event type base")).toBeTruthy();
    expect(screen.getByText("+60")).toBeTruthy();
    expect(screen.getByText("relevance")).toBeTruthy();
    expect(screen.getByText("+30")).toBeTruthy();
    expect(screen.getByText(/Total 90/)).toBeTruthy();
  });

  it("a CLAMPED score shows the pre-clamp total — 120 → 100, stated honestly", async () => {
    const user = userEvent.setup();
    renderCard(
      makeEvent({
        importance: 100,
        importance_raw_total: 120,
        importance_was_clamped: true,
        importance_components: { event_type_base: 90, relevance: 30 },
      }),
    );
    await user.click(screen.getByRole("button", { name: /show breakdown/i }));
    expect(screen.getByText(/Raw total 120 → clamped to 100/)).toBeTruthy();
  });

  it("names the model version and disclaims predictive power", async () => {
    const user = userEvent.setup();
    renderCard(makeEvent());
    await user.click(screen.getByRole("button", { name: /show breakdown/i }));
    expect(screen.getByText(/importance-v1/)).toBeTruthy();
    expect(screen.getByText(/says nothing about the direction/i)).toBeTruthy();
  });

  it("a STALE stored score is surfaced, not papered over", async () => {
    const user = userEvent.setup();
    renderCard(makeEvent({ importance: 90, importance_stored: 60 }));
    await user.click(screen.getByRole("button", { name: /show breakdown/i }));
    expect(screen.getByText(/Last stored score was 60/)).toBeTruthy();
  });

  it("an UNKNOWN component key still renders — nothing drops out of the sum", async () => {
    const user = userEvent.setup();
    renderCard(
      makeEvent({
        importance_components: { event_type_base: 60, implied_move_bonus: 15 },
        importance_raw_total: 75,
        importance: 75,
      }),
    );
    await user.click(screen.getByRole("button", { name: /show breakdown/i }));
    expect(screen.getByText("implied move bonus")).toBeTruthy();
    expect(screen.getByText("+15")).toBeTruthy();
  });
});

describe("EventCard — bilingual (§89)", () => {
  it("renders Chinese chrome when the persisted language is zh", () => {
    store.set("lang", "zh");
    renderCard(makeEvent({ status: "ESTIMATED", is_estimated: true }));
    expect(screen.getByText("估算")).toBeTruthy();
    expect(screen.getByRole("button", { name: /确认日期/ })).toBeTruthy();
  });

  it("the SERVER-generated title stays verbatim English in zh (§26/§36)", () => {
    store.set("lang", "zh");
    renderCard(makeEvent());
    expect(screen.getByText("NVDA earnings release (8-K Item 2.02)")).toBeTruthy();
  });
});

describe("CapabilityBanner — an empty calendar is explained, not just empty", () => {
  const freshness: EventFreshness = {
    last_ingest_at: "2026-08-19T11:00:00+00:00",
    per_provider: {},
    configured_providers: [],
  };

  it("earnings_calendar=false yields the ESTIMATED-dates explanation", () => {
    const capabilities: EventCapabilities = {
      massive_calendar: { earnings_calendar: false, market_holidays: true },
    };
    render(
      <LanguageProvider>
        <CapabilityBanner capabilities={capabilities} freshness={freshness} />
      </LanguageProvider>,
    );
    expect(screen.getByText(/Earnings calendar subscription not available/i)).toBeTruthy();
    expect(screen.getByText(/ESTIMATED from filing cadence/i)).toBeTruthy();
  });

  it("an ERROR STRING capability is shown verbatim, distinct from a plain false", () => {
    const capabilities: EventCapabilities = {
      sec_edgar: { earnings_history: "HTTP 429 rate limited" },
    };
    const { container } = render(
      <LanguageProvider>
        <CapabilityBanner capabilities={capabilities} freshness={freshness} />
      </LanguageProvider>,
    );
    expect(screen.getByText("PROBE FAILED")).toBeTruthy();
    const code = container.querySelector("code");
    expect(code?.textContent).toBe("HTTP 429 rate limited");
  });

  it("a configured-but-NEVER_RUN provider is named — absent and untried differ", () => {
    render(
      <LanguageProvider>
        <CapabilityBanner
          capabilities={{}}
          freshness={{
            ...freshness,
            configured_providers: ["fed"],
            per_provider: {
              fed: {
                configured: true,
                last_ok_at: null,
                last_fetched_at: null,
                last_error: null,
                note: "NEVER_RUN",
              },
            },
          }}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText("NEVER RUN")).toBeTruthy();
    expect(screen.getByText(/fed is configured but has not fetched yet/i)).toBeTruthy();
  });

  it("renders nothing at all when every capability is healthy", () => {
    const { container } = render(
      <LanguageProvider>
        <CapabilityBanner
          capabilities={{ alpaca_calendar: { market_calendar: true } }}
          freshness={{
            ...freshness,
            configured_providers: ["alpaca_calendar"],
            per_provider: {
              alpaca_calendar: {
                configured: true,
                last_ok_at: "2026-08-19T11:00:00+00:00",
                last_fetched_at: "2026-08-19T11:00:00+00:00",
                last_error: null,
                note: null,
              },
            },
          }}
        />
      </LanguageProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("both a denial and a probe error surface together, not one masking the other", () => {
    render(
      <LanguageProvider>
        <CapabilityBanner
          capabilities={{
            massive_calendar: { earnings_calendar: false },
            sec_edgar: { earnings_history: "HTTP 403" },
          }}
          freshness={freshness}
        />
      </LanguageProvider>,
    );
    const banner = screen.getByRole("status");
    expect(within(banner).getByText(/subscription not available/i)).toBeTruthy();
    expect(within(banner).getByText("PROBE FAILED")).toBeTruthy();
  });
});

/* --------------------------------------------- §54 card summaries (Phase J) */

function makeSummary(overrides: Partial<EventCardSummary> = {}): EventCardSummary {
  return {
    analysis_status: "READY",
    analysis_as_of: "2026-08-19T12:00:00+00:00",
    implied_move_pct: 0.062,
    implied_move_basis: "LIVE_CHAIN_SNAPSHOT",
    historical_move_median_abs: 0.0473,
    historical_move_n: 8,
    previous_event_actual_move_pct: -0.071,
    ...overrides,
  };
}

describe("EventCard — the §54 digest appears only when the feed sent one", () => {
  it("renders NOTHING summary-shaped when `summary` is absent", () => {
    renderCard(makeEvent());
    expect(screen.queryByTestId("ec-summary")).toBeNull();
    expect(screen.queryByTestId("ec-implied-move")).toBeNull();
    expect(screen.queryByRole("link", { name: /open analysis/i })).toBeNull();
  });

  it("keeps the honest Phase-F line when no summary was requested", () => {
    renderCard(makeEvent());
    expect(screen.getByText(/Analysis: not yet available/i)).toBeTruthy();
  });

  it("renders all three lines plus the research link when a summary arrives", () => {
    renderCard(makeEvent({ summary: makeSummary() }));
    expect(screen.getByTestId("ec-summary")).toBeTruthy();
    expect(screen.getByTestId("ec-hist-move")).toBeTruthy();
    expect(screen.getByTestId("ec-implied-move")).toBeTruthy();
    expect(screen.getByTestId("ec-analysis-status")).toBeTruthy();
    // Queried by its accessible name, not a test id: the link is only useful
    // if a reader (or a screen reader) can find it by what it says.
    expect(screen.getByRole("link", { name: /open analysis/i })).toBeTruthy();
  });

  it("caps the digest at three lines — a card is a scanning surface", () => {
    const { container } = render(
      <LanguageProvider>
        <EventCard event={makeEvent({ summary: makeSummary() })} onConfirm={vi.fn()} />
      </LanguageProvider>,
    );
    expect(container.querySelectorAll(".ec-summary .ec-sline").length).toBe(3);
  });

  it("the Open Analysis link deep-links to this event's analysis tab", () => {
    renderCard(makeEvent({ summary: makeSummary() }));
    expect(
      screen.getByRole("link", { name: /open analysis/i }).getAttribute("href"),
    ).toBe("/catalysts/42?tab=analysis");
  });
});

describe("EventCard — a present summary with a null metric says '—', never nothing", () => {
  it("a null median renders the em dash rather than dropping the line", () => {
    renderCard(
      makeEvent({
        summary: makeSummary({
          historical_move_median_abs: null,
          historical_move_n: null,
        }),
      }),
    );
    const line = screen.getByTestId("ec-hist-move");
    expect(within(line).getByText("—")).toBeTruthy();
    expect(line.textContent).not.toMatch(/n=/);
  });

  it("a null implied move renders the em dash and no basis badge", () => {
    renderCard(
      makeEvent({
        summary: makeSummary({ implied_move_pct: null, implied_move_basis: null }),
      }),
    );
    const line = screen.getByTestId("ec-implied-move");
    expect(within(line).getByText("—")).toBeTruthy();
    expect(screen.queryByTestId("ec-implied-basis")).toBeNull();
  });

  it("a null previous move omits that clause without hiding the median", () => {
    renderCard(
      makeEvent({
        summary: makeSummary({ previous_event_actual_move_pct: null }),
      }),
    );
    expect(screen.queryByTestId("ec-prev-move")).toBeNull();
    expect(screen.getByTestId("ec-hist-move").textContent).toMatch(/4\.7%/);
  });
});

describe("EventCard — the implied move is priced, never forecast", () => {
  it("renders the ± band, not a bare percent that reads as an expected gain", () => {
    renderCard(makeEvent({ summary: makeSummary() }));
    expect(screen.getByTestId("ec-implied-move").textContent).toContain("±6.2%");
  });

  it("states 'option-market pricing, not a forecast' ON THE FACE of the card", () => {
    renderCard(makeEvent({ summary: makeSummary() }));
    expect(
      screen.getByText(/option-market pricing, not a forecast/i),
    ).toBeTruthy();
  });

  it("carries the full §37 caveat in the line's title as well", () => {
    renderCard(makeEvent({ summary: makeSummary() }));
    expect(screen.getByTestId("ec-implied-move").getAttribute("title")).toMatch(
      /not a forecast/i,
    );
  });

  it("badges the basis — a live chain and a reconstruction are not one reading", () => {
    renderCard(makeEvent({ summary: makeSummary() }));
    expect(screen.getByTestId("ec-implied-basis").textContent).toBe("LIVE CHAIN");
  });

  it("a HISTORICAL_DAILY_CLOSE_APPROXIMATION basis is badged as the approximation it is", () => {
    renderCard(
      makeEvent({
        summary: makeSummary({
          implied_move_basis: "HISTORICAL_DAILY_CLOSE_APPROXIMATION",
        }),
      }),
    );
    expect(screen.getByTestId("ec-implied-basis").textContent).toBe(
      "HISTORICAL APPROXIMATION",
    );
  });

  it("an UNSTATED basis is named as unstated, never assumed to be live", () => {
    renderCard(
      makeEvent({ summary: makeSummary({ implied_move_basis: null }) }),
    );
    expect(screen.getByTestId("ec-implied-basis").textContent).toMatch(
      /BASIS NOT STATED/i,
    );
  });
});

describe("EventCard — §64: the sample size travels with the median", () => {
  it("prints n beside the median", () => {
    renderCard(makeEvent({ summary: makeSummary() }));
    expect(screen.getByTestId("ec-hist-move").textContent).toContain("(n=8)");
  });

  it("a median with no n says the count is unknown rather than implying one", () => {
    renderCard(
      makeEvent({ summary: makeSummary({ historical_move_n: null }) }),
    );
    expect(screen.getByTestId("ec-hist-move").textContent).toMatch(/n unknown/i);
  });

  it("the median is UNSIGNED (it is a |move|) while the last move keeps its sign", () => {
    const line = () => screen.getByTestId("ec-hist-move").textContent ?? "";
    renderCard(makeEvent({ summary: makeSummary() }));
    expect(line()).toContain("median |move| 4.7%");
    expect(line()).toContain("-7.1%");
  });
});

describe("EventCard — analysis freshness is the SERVER's verdict", () => {
  it("READY is badged and carries the as-of it was computed at", () => {
    renderCard(makeEvent({ summary: makeSummary() }));
    const line = screen.getByTestId("ec-analysis-status");
    expect(within(line).getByText("READY")).toBeTruthy();
    expect(screen.getByTestId("ec-analysis-as-of").textContent).toContain(
      "2026-08-19T12:00:00+00:00",
    );
  });

  it("STALE is shown as STALE — an aged analysis is not a missing one", () => {
    renderCard(
      makeEvent({ summary: makeSummary({ analysis_status: "STALE" }) }),
    );
    expect(screen.getByText("STALE")).toBeTruthy();
  });

  it("NONE renders with no as-of clause, because there is no analysis to date", () => {
    renderCard(
      makeEvent({
        summary: makeSummary({ analysis_status: "NONE", analysis_as_of: null }),
      }),
    );
    expect(screen.getByText("NONE")).toBeTruthy();
    expect(screen.queryByTestId("ec-analysis-as-of")).toBeNull();
  });

  it("an UNKNOWN status renders VERBATIM instead of being coerced to a known one", () => {
    renderCard(
      makeEvent({ summary: makeSummary({ analysis_status: "QUEUED" }) }),
    );
    expect(screen.getByText("QUEUED")).toBeTruthy();
  });
});

describe("EventCard — the digest is bilingual too (§89)", () => {
  it("renders Chinese labels and keeps the not-a-forecast caveat present", () => {
    store.set("lang", "zh");
    renderCard(makeEvent({ summary: makeSummary() }));
    expect(screen.getByText(/历史事件波幅/)).toBeTruthy();
    expect(screen.getByText(/期权市场定价,并非预测/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /查看分析/ })).toBeTruthy();
  });
});
