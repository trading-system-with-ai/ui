/**
 * Phase I §18/§36-§37 Options-tab tests.
 *
 * Each pins a rule where a plausible-looking implementation lies:
 *
 *  1. §37's "not a forecast" wording is ALWAYS on screen — including when the
 *     server sends no `disclaimer` at all. A caveat conditional on a server
 *     field disappears on exactly the degraded payloads that need it.
 *  2. A NO_DATA straddle prints the server's reason where the number would
 *     have been, and NO number anywhere near it. The dangerous failure is a
 *     0 or a "—" in the implied-move tile, which on an options screen reads
 *     as "the market priced no move".
 *  3. A finite number sitting beside `status: "NO_DATA"` is a server
 *     RETRACTING its own computation, and rendering it would quote a figure
 *     nobody stands behind.
 *  4. `basis` is visible on every metric — a straddle rebuilt from daily
 *     CLOSES and one read off the live chain share units and mean different
 *     things, so the two can never render identically.
 *  5. The classification carries no colour and no direction word.
 *  6. Both the history table and the chart fold the actual move to |x|: a
 *     signed actual against an unsigned implied ranks a −9% fall below a +6%
 *     expectation.
 *  7. A chart bar is DRAWN ONLY where the value exists — never a zero-height
 *     bar standing in for a missing leg.
 *  8. A backfill that stored nothing is reported as a state with its reason,
 *     never as a success.
 *  9. Wire key spelling matches the U3 payload exactly — getting this wrong
 *     is precisely the seam bug this suite exists to catch.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type {
  EventOptionHistoryRow,
  EventOptionMetrics,
  EventOptionsPayload,
} from "@/lib/types-options";
import ImpliedVsActualChart from "../ImpliedVsActualChart";
import { OptionsTabContent } from "../OptionsTab";
import {
  basisBadge,
  chartRows,
  classificationText,
  disclaimerText,
  firstNote,
  fmtBand,
  fmtIv,
  fmtRatio,
  metricValue,
  noData,
  statsLine,
} from "../options-format";

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
 * Keys spelled exactly as the U3 `GET /api/events/{id}/options` payload emits
 * them: `implied_move_pct`, `implied_move_points`, `iv_crush_pct`,
 * `implied_realized_ratio`, `call_ticker`, `put_ticker`.
 */
function metrics(overrides: Partial<EventOptionMetrics> = {}): EventOptionMetrics {
  return {
    event_id: 41,
    event_key: "AAPL:EARNINGS:2026-08-01",
    basis: "HISTORICAL_DAILY_CLOSE_APPROXIMATION",
    status: "OK",
    expiry: "2026-08-07",
    strike: 210,
    spot: 209.4,
    implied_move_pct: 0.0621,
    implied_move_points: 13.0,
    iv_before: 0.58,
    iv_after: 0.34,
    iv_crush_pct: -0.4138,
    actual_move_pct: 0.0412,
    implied_realized_ratio: 0.663,
    classification: "OVER_PRICED",
    notes: [],
    call_ticker: "O:AAPL260807C00210000",
    put_ticker: "O:AAPL260807P00210000",
    ...overrides,
  };
}

function historyRow(
  date: string,
  overrides: Partial<EventOptionHistoryRow> = {},
): EventOptionHistoryRow {
  return { ...metrics(), event_key: `AAPL:EARNINGS:${date}`, event_date: date, ...overrides };
}

function payload(overrides: Partial<EventOptionsPayload> = {}): EventOptionsPayload {
  return {
    event_id: 41,
    event_key: "AAPL:EARNINGS:2026-11-01",
    ticker: "AAPL",
    as_of: "2026-08-19T12:00:00+00:00",
    disclaimer:
      "The implied move is option-market pricing, not a forecast of direction or magnitude.",
    current: metrics(),
    history: [
      historyRow("2026-05-02"),
      historyRow("2026-02-01", { implied_move_pct: 0.051, actual_move_pct: -0.088 }),
    ],
    stats: {
      actual: { median_abs: 0.041, p90_abs: 0.079, max_abs: 0.093, n: 8 },
      implied: { median_abs: 0.058, p90_abs: 0.071, max_abs: 0.082, n: 8 },
    },
    comparison: {
      implied_pct: 0.0621,
      hist_median_abs: 0.041,
      hist_p90_abs: 0.079,
      hist_max_abs: 0.093,
    },
    coverage: {},
    ...overrides,
  };
}

function renderTab(data: EventOptionsPayload) {
  return render(
    <LanguageProvider>
      <OptionsTabContent
        data={data}
        onBackfill={() => {}}
        onBackfillHistory={() => {}}
      />
    </LanguageProvider>,
  );
}

/* ------------------------------------------------------- §37 the wording */

describe("§37 — implied move is a price, not a forecast", () => {
  it("renders the server's disclaimer verbatim", () => {
    renderTab(payload());
    const banner = screen.getByTestId("options-disclaimer");
    // No jest-dom in this suite — plain textContent assertions throughout.
    expect(banner.textContent ?? "").toContain("not a forecast");
    expect(banner.textContent ?? "").toContain("option-market pricing");
  });

  it("still states 'not a forecast' when the server sent NO disclaimer", () => {
    // The whole point: a caveat that only appears when a server field is
    // populated is a caveat that vanishes on a degraded payload.
    renderTab(payload({ disclaimer: null }));
    const banner = screen.getByTestId("options-disclaimer");
    expect(banner.textContent ?? "").toMatch(/not a forecast/i);
    expect(banner.textContent ?? "").toMatch(/option-market pricing/i);
  });

  it("states it when the disclaimer is an empty string too", () => {
    expect(disclaimerText("", t)).toMatch(/not a forecast/i);
    expect(disclaimerText("   ", t)).toMatch(/not a forecast/i);
    expect(disclaimerText("server wording", t)).toBe("server wording");
  });

  it("the tab-level caveat names the daily-close approximation and the flat rate", () => {
    renderTab(payload());
    const limits = screen.getByTestId("options-limits");
    expect(limits.textContent ?? "").toMatch(/DAILY CLOSES/);
    expect(limits.textContent ?? "").toMatch(/4% risk-free/);
    expect(limits.textContent ?? "").toMatch(/never been tested as a trading rule/);
  });
});

/* ------------------------------------------------------- numbers render */

describe("the implied move renders as a ± band", () => {
  it("shows the magnitude with a ±, never as a signed return", () => {
    renderTab(payload());
    expect(within(screen.getByTestId("implied-move")).getByText("±6.2%")).toBeTruthy();
  });

  it("prints the points sub-line in points, not percent", () => {
    renderTab(payload());
    expect(screen.getByTestId("implied-move").textContent ?? "").toContain("13.00 pts");
  });

  it("renders IV, the crush and the ratio from the payload's own keys", () => {
    renderTab(payload());
    expect(within(screen.getByTestId("iv-before")).getByText("58.0%")).toBeTruthy();
    expect(within(screen.getByTestId("iv-after")).getByText("34.0%")).toBeTruthy();
    expect(within(screen.getByTestId("iv-crush")).getByText("-41.4%")).toBeTruthy();
    expect(within(screen.getByTestId("implied-realized-ratio")).getByText("0.66×")).toBeTruthy();
  });

  it("prints the contract the straddle was priced on, so the number is auditable", () => {
    renderTab(payload());
    const contract = screen.getByTestId("options-contract");
    expect(contract.textContent ?? "").toContain("2026-08-07");
    expect(contract.textContent ?? "").toContain("210.00");
    expect(contract.textContent ?? "").toContain("O:AAPL260807C00210000");
  });

  it("fmtBand / fmtIv / fmtRatio are null-honest, never zero-filled", () => {
    expect(fmtBand(null)).toBeNull();
    expect(fmtBand(undefined)).toBeNull();
    expect(fmtBand(Number.NaN)).toBeNull();
    expect(fmtIv(null)).toBeNull();
    expect(fmtRatio(null)).toBeNull();
    // A real zero is still a number and must survive the gate.
    expect(fmtBand(0)).toBe("±0.0%");
  });
});

/* --------------------------------------------------------- NO_DATA path */

describe("an uncomputable straddle is an absence, never a zero", () => {
  it("renders the server's reason and NO implied-move tile", () => {
    renderTab(
      payload({
        current: metrics({
          status: "NO_DATA",
          implied_move_pct: null,
          implied_move_points: null,
          iv_before: null,
          iv_after: null,
          iv_crush_pct: null,
          implied_realized_ratio: null,
          classification: null,
          notes: ["no daily bars for O:AAPL260807P00210000 in [2026-07-27, 2026-08-04]"],
        }),
      }),
    );
    const empty = screen.getByTestId("options-no-data");
    expect(empty.textContent ?? "").toContain(
      "no daily bars for O:AAPL260807P00210000",
    );
    expect(screen.queryByTestId("implied-move")).toBeNull();
    // No zero anywhere in the block that could be read as "priced no move".
    expect(empty.textContent ?? "").not.toMatch(/0\.0%/);
  });

  it("says the straddle is never approximated from a neighbouring strike", () => {
    renderTab(payload({ current: metrics({ status: "NO_DATA", implied_move_pct: null }) }));
    expect(screen.getByTestId("options-no-data").textContent ?? "").toMatch(
      /never approximated from a neighbouring strike/,
    );
  });

  it("a null `current` is the same honest absence, not a crash", () => {
    renderTab(payload({ current: null, coverage: { reason: "event_has_no_ticker" } }));
    expect(screen.getByTestId("options-no-data").textContent ?? "").toContain(
      "event_has_no_ticker",
    );
  });

  it("SUPPRESSES a finite number that arrives beside status NO_DATA", () => {
    // A server sending 0.06 with NO_DATA is retracting its own computation.
    // Printing it would quote a figure nobody stands behind.
    const row = metrics({ status: "NO_DATA", implied_move_pct: 0.06 });
    expect(metricValue(row, row.implied_move_pct)).toBeNull();
    expect(noData(row)).toBe(true);
    renderTab(payload({ current: row }));
    expect(screen.queryByText("±6.0%")).toBeNull();
  });

  it("PARTIAL still renders the numbers it has, under its own badge", () => {
    renderTab(
      payload({
        current: metrics({ status: "PARTIAL", iv_after: null, iv_crush_pct: null }),
      }),
    );
    expect(screen.getByTestId("options-status").textContent).toBe("PARTIAL");
    expect(within(screen.getByTestId("implied-move")).getByText("±6.2%")).toBeTruthy();
    // The half that did not compute says so rather than showing a zero.
    expect(screen.getByTestId("iv-after").textContent ?? "").toMatch(/Unavailable/);
  });

  it("renders every server note verbatim", () => {
    renderTab(
      payload({ current: metrics({ notes: ["expiry probed 3 fridays", "r=0.04 assumed"] }) }),
    );
    const notes = screen.getByTestId("options-notes");
    expect(notes.textContent ?? "").toContain("expiry probed 3 fridays");
    expect(notes.textContent ?? "").toContain("r=0.04 assumed");
  });
});

/* ------------------------------------------------------------ the basis */

describe("every number wears its basis", () => {
  it("labels a historical reconstruction as an APPROXIMATION", () => {
    renderTab(payload());
    expect(screen.getByTestId("options-basis").textContent).toBe(
      "HISTORICAL APPROXIMATION",
    );
  });

  it("labels a live chain read differently from a historical one", () => {
    renderTab(payload({ current: metrics({ basis: "LIVE_CHAIN_SNAPSHOT" }) }));
    expect(screen.getByTestId("options-basis").textContent).toBe("LIVE CHAIN");
  });

  it("the historical badge's tooltip says a close is not a mid", () => {
    const spec = basisBadge("HISTORICAL_DAILY_CLOSE_APPROXIMATION", t);
    expect(spec.note ?? "").toMatch(/close is not a mid/);
    expect(spec.badge).toBe("amber");
  });

  it("an UNKNOWN basis renders verbatim rather than being coerced to LIVE", () => {
    const spec = basisBadge("SOMETHING_NEW", t);
    expect(spec.text).toBe("SOMETHING_NEW");
    expect(spec.badge).toBe("dim");
  });

  it("a MISSING basis says so instead of assuming one", () => {
    const spec = basisBadge(null, t);
    expect(spec.text).toMatch(/NOT STATED/);
    expect(spec.badge).toBe("dim");
  });
});

/* -------------------------------------------------- the classification */

describe("the verdict is arithmetic, not advice", () => {
  it("renders the classification as neutral text", () => {
    renderTab(payload());
    expect(screen.getByTestId("implied-realized-ratio").textContent ?? "").toContain(
      "OVER-PRICED",
    );
  });

  it("carries no direction word and no probability", () => {
    renderTab(payload());
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/\b(buy|sell|bullish|bearish)\b/i);
    expect(body).not.toMatch(/probability of/i);
  });

  it("an unknown verdict token renders verbatim", () => {
    expect(classificationText("WILDLY_OFF", t)).toBe("WILDLY OFF");
    expect(classificationText(null, t)).toBeNull();
    expect(classificationText("", t)).toBeNull();
  });
});

/* ------------------------------------------------------- the comparison */

describe("priced now vs realized before", () => {
  it("renders median / p90 / max with the sample size attached (§64)", () => {
    renderTab(payload());
    expect(within(screen.getByTestId("cmp-median")).getByText("4.1%")).toBeTruthy();
    expect(within(screen.getByTestId("cmp-p90")).getByText("7.9%")).toBeTruthy();
    expect(within(screen.getByTestId("cmp-max")).getByText("9.3%")).toBeTruthy();
    expect(screen.getByTestId("options-stats-actual").textContent ?? "").toContain("(n=8)");
    expect(screen.getByTestId("options-stats-implied").textContent ?? "").toContain("(n=8)");
  });

  it("statsLine never invents a statistic it was not sent", () => {
    expect(statsLine(null, t)).toBeNull();
    expect(statsLine({}, t)).toBeNull();
    expect(statsLine({ median_abs: 0.04, n: 3 }, t)).toBe("median 4.0% (n=3)");
    // n absent → the line prints without a fabricated count.
    expect(statsLine({ median_abs: 0.04 }, t)).toBe("median 4.0%");
  });

  it("says both columns are absolute, and why", () => {
    renderTab(payload());
    expect(document.body.textContent ?? "").toMatch(/Both columns are ABSOLUTE/);
  });

  it("an empty history reports no statistics rather than zeros", () => {
    renderTab(payload({ stats: null, comparison: null, history: [] }));
    expect(screen.getByTestId("options-stats-actual").textContent ?? "").toContain(
      "no history on file",
    );
    expect(screen.getByTestId("cmp-median").textContent ?? "").toMatch(/Unavailable/);
  });
});

/* ---------------------------------------------------------- the history */

describe("the per-event table", () => {
  it("renders one row per prior event with its own basis badge", () => {
    renderTab(payload());
    expect(screen.getByTestId("options-history-row-AAPL:EARNINGS:2026-05-02")).toBeTruthy();
    expect(
      screen.getByTestId("options-history-basis-AAPL:EARNINGS:2026-02-01").textContent,
    ).toBe("HISTORICAL APPROXIMATION");
  });

  it("folds the actual move to |x| so a fall is not ranked below a rise", () => {
    renderTab(payload());
    const row = screen.getByTestId("options-history-row-AAPL:EARNINGS:2026-02-01");
    // actual_move_pct is −0.088; the column shows the MAGNITUDE.
    expect(row.textContent ?? "").toContain("8.8%");
    expect(row.textContent ?? "").not.toContain("-8.8%");
  });

  it("a row missing its implied leg shows the reason, not a dash", () => {
    renderTab(
      payload({
        history: [
          historyRow("2026-05-02", {
            status: "NO_DATA",
            implied_move_pct: null,
            notes: ["put leg had no bars"],
          }),
        ],
      }),
    );
    const row = screen.getByTestId("options-history-row-AAPL:EARNINGS:2026-05-02");
    expect(row.textContent ?? "").toContain("put leg had no bars");
  });

  it("an empty history offers the backfill instead of a bare blank", () => {
    renderTab(payload({ history: [] }));
    expect(screen.getByTestId("options-history-empty")).toBeTruthy();
    expect(screen.getByTestId("backfill-options-history")).toBeTruthy();
  });

  it("firstNote reads the server's first non-empty note only", () => {
    expect(firstNote({ notes: ["", "second"] })).toBe("second");
    expect(firstNote({ notes: [] })).toBeNull();
    expect(firstNote(null)).toBeNull();
  });
});

/* ------------------------------------------------------------ the chart */

describe("the implied-vs-actual chart", () => {
  it("draws one pair of columns per event", () => {
    renderTab(payload());
    expect(screen.getByTestId("implied-vs-actual-chart")).toBeTruthy();
    expect(screen.getByTestId("iva-implied-AAPL:EARNINGS:2026-05-02")).toBeTruthy();
    expect(screen.getByTestId("iva-actual-AAPL:EARNINGS:2026-05-02")).toBeTruthy();
  });

  it("DRAWS NOTHING for a missing half — never a zero-height bar", () => {
    render(
      <LanguageProvider>
        <ImpliedVsActualChart
          rows={[{ key: "e1", label: "2026-05-02", implied: null, actual: 0.04 }]}
        />
      </LanguageProvider>,
    );
    expect(screen.queryByTestId("iva-implied-e1")).toBeNull();
    expect(screen.getByTestId("iva-actual-e1")).toBeTruthy();
  });

  it("always carries a legend naming both series (never colour alone)", () => {
    renderTab(payload());
    const legend = screen.getByTestId("iva-legend");
    expect(legend.textContent ?? "").toMatch(/Implied/);
    expect(legend.textContent ?? "").toMatch(/Actual/);
  });

  it("an empty row set explains itself rather than drawing an empty frame", () => {
    render(
      <LanguageProvider>
        <ImpliedVsActualChart rows={[]} />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("iva-empty").textContent ?? "").toMatch(
      /nothing to compare/,
    );
  });

  it("chartRows takes |x| on both columns and drops fully-empty events", () => {
    const rows = chartRows([
      historyRow("2026-05-02", { implied_move_pct: 0.06, actual_move_pct: -0.09 }),
      historyRow("2026-02-01", { implied_move_pct: null, actual_move_pct: null }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].implied).toBeCloseTo(0.06);
    expect(rows[0].actual).toBeCloseTo(0.09);
  });

  it("hover surfaces the same values the table already shows", async () => {
    const user = userEvent.setup();
    renderTab(payload());
    const bar = screen.getByTestId("iva-implied-AAPL:EARNINGS:2026-05-02");
    // The hit target is the full band rect, sibling to the columns.
    const group = bar.parentElement as unknown as HTMLElement;
    await user.hover(within(group).getByRole("button"));
    expect(screen.getByTestId("iva-readout").textContent ?? "").toContain("6.2%");
  });
});

/* ---------------------------------------------------------- the buttons */

describe("backfill is an explicit user action", () => {
  it("wires both buttons and says the GET never fetches", async () => {
    const user = userEvent.setup();
    const onBackfill = vi.fn();
    const onBackfillHistory = vi.fn();
    render(
      <LanguageProvider>
        <OptionsTabContent
          data={payload()}
          onBackfill={onBackfill}
          onBackfillHistory={onBackfillHistory}
        />
      </LanguageProvider>,
    );
    expect(document.body.textContent ?? "").toMatch(
      /never calls the option provider/,
    );
    await user.click(screen.getByTestId("backfill-options"));
    await user.click(screen.getByTestId("backfill-options-history"));
    expect(onBackfill).toHaveBeenCalledTimes(1);
    expect(onBackfillHistory).toHaveBeenCalledTimes(1);
  });

  it("disables each button only while ITS OWN backfill is in flight", () => {
    render(
      <LanguageProvider>
        <OptionsTabContent
          data={payload()}
          onBackfill={() => {}}
          onBackfillHistory={() => {}}
          backfilling
        />
      </LanguageProvider>,
    );
    expect(
      (screen.getByTestId("backfill-options") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("backfill-options-history") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------- as-of */

describe("the as-of gate is visible", () => {
  it("prints the as-of instant and the ticker verbatim", () => {
    renderTab(payload());
    const line = screen.getByTestId("options-as-of");
    expect(line.textContent ?? "").toContain("2026-08-19T12:00:00+00:00");
    expect(line.textContent ?? "").toContain("AAPL");
  });

  it("renders a coverage reason verbatim when the server sends one", () => {
    renderTab(payload({ coverage: { reason: "provider_lacks_option_history" } }));
    expect(screen.getByTestId("options-coverage").textContent).toBe(
      "provider_lacks_option_history",
    );
  });
});
