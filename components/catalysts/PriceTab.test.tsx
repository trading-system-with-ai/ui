/**
 * Phase E1 Price-tab render tests.
 *
 * These pin the honesty rules the tab exists to keep — every one of them is a
 * rule where a plausible-looking implementation silently lies:
 *
 *  1. A missing metric renders the SERVER'S reason, never a zero and never a
 *     bare em dash. (tiles, table cells, stat lines)
 *  2. A previous event whose bars predate the stored history collapses into
 *     one "BARS UNAVAILABLE" cell — it never shows a 0.0% reaction, which
 *     would drag every statistic on the page toward zero.
 *  3. Every historical statistic carries its sample size, and the positive
 *     tally stays a COUNT ("5/8"), never a percentage (§64).
 *  4. Provenance comes from the payload (DATA bars / QUANT metrics) and uses
 *     the shared .provenance classes, incl. quant-derived.
 *  5. as_of / bars_through are visible — the look-ahead gate, on screen.
 *  6. available:false is a 200 result rendered as an explanation, not an
 *     error state.
 *  7. Every ⓘ on the tab resolves to a real bilingual glossary entry.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { GLOSSARY } from "@/lib/glossary";
import { LanguageProvider } from "@/lib/i18n";
import type {
  EventPriceContext,
  EventPriceHistoryStats,
  EventPricePreContext,
  EventPricePreviousEvent,
} from "@/lib/types";
import { PriceTabContent } from "./PriceTab";
import {
  fmtRatioPct,
  horizonValue,
  positiveTally,
  reasonFor,
  signColor,
} from "./price-format";

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

function renderTab(data: EventPriceContext) {
  return render(
    <LanguageProvider>
      <PriceTabContent data={data} />
    </LanguageProvider>,
  );
}

/* ------------------------------------------------------------- fixtures */

function makePre(overrides: Partial<EventPricePreContext> = {}): EventPricePreContext {
  return {
    as_of_date_et: "2026-08-18",
    anchor_date_et: "2026-05-28",
    anchor_close: 120.5,
    anchor_basis: "previous_event",
    last_close: 138.4,
    bars_through: "2026-08-18",
    n_bars: 603,
    since_anchor_return: 0.1487,
    run_up_pct: 0.1487,
    benchmark_return: 0.041,
    relative_return: 0.1075,
    max_drawdown: -0.0832,
    realized_vol_20d: 0.3612,
    realized_vol_since_anchor: 0.3401,
    volume_trend: 0.2247,
    sma20: 133.1,
    sma50: 128.9,
    sma200: null,
    sma20_distance_pct: 0.0398,
    sma50_distance_pct: 0.0737,
    sma200_distance_pct: null,
    atr14: 4.12,
    atr_pct: 0.0298,
    high_52w: 149.9,
    low_52w: 86.2,
    distance_from_52w_high_pct: -0.0767,
    distance_from_52w_low_pct: 0.6056,
    reasons: {
      sma200: "needs 200 bars, have 143 since 2024-03-20",
      sma200_distance_pct: "needs 200 bars, have 143 since 2024-03-20",
    },
    ...overrides,
  };
}

function makeRow(
  overrides: Partial<EventPricePreviousEvent> = {},
): EventPricePreviousEvent {
  return {
    event_id: 901,
    event_key: "EARNINGS:NVDA:2026-05-28",
    date_et: "2026-05-28",
    session: "AFTER_MARKET",
    status: "CONFIRMED",
    bars_available: true,
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
      abs_returns: { "1D": 0.0473, "3D": 0.0612, "5D": 0.0388, "10D": null },
      max_favorable_excursion: 0.0731,
      max_adverse_excursion: -0.0102,
      reasons: { return_10D: "insufficient_bars_after_event" },
    },
    abnormal_vs_spy: {
      abnormal: { "1D": 0.0402, "5D": 0.0251 },
      abnormal_gap: 0.0651,
      benchmark_returns: { "1D": 0.0071, "5D": 0.0137 },
      benchmark_gap_return: 0.0029,
      benchmark_available: true,
      basis: "after_market_next_day",
      reasons: {},
    },
    ...overrides,
  };
}

/** A row from before the first stored bar — the live registry really has these. */
function makeNoBarsRow(): EventPricePreviousEvent {
  return makeRow({
    event_id: 880,
    event_key: "EARNINGS:NVDA:2023-11-21",
    date_et: "2023-11-21",
    bars_available: false,
    reason: "bars unavailable before 2024-03-20",
    abnormal_vs_spy: null,
    reaction: {
      event_date_et: "2023-11-21",
      session: "AFTER_MARKET",
      basis: null,
      bars_available: false,
      pre_event_close: null,
      pre_event_date: null,
      react_open: null,
      react_close: null,
      react_date: null,
      gap_return: null,
      returns: {},
      abs_returns: {},
      max_favorable_excursion: null,
      max_adverse_excursion: null,
      reasons: { bars: "bars unavailable before 2024-03-20" },
    },
  });
}

function makeStats(
  overrides: Partial<EventPriceHistoryStats> = {},
): EventPriceHistoryStats {
  return {
    horizon: "1D",
    n: 8,
    n_available: 8,
    median_abs: 0.042,
    mean_abs: 0.0511,
    p75_abs: 0.0703,
    p90_abs: 0.0912,
    max_abs: 0.1204,
    positive_count: 5,
    positive_frequency: 0.625,
    reasons: {},
    ...overrides,
  };
}

function makePayload(overrides: Partial<EventPriceContext> = {}): EventPriceContext {
  return {
    event_id: 42,
    ticker: "NVDA",
    as_of: "2026-08-18T20:05:00+00:00",
    provenance: { bars: "DATA", metrics: "QUANT" },
    data_freshness: {
      bars_through: "2026-08-18",
      bars_source: "alpaca",
      n_bars: 603,
    },
    pre_event: makePre(),
    previous_events: [makeRow(), makeNoBarsRow()],
    history_stats: {
      "1D": { last4: makeStats({ n: 4, n_available: 4 }), last8: makeStats(), last12: null },
      "5D": { last4: null, last8: makeStats({ horizon: "5D" }), last12: null },
    },
    not_backtestable: ["run_up_pct", "history_stats"],
    unavailable: [
      { field: "sma200", reason: "needs 200 bars, have 143 since 2024-03-20" },
    ],
    ...overrides,
  };
}

/* ---------------------------------------------------------------- tests */

describe("PriceTab — pre-event positioning tiles", () => {
  it("renders the §32 run-up as a signed percent of the FRACTION on the wire", () => {
    renderTab(makePayload());
    // 0.1487 → +14.9%, not 0.1487% and not 14.87 (fraction scaled ONCE).
    expect(screen.getByText("+14.9%")).toBeTruthy();
    // The anchor date is shown, so "since when" is never left implicit.
    expect(screen.getAllByText(/since 2026-05-28/).length).toBeGreaterThan(0);
  });

  it("shows the SPY-relative return separately from the raw run-up", () => {
    renderTab(makePayload());
    expect(screen.getByText("+10.8%")).toBeTruthy(); // relative_return 0.1075
    expect(screen.getByText("SPY +4.1%")).toBeTruthy(); // benchmark_return 0.041
  });

  it("a null metric shows the SERVER's reason, never a zero", () => {
    renderTab(makePayload());
    // sma200 is null with a real shortfall reason; the tile must carry it.
    const reasons = screen.getAllByText(
      /Unavailable — needs 200 bars, have 143 since 2024-03-20/,
    );
    expect(reasons.length).toBeGreaterThan(0);
    // and must NOT have invented a 0.0% distance for it.
    expect(screen.queryByText("SMA200 0.00")).toBeNull();
  });

  it("a null metric with NO server reason says so rather than inventing one", () => {
    // Only volume_trend is missing here, and the server sent no reasons at
    // all. The tile must NOT fabricate an explanation on the server's behalf.
    renderTab(
      makePayload({
        pre_event: makePre({
          volume_trend: null,
          sma200: 121.4,
          sma200_distance_pct: 0.14,
          reasons: {},
        }),
      }),
    );
    expect(screen.getByText("Unavailable — the server sent no reason.")).toBeTruthy();
  });
});

describe("PriceTab — previous event reactions table", () => {
  it("renders measured horizons for a row that has bars", () => {
    renderTab(makePayload());
    const rows = screen.getAllByTestId("prev-row");
    const withBars = rows.find((r) => r.getAttribute("data-bars-available") === "true");
    expect(withBars).toBeTruthy();
    const cells = within(withBars as HTMLElement);
    expect(cells.getByText("+6.8%")).toBeTruthy(); // gap
    expect(cells.getByText("+4.7%")).toBeTruthy(); // 1D
    expect(cells.getByText("+6.1%")).toBeTruthy(); // 3D
    expect(cells.getByText("+3.9%")).toBeTruthy(); // 5D
    expect(cells.getByText("+4.0%")).toBeTruthy(); // abnormal 1D
    expect(cells.getByText("+2.5%")).toBeTruthy(); // abnormal 5D
  });

  it("a horizon beyond the stored bars is a dim dash carrying its reason — not 0%", () => {
    renderTab(makePayload());
    const withBars = screen
      .getAllByTestId("prev-row")
      .find((r) => r.getAttribute("data-bars-available") === "true") as HTMLElement;
    const dash = within(withBars).getByTitle(
      "Unavailable — insufficient_bars_after_event",
    );
    expect(dash.textContent).toBe("—");
    expect(within(withBars).queryByText("+0.0%")).toBeNull();
    expect(within(withBars).queryByText("0.0%")).toBeNull();
  });

  it("an event predating the first bar renders 'bars unavailable', never zeros", () => {
    renderTab(makePayload());
    const noBars = screen
      .getAllByTestId("prev-row")
      .find((r) => r.getAttribute("data-bars-available") === "false") as HTMLElement;
    expect(noBars).toBeTruthy();
    const scope = within(noBars);
    expect(scope.getByText("BARS UNAVAILABLE")).toBeTruthy();
    expect(
      scope.getByText(/Unavailable — bars unavailable before 2024-03-20/),
    ).toBeTruthy();
    // The whole measured half of the row collapses into ONE cell — no 0.0%
    // reaction anywhere in it.
    expect(noBars.textContent).not.toMatch(/0\.0%/);
    expect(scope.getAllByRole("cell").length).toBe(3);
  });

  it("no previous events reports the absence instead of an empty table", () => {
    renderTab(makePayload({ previous_events: [] }));
    expect(screen.getByText(/No earlier comparable event is stored/)).toBeTruthy();
    expect(screen.queryAllByTestId("prev-row").length).toBe(0);
  });
});

describe("PriceTab — history stats strip (§19/§64)", () => {
  it("carries the sample size and keeps the positive tally a COUNT, not a percent", () => {
    renderTab(makePayload());
    const line = screen.getByTestId("stat-1D-last8");
    expect(line.textContent).toContain("median |1D| 4.2%");
    expect(line.textContent).toContain("p90 9.1%");
    expect(line.textContent).toContain("positive 5/8");
    expect(line.textContent).toContain("based on 8 events");
    // 0.625 must never surface as "62.5%" — that reads as a probability.
    expect(line.textContent).not.toContain("62.5%");
    expect(line.textContent).not.toContain("62%");
  });

  it("a window with fewer than 2 usable events shows a reason, not empty stats", () => {
    renderTab(makePayload());
    const line = screen.getByTestId("stat-1D-last12");
    expect(line.textContent).toMatch(/Unavailable —/);
    expect(line.textContent).not.toMatch(/median/);
  });

  it("says out loud that a historical count is not a probability", () => {
    renderTab(makePayload());
    expect(
      screen.getByText(/A historical count is never a probability/),
    ).toBeTruthy();
  });

  it("shows n_available when it differs from n (events whose bars were missing)", () => {
    renderTab(
      makePayload({
        history_stats: {
          "1D": { last12: makeStats({ n: 12, n_available: 10 }) },
        },
      }),
    );
    const line = screen.getByTestId("stat-1D-last12");
    expect(line.textContent).toContain("based on 12 events");
    expect(line.textContent).toContain("10 of 12 had usable bars");
  });
});

describe("PriceTab — provenance, freshness and unavailable states", () => {
  it("labels bars DATA and metrics QUANT using the shared .provenance classes", () => {
    const { container } = renderTab(makePayload());
    const dataChip = container.querySelector(".provenance.data-driven");
    const quantChips = container.querySelectorAll(".provenance.quant-derived");
    expect(dataChip?.textContent).toContain("DATA");
    expect(quantChips.length).toBeGreaterThan(0);
    expect(quantChips[0].textContent).toContain("QUANT");
  });

  it("shows as_of and bars_through — the look-ahead gate, on screen", () => {
    const { container } = renderTab(makePayload());
    const line = container.querySelector(".pt-freshness") as HTMLElement;
    expect(line.textContent).toContain("2026-08-18T20:05:00+00:00");
    expect(line.textContent).toContain("2026-08-18");
    expect(line.textContent).toContain("603");
    expect(line.textContent).toContain("alpaca");
  });

  it("available:false (macro event, no ticker) renders as an explanation, not an error", () => {
    const { container } = renderTab({ available: false, reason: "no_ticker" });
    expect(screen.getByTestId("price-unavailable").textContent).toBe(
      "Unavailable — no_ticker",
    );
    expect(container.querySelector(".error")).toBeNull();
    expect(screen.queryAllByTestId("prev-row").length).toBe(0);
  });

  it("lists server-named unavailable fields and the not-backtestable disclaimer", () => {
    renderTab(makePayload());
    const list = screen.getByTestId("unavailable-list");
    expect(list.textContent).toContain("sma200");
    expect(list.textContent).toContain("needs 200 bars, have 143 since 2024-03-20");
    const nb = screen.getByTestId("not-backtestable");
    expect(nb.textContent).toContain("run_up_pct");
    expect(nb.textContent).toContain("not validated signals");
  });
});

describe("PriceTab — i18n and glossary coverage", () => {
  it("every ⓘ on the tab resolves to a bilingual glossary entry", () => {
    const keys = [
      "event_run_up",
      "event_relative_return",
      "event_max_drawdown_window",
      "event_realized_vol_20d",
      "event_atr_pct",
      "event_sma_distance",
      "event_52w_distance",
      "event_volume_trend",
      "event_gap_return",
      "event_reaction_returns",
      "event_abnormal_return",
      "event_history_stats",
      "event_bars_as_of",
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

  it("a tile ⓘ opens its glossary card (Term is really wired, not decorative)", async () => {
    const user = userEvent.setup();
    renderTab(makePayload());
    await user.click(screen.getByRole("button", { name: "Run-up since last event" }));
    expect(
      screen.getByText(GLOSSARY.event_run_up.en.short),
    ).toBeTruthy();
  });

  it("renders the Chinese side when the persisted language is zh", () => {
    store.set("lang", "zh");
    renderTab(makePayload());
    expect(screen.getByText("自上次事件以来涨跌")).toBeTruthy();
    expect(screen.getByText("历次事件反应")).toBeTruthy();
    expect(screen.getByTestId("stat-1D-last8").textContent).toContain("基于 8 次事件");
  });
});

describe("price-format helpers", () => {
  it("fmtRatioPct scales the FRACTION once and refuses to invent a value", () => {
    expect(fmtRatioPct(0.042)).toBe("4.2%");
    expect(fmtRatioPct(0.042, 1, true)).toBe("+4.2%");
    expect(fmtRatioPct(-0.0832)).toBe("-8.3%");
    expect(fmtRatioPct(null)).toBeNull();
    expect(fmtRatioPct(Number.NaN)).toBeNull();
    expect(fmtRatioPct(Number.POSITIVE_INFINITY)).toBeNull();
    // Exact zero is a MEASURED zero and must still render.
    expect(fmtRatioPct(0, 1, true)).toBe("0.0%");
  });

  it("signColor never colours an absent or zero value", () => {
    expect(signColor(null)).toBe("var(--text-dim)");
    expect(signColor(0)).toBe("var(--text-dim)");
    expect(signColor(Number.NaN)).toBe("var(--text-dim)");
    expect(signColor(0.01)).toBe("var(--green)");
    expect(signColor(-0.01)).toBe("var(--red)");
  });

  it("horizonValue reads JSON string keys and rejects non-finite values", () => {
    expect(horizonValue({ "1D": 0.05 }, 1)).toBe(0.05);
    expect(horizonValue({ "1D": null }, 1)).toBeNull();
    // legacy/hand-built bare-number spelling still resolves
    expect(horizonValue({ "1": 0.05 }, 1)).toBe(0.05);
    expect(horizonValue({}, 10)).toBeNull();
    expect(horizonValue(null, 1)).toBeNull();
  });

  it("reasonFor prefers the exact field then falls back to block-level reasons", () => {
    expect(reasonFor({ sma200: "short history" }, "sma200")).toBe("short history");
    expect(reasonFor({ bars: "no bars stored" }, "sma200")).toBe("no bars stored");
    expect(reasonFor({}, "sma200")).toBeNull();
    expect(reasonFor(undefined, "sma200")).toBeNull();
  });

  it("positiveTally is a count and disappears rather than dividing by zero", () => {
    expect(positiveTally(5, 8)).toBe("5/8");
    expect(positiveTally(0, 3)).toBe("0/3");
    expect(positiveTally(null, 8)).toBeNull();
    expect(positiveTally(5, 0)).toBeNull();
  });

  /*
   * WIRE-FORMAT PIN (cross-unit). The gateway renders horizon maps through
   * `_horizon_map`, which emits the LABEL as the key (`{f"{k}D": ...}`), and
   * records a missing horizon under `return_{k}D` / `abnormal_{k}D`. An
   * earlier revision of this tab looked up `"1"` and `returns.1`, so every
   * measured cell fell through to "Unavailable" against a real payload while
   * the fixtures — which used the same wrong spelling — stayed green. These
   * assertions encode the server's actual spelling so the two cannot drift
   * apart silently again.
   */
  it("flags an UNKNOWN-session row as a two-day span (\u00a785)", () => {
    renderTab(
      makePayload({
        previous_events: [
          {
            ...makeRow(),
            session: null,
            reaction: {
              ...makeRow().reaction,
              session: null,
              basis: "unknown_session_two_day_span",
            },
          },
        ],
      }),
    );
    // The widened window is visible, not buried in the payload.
    expect(screen.getByTestId("basis-two-day-span")).toBeTruthy();
  });

  it("does NOT flag a normal single-session row", () => {
    renderTab(makePayload());
    expect(screen.queryByTestId("basis-two-day-span")).toBeNull();
  });

  it("reads the gateway's real horizon key spelling, not a bare integer", () => {
    expect(horizonValue({ "1D": 0.0473, "10D": null }, 1)).toBe(0.0473);
    expect(horizonValue({ "10D": 0.02 }, 10)).toBe(0.02);
    // The label key wins when both spellings are somehow present.
    expect(horizonValue({ "1D": 0.9, "1": 0.1 }, 1)).toBe(0.9);
  });

  it("renders a measured horizon from a real-format payload instead of Unavailable", () => {
    renderTab(
      makePayload({
        previous_events: [
          {
            ...makeRow(),
            reaction: {
              ...makeRow().reaction,
              returns: { "1D": 0.0473, "3D": null, "5D": 0.0388, "10D": null },
              reasons: { return_3D: "insufficient_bars_after_event" },
            },
          },
        ],
      }),
    );
    // The measured 1D value reaches the table (rendered to one decimal).
    expect(screen.getByTestId("prev-row").textContent).toContain("+4.7%");
    // The unmeasurable one carries the server's own reason, not a bare dash.
    expect(
      screen.getByTitle(/insufficient_bars_after_event/i),
    ).toBeTruthy();
  });
});
