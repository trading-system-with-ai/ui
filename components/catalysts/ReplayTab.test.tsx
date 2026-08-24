/**
 * Phase C §20 Previous-Event (replay) tab tests.
 *
 * Each of these pins a rule where a plausible-looking implementation lies:
 *
 *  1. Minute-level nulls render the SERVER's reason, never a zero.
 *  2. "No minute bars stored" is a STATE with a remedy (the backfill button),
 *     not an error — it is the ORDINARY first-visit case.
 *  3. An UNKNOWN-session release is labelled as an ASSUMED measurement (§85),
 *     from the payload's own basis/confidence — never asserted by the tab.
 *  4. Both release clocks travel (§10), and neither is re-derived in the
 *     browser's timezone.
 *  5. `available:false` (a FUTURE event) is a 200 result, not a failure.
 *  6. The wire key spelling matches the pure layer's serializers exactly.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GLOSSARY } from "@/lib/glossary";
import { LanguageProvider } from "@/lib/i18n";
import type {
  EventIntradayReaction,
  EventReplayPayload,
  IntradayWindowCell,
} from "@/lib/types";
import { ReplayTabContent } from "./ReplayTab";
import {
  fmtMultiple,
  fmtVolume,
  isAssumedBasis,
  isoClock,
  isoStamp,
  lagNote,
  windowCell,
} from "./replay-format";

// This jsdom build ships no working localStorage (same shim as PriceTab.test).
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

function renderTab(data: EventReplayPayload, onBackfill = () => {}) {
  return render(
    <LanguageProvider>
      <ReplayTabContent data={data} onBackfill={onBackfill} />
    </LanguageProvider>,
  );
}

/* ------------------------------------------------------------- fixtures */

function makeWindow(overrides: Partial<IntradayWindowCell> = {}): IntradayWindowCell {
  return {
    minutes: 30,
    target_ts_utc: "2026-05-29T14:00:00+00:00",
    bar_ts_utc: "2026-05-29T14:00:00+00:00",
    price: 128.9,
    move: 0.0698,
    lag_seconds: 0,
    reason: null,
    ...overrides,
  };
}

/**
 * A real AMC replay. Keys are spelled exactly as
 * `replay.intraday_reaction_to_dict` emits them — `"5m"`/`"30m"`/`"60m"` for
 * windows, `after_hours_*` / `gap_at_open` / `volume_ratio_first_30m` for the
 * scalars. Getting this spelling wrong is precisely the seam bug this suite
 * exists to catch.
 */
function makeIntraday(
  overrides: Partial<EventIntradayReaction> = {},
): EventIntradayReaction {
  return {
    available: true,
    session: "AFTER_MARKET",
    basis: "after_market_next_open",
    confidence: "high",
    event_ts_utc: "2026-05-28T20:05:00+00:00",
    event_date_et: "2026-05-28",
    session_date_et: "2026-05-29",
    pre_event_close: 120.5,
    after_hours_move: 0.0612,
    after_hours_last_ts: "2026-05-28T23:58:00+00:00",
    after_hours_bars: 29,
    premarket_move: null,
    premarket_last_ts: null,
    premarket_bars: 0,
    reference_price: null,
    reference_ts: null,
    open_price: 128.7,
    open_ts: "2026-05-29T13:30:00+00:00",
    gap_at_open: 0.068,
    windows: {
      "5m": makeWindow({ minutes: 5, move: 0.0721, bar_ts_utc: "2026-05-29T13:35:00+00:00" }),
      "30m": makeWindow(),
      "60m": makeWindow({
        minutes: 60,
        move: null,
        price: null,
        bar_ts_utc: null,
        reason: "no minute bar at or before +60m as of the gate",
      }),
    },
    max_move_first_hour: 0.0834,
    volume_first_30m: 4_820_000,
    avg_volume_first_30m_prior_5_days: 1_550_000,
    volume_ratio_first_30m: 3.11,
    bars_used: 421,
    reasons: {
      premarket_move: "no pre-market bars for an after-market release",
    },
    model_version: "c1-intraday-v1",
    provenance: "QUANT",
    ...overrides,
  };
}

function makePayload(overrides: Partial<EventReplayPayload> = {}): EventReplayPayload {
  return {
    available: true,
    event_id: 901,
    event_key: "EARNINGS:NVDA:2026-05-28",
    ticker: "NVDA",
    as_of: "2026-08-18T20:05:00+00:00",
    event: {
      event_id: 901,
      event_key: "EARNINGS:NVDA:2026-05-28",
      event_type: "EARNINGS",
      ticker: "NVDA",
      date_et: "2026-05-28",
      session: "AFTER_MARKET",
      status: "CONFIRMED",
      source_url: "https://investor.example.com/q1",
    },
    information_before: {
      fundamentals: { available: true, as_of: "2026-05-28" },
      price_context: { available: true },
      news_window: {
        available: false,
        reason: "news window not yet available (Phase D)",
      },
    },
    release: {
      timestamp_utc: "2026-05-28T20:05:00+00:00",
      timestamp_et: "2026-05-28T16:05:00-04:00",
      session: "AFTER_MARKET",
      source_name: "Company IR",
      source_url: "https://investor.example.com/q1",
    },
    immediate_reaction: makeIntraday(),
    subsequent_reaction: {
      available: true,
      provenance: "QUANT",
      reaction: {
        event_date_et: "2026-05-28",
        session: "AFTER_MARKET",
        basis: "after_market_next_day",
        bars_available: true,
        pre_event_close: 120.5,
        pre_event_date: "2026-05-28",
        react_open: 128.7,
        react_close: 126.2,
        react_date: "2026-05-29",
        gap_return: 0.068,
        returns: { "1D": 0.0473, "3D": 0.0612, "5D": 0.0388, "10D": null },
        abs_returns: { "1D": 0.0473 },
        max_favorable_excursion: 0.0731,
        max_adverse_excursion: -0.0102,
        reasons: { return_10D: "insufficient_bars_after_event" },
      },
      abnormal: {
        abnormal: { "1D": 0.0402, "5D": 0.0251 },
        abnormal_gap: 0.0651,
        benchmark_returns: { "1D": 0.0071, "5D": 0.0137 },
        benchmark_gap_return: 0.0029,
        benchmark_available: true,
        basis: "after_market_next_day",
        reasons: {},
      },
    },
    data_freshness: { minute_bars_through: "2026-05-29T20:00:00+00:00" },
    provenance: {
      release: "DATA",
      minute_bars: "DATA",
      daily_bars: "DATA",
      metrics: "QUANT",
    },
    reasons: {},
    model_version: "c1-replay-v1",
    ...overrides,
  };
}

/* ---------------------------------------------------------------- tests */

describe("ReplayTab — immediate (minute-level) reaction", () => {
  it("renders after-hours, gap and the +5m/+30m marks from the wire spelling", () => {
    renderTab(makePayload());
    // Fractions scaled ONCE. after_hours 0.0612 → +6.1%, gap 0.068 → +6.8%.
    expect(screen.getByTestId("tile-after-hours").textContent).toContain("+6.1%");
    expect(screen.getByTestId("tile-gap").textContent).toContain("+6.8%");
    // Windows are keyed "5m"/"30m" by intraday_reaction_to_dict, not "5"/"30".
    expect(screen.getByTestId("window-5m").textContent).toContain("+7.2%");
    expect(screen.getByTestId("window-30m").textContent).toContain("+7.0%");
  });

  it("a window past the as-of gate shows its reason, never a carried-forward value", () => {
    renderTab(makePayload());
    const sixty = screen.getByTestId("window-60m");
    expect(sixty.textContent).toContain(
      "Unavailable — no minute bar at or before +60m as of the gate",
    );
    // It must NOT have inherited the +30m number.
    expect(sixty.textContent).not.toContain("+7.0%");
    expect(sixty.textContent).not.toContain("0.0%");
  });

  it("a null scalar carries the server's reason instead of a zero", () => {
    renderTab(makePayload());
    // premarket_move is null on an AMC release, with a stated reason.
    expect(screen.getByTestId("tile-premarket").textContent).toContain(
      "Unavailable — no pre-market bars for an after-market release",
    );
    expect(screen.getByTestId("tile-premarket").textContent).not.toContain("0.0%");
  });

  it("volume is a MULTIPLE with its baseline, never a percentage", () => {
    renderTab(makePayload());
    const tile = screen.getByTestId("tile-volume");
    // 3.11 → "3.11×"; rendering it as "311%" would read as a return.
    expect(tile.textContent).toContain("3.11×");
    expect(tile.textContent).toContain("4.82M");
    expect(tile.textContent).toContain("1.55M");
    expect(tile.textContent).not.toContain("311.0%");
  });

  it("shows the basis and bar count so the anchor rule is never implicit", () => {
    renderTab(makePayload());
    const line = screen.getByTestId("intraday-basis");
    expect(line.textContent).toContain("after_market_next_open");
    expect(line.textContent).toContain("high");
    expect(line.textContent).toContain("421");
  });
});

describe("ReplayTab — minute bars absent is a state, not an error", () => {
  it("renders the server reason plus the backfill button, and no error class", () => {
    const { container } = renderTab(
      makePayload({
        immediate_reaction: {
          available: false,
          reason: "no minute bars stored for this event window",
          provenance: "QUANT",
        },
      }),
    );
    expect(screen.getByTestId("intraday-unavailable").textContent).toBe(
      "Unavailable — no minute bars stored for this event window",
    );
    expect(screen.getByTestId("load-minute-bars")).toBeTruthy();
    expect(container.querySelector(".error")).toBeNull();
    // No fabricated tiles alongside the absence.
    expect(screen.queryByTestId("tile-gap")).toBeNull();
  });

  it("the Load-minute-bars button fires the backfill exactly once per press", async () => {
    const user = userEvent.setup();
    const onBackfill = vi.fn();
    renderTab(
      makePayload({
        immediate_reaction: { available: false, reason: "no minute bars stored" },
      }),
      onBackfill,
    );
    await user.click(screen.getByTestId("load-minute-bars"));
    expect(onBackfill).toHaveBeenCalledTimes(1);
  });

  it("says out loud WHY minute bars are not fetched on load", () => {
    renderTab(
      makePayload({
        immediate_reaction: { available: false, reason: "no minute bars stored" },
      }),
    );
    expect(screen.getByText(/Minute bars are fetched only on request/)).toBeTruthy();
  });
});

describe("ReplayTab — §85 assumed session", () => {
  it("flags an UNKNOWN-session replay as an ASSUMED measurement", () => {
    renderTab(
      makePayload({
        immediate_reaction: makeIntraday({
          session: "UNKNOWN",
          basis: "unknown_session_assumed_after_market",
          confidence: "low",
        }),
      }),
    );
    const badge = screen.getByTestId("assumed-session");
    expect(badge.textContent).toContain("ASSUMED SESSION");
    expect(badge.getAttribute("title")).toContain(
      "unknown_session_assumed_after_market",
    );
  });

  it("does NOT flag a normal high-confidence AMC replay", () => {
    renderTab(makePayload());
    expect(screen.queryByTestId("assumed-session")).toBeNull();
  });
});

describe("ReplayTab — release, information-before and subsequent blocks", () => {
  it("shows BOTH release clocks (§10) verbatim, without re-deriving either", () => {
    renderTab(makePayload());
    // The ET string is the server's own -04:00 wall clock, NOT a browser
    // conversion of the UTC one.
    expect(screen.getByTestId("release-et").textContent).toBe("2026-05-28 16:05");
    expect(screen.getByTestId("release-utc").textContent).toBe("2026-05-28 20:05");
  });

  it("an absent information_before ref states the reason, not a missing row", () => {
    renderTab(makePayload());
    const block = screen.getByTestId("information-before");
    expect(block.textContent).toContain("News window");
    expect(block.textContent).toContain(
      "Unavailable — news window not yet available (Phase D)",
    );
    // The available ones are marked as such rather than silently blank.
    expect(block.textContent).toContain("AVAILABLE");
  });

  it("renders the daily horizons and leaves an unmeasurable one explained", () => {
    renderTab(makePayload());
    const tiles = screen.getByTestId("subsequent-tiles");
    expect(tiles.textContent).toContain("+4.7%"); // 1D
    expect(tiles.textContent).toContain("+4.0%"); // abnormal 1D
    expect(tiles.textContent).toContain(
      "Unavailable — insufficient_bars_after_event",
    );
  });

  it("available:false (a FUTURE event) renders as an explanation, not an error", () => {
    const { container } = renderTab({
      available: false,
      reason: "event has not occurred as of as_of",
    });
    expect(screen.getByTestId("replay-unavailable").textContent).toBe(
      "Unavailable — event has not occurred as of as_of",
    );
    expect(container.querySelector(".error")).toBeNull();
    expect(screen.queryByTestId("tile-gap")).toBeNull();
  });
});

describe("ReplayTab — provenance, glossary and i18n", () => {
  it("labels release DATA and the reactions QUANT with the shared classes", () => {
    const { container } = renderTab(makePayload());
    expect(container.querySelectorAll(".provenance.data-driven").length).toBeGreaterThan(0);
    const quant = container.querySelectorAll(".provenance.quant-derived");
    expect(quant.length).toBeGreaterThan(0);
    expect(quant[0].textContent).toContain("QUANT");
  });

  it("every ⓘ on the replay tab resolves to a bilingual glossary entry", () => {
    const keys = [
      "event_after_hours_move",
      "event_gap_at_open",
      "event_intraday_windows",
      "event_intraday_confidence",
      "event_first_hour_range",
      "event_intraday_volume",
      "event_minute_bars_backfill",
      "event_bars_as_of",
      "event_session_timing",
    ];
    for (const k of keys) {
      const entry = GLOSSARY[k];
      expect(entry, `missing glossary key ${k}`).toBeTruthy();
      for (const side of [entry.en, entry.zh]) {
        expect(side.name.length).toBeGreaterThan(0);
        expect(side.short.length).toBeGreaterThan(0);
        expect(side.read.length).toBeGreaterThan(0);
      }
    }
  });

  it("renders the Chinese side when the persisted language is zh", () => {
    store.set("lang", "zh");
    renderTab(makePayload());
    expect(screen.getByText("即时反应（分钟 K 线）")).toBeTruthy();
    expect(screen.getByText("盘后波动")).toBeTruthy();
    expect(screen.getByText("公布")).toBeTruthy();
  });

  it("states that a single previous event is not a forecast", () => {
    renderTab(makePayload());
    expect(screen.getByText(/not a forecast/)).toBeTruthy();
  });
});

describe("replay-format helpers", () => {
  it("windowCell reads the server's label key first and invents nothing", () => {
    expect(windowCell({ "30m": makeWindow() }, 30)?.move).toBe(0.0698);
    // legacy/hand-built bare-number spelling still resolves
    expect(windowCell({ "30": makeWindow() }, 30)?.move).toBe(0.0698);
    expect(windowCell({}, 30)).toBeNull();
    expect(windowCell(null, 30)).toBeNull();
  });

  it("isAssumedBasis flags an unknown-session OR low-confidence measurement", () => {
    expect(isAssumedBasis({ basis: "unknown_session_assumed_after_market" })).toBe(true);
    expect(isAssumedBasis({ basis: "after_market_next_open", confidence: "low" })).toBe(
      true,
    );
    expect(
      isAssumedBasis({ basis: "after_market_next_open", confidence: "high" }),
    ).toBe(false);
    expect(isAssumedBasis(null)).toBe(false);
  });

  it("isoClock/isoStamp read the string and never reparse into the local zone", () => {
    // -04:00 ET must stay 16:05 regardless of the machine running the test.
    expect(isoClock("2026-05-28T16:05:00-04:00")).toBe("16:05");
    expect(isoStamp("2026-05-28T20:05:00+00:00")).toBe("2026-05-28 20:05");
    expect(isoStamp("2026-05-28")).toBe("2026-05-28");
    expect(isoClock(null)).toBeNull();
  });

  it("fmtVolume and fmtMultiple refuse to invent a value", () => {
    expect(fmtVolume(4_820_000)).toBe("4.82M");
    expect(fmtVolume(1_550)).toBe("1.6K");
    expect(fmtVolume(null)).toBeNull();
    expect(fmtVolume(Number.NaN)).toBeNull();
    expect(fmtMultiple(3.11)).toBe("3.11×");
    expect(fmtMultiple(null)).toBeNull();
  });

  it("lagNote annotates a late bar but stays silent on sub-minute lag", () => {
    const t = (en: string) => en;
    expect(lagNote(makeWindow({ lag_seconds: 840 }), t)).toBe("bar 14m late");
    expect(lagNote(makeWindow({ lag_seconds: -300 }), t)).toBe("bar 5m early");
    expect(lagNote(makeWindow({ lag_seconds: 12 }), t)).toBeNull();
    expect(lagNote(makeWindow({ lag_seconds: null }), t)).toBeNull();
  });
});

/*
 * WIRE-FORMAT PIN (cross-unit, U3 ↔ U4).
 *
 * `build_event_replay_payload` returns `{event, as_of, available, **replay
 * .to_dict(), not_backtestable}` — the pure layer's `to_dict()` spread FLAT,
 * so `immediate_reaction` / `subsequent_reaction` / `information_before` sit
 * at the TOP level, and its own `event` block overwrites the base one.
 *
 * The E1 verifier caught exactly this class of seam bug once already (the
 * price tab read `"1"` where the gateway wrote `"1D"`, so every cell fell
 * through to "Unavailable" against a real payload while fixtures that shared
 * the wrong spelling stayed green). These assertions encode the server's
 * ACTUAL spelling so the two files cannot drift apart silently again.
 */
describe("wire-format pin — the shape build_event_replay_payload really sends", () => {
  it("reads a flat-spread to_dict() payload, not a nested `replay` object", () => {
    // Assembled the way the gateway assembles it, key for key.
    const fromServer: EventReplayPayload = {
      event: {
        event_id: 901,
        event_key: "EARNINGS:NVDA:2026-05-28",
        event_type: "EARNINGS",
        ticker: "NVDA",
        date_et: "2026-05-28",
        session: "AFTER_MARKET",
        status: "CONFIRMED",
        source_url: null,
        scheduled_at_utc: "2026-05-28T20:05:00+00:00",
      },
      as_of: "2026-08-18T20:05:00+00:00",
      available: true,
      information_before: {
        fundamentals: {
          available: true,
          endpoint: "/api/events/901/fundamentals",
          as_of: "2026-08-18T20:05:00+00:00",
        },
        price_context: {
          available: true,
          endpoint: "/api/events/901/price-context",
          as_of: "2026-08-18T20:05:00+00:00",
        },
        news_window: {
          available: false,
          reason: "news window not yet available (Phase D)",
        },
      },
      release: {
        timestamp_utc: "2026-05-28T20:05:00+00:00",
        timestamp_et: "2026-05-28T16:05:00-04:00",
        session: "AFTER_MARKET",
        source_name: "Nasdaq",
        source_url: null,
      },
      immediate_reaction: makeIntraday(),
      subsequent_reaction: makePayload().subsequent_reaction,
      data_freshness: {
        minute_bars_stored: 421,
        daily_bars_through: "2026-08-18",
        bars_source: "alpaca",
      },
      provenance: {
        release: "DATA",
        minute_bars: "DATA",
        daily_bars: "DATA",
        metrics: "QUANT",
      },
      reasons: {},
      model_version: "c1-replay-v1",
      not_backtestable: ["intraday_reaction", "history_stats"],
    };
    renderTab(fromServer);
    // The event ref comes from the nested `event` block the gateway sends.
    expect(screen.getByTestId("replay-event-key").textContent).toBe(
      "EARNINGS:NVDA:2026-05-28",
    );
    expect(screen.getByTestId("replay-as-of").textContent).toBe(
      "2026-08-18T20:05:00+00:00",
    );
    // Measured values reach the tiles rather than falling through to
    // "Unavailable" — the failure mode this pin exists to catch.
    expect(screen.getByTestId("tile-gap").textContent).toContain("+6.8%");
    expect(screen.getByTestId("window-30m").textContent).toContain("+7.0%");
    expect(screen.queryByTestId("intraday-unavailable")).toBeNull();
    // The gateway's not_backtestable list is RENDERED, not silently dropped:
    // nothing on this tab may read as a validated signal.
    const nb = screen.getByTestId("replay-not-backtestable");
    expect(nb.textContent).toContain("intraday_reaction");
    expect(nb.textContent).toContain("not a forecast");
  });

  it("renders the gateway's real future-event refusal with its event ref intact", () => {
    renderTab({
      event: {
        event_id: 42,
        event_key: "EARNINGS:NVDA:2026-08-27",
        event_type: "EARNINGS",
        ticker: "NVDA",
        date_et: "2026-08-27",
        session: "AFTER_MARKET",
        status: "CONFIRMED",
        source_url: null,
        scheduled_at_utc: "2026-08-27T20:05:00+00:00",
      },
      as_of: "2026-08-18T20:05:00+00:00",
      available: false,
      reason:
        "event has not occurred as of as_of (2026-08-27T20:05:00+00:00 > 2026-08-18T20:05:00+00:00)",
    });
    // The server's full reason, including both instants, renders verbatim.
    expect(screen.getByTestId("replay-unavailable").textContent).toContain(
      "2026-08-27T20:05:00+00:00 > 2026-08-18T20:05:00+00:00",
    );
  });
});
