/**
 * Phase C §60 history-table tests.
 *
 * The rules pinned here are the ones a "tidier" implementation breaks first:
 *
 *  1. EPS surprise / revenue surprise / implied move STAY IN THE TABLE as
 *     explicit UNAVAILABLE cells carrying the server's reason. Dropping the
 *     columns reads as "these did not matter"; blanking them reads as zero.
 *  2. `intraday_30m` empty is routine (minute bars are per-event, on request)
 *     and the backfill button is its remedy — the GET fetches nothing.
 *  3. The COLUMN ORDER comes from the payload, not from a local constant.
 *  4. The 4/8/12 toggle trims the NEWEST N client-side; it never refetches
 *     and never re-orders the table backwards in time.
 *  5. Summary lines carry their sample size and keep the tally a COUNT (§64).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GLOSSARY } from "@/lib/glossary";
import { LanguageProvider } from "@/lib/i18n";
import type {
  EventHistoryPayload,
  EventHistoryRow,
  EventPriceHistoryStats,
} from "@/lib/types";
import type { EventOptionHistoryRow } from "@/lib/types-options";
import { EventHistoryTableContent } from "./EventHistoryTable";
import { HISTORY_COLUMNS_FALLBACK, cellAvailable, cellReason } from "./replay-format";

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

function renderTable(
  data: EventHistoryPayload,
  onBackfill: (last: number) => void = () => {},
  optionsHistory?: EventOptionHistoryRow[],
) {
  return render(
    <LanguageProvider>
      <EventHistoryTableContent
        data={data}
        onBackfill={onBackfill}
        optionsHistory={optionsHistory}
      />
    </LanguageProvider>,
  );
}

/* ------------------------------------------------------------- fixtures */

/** The two structural UNAVAILABLE reasons the pure layer emits verbatim. */
const CONSENSUS_REASON = "CONSENSUS DATA UNAVAILABLE";
const IMPLIED_REASON = "options intelligence not yet available (Phase I)";

function makeRow(
  date: string,
  overrides: Partial<EventHistoryRow> = {},
): EventHistoryRow {
  return {
    event_id: Number(date.replace(/-/g, "").slice(4)),
    event_key: `EARNINGS:NVDA:${date}`,
    date_et: date,
    session: "AFTER_MARKET",
    status: "CONFIRMED",
    gap: 0.068,
    ret_1d: 0.0473,
    ret_5d: 0.0388,
    abnormal_1d: 0.0402,
    intraday_30m: { available: false, reason: "no minute bars stored for this event" },
    eps_surprise: { available: false, reason: CONSENSUS_REASON },
    rev_surprise: { available: false, reason: CONSENSUS_REASON },
    implied_move: { available: false, reason: IMPLIED_REASON },
    actual_move_abs: 0.0473,
    bars_available: true,
    reasons: {},
    ...overrides,
  };
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

/** Twelve rows, OLDEST FIRST — the order `history_table` sorts them into. */
const DATES = [
  "2023-08-23",
  "2023-11-21",
  "2024-02-21",
  "2024-05-22",
  "2024-08-28",
  "2024-11-20",
  "2025-02-26",
  "2025-05-28",
  "2025-08-27",
  "2025-11-19",
  "2026-02-25",
  "2026-05-28",
];

function makePayload(overrides: Partial<EventHistoryPayload> = {}): EventHistoryPayload {
  return {
    available: true,
    event_id: 42,
    event_key: "EARNINGS:NVDA:2026-08-27",
    ticker: "NVDA",
    as_of: "2026-08-18T20:05:00+00:00",
    rows: DATES.map((d) => makeRow(d)),
    n_rows: DATES.length,
    // The server's own column order — the table must follow THIS, not a
    // constant in the component.
    columns: [
      "date_et",
      "session",
      "status",
      "eps_surprise",
      "rev_surprise",
      "implied_move",
      "actual_move_abs",
      "gap",
      "intraday_30m",
      "ret_1d",
      "ret_5d",
      "abnormal_1d",
    ],
    summary: {
      "1D": { last4: makeStats({ n: 4, n_available: 4 }), last8: makeStats(), last12: null },
      "5D": { last4: null, last8: makeStats({ horizon: "5D" }), last12: null },
    },
    provenance: { bars: "DATA", metrics: "QUANT" },
    not_backtestable: ["eps_surprise", "rev_surprise", "implied_move"],
    model_version: "c1-replay-v1",
    ...overrides,
  };
}

/* ---------------------------------------------------------------- tests */

describe("EventHistoryTable — the unavailable columns stay visible", () => {
  it("keeps EPS and revenue surprise as explicit UNAVAILABLE cells with the reason", () => {
    renderTable(makePayload());
    const eps = screen.getAllByTestId("cell-eps");
    expect(eps.length).toBeGreaterThan(0);
    expect(eps[0].textContent).toContain("UNAVAILABLE");
    // Verbatim server reason — a beginner must not read a blank as "no surprise".
    expect(eps[0].getAttribute("title")).toContain(CONSENSUS_REASON);
    expect(screen.getAllByTestId("cell-rev")[0].getAttribute("title")).toContain(
      CONSENSUS_REASON,
    );
    // and never a fabricated 0.0%
    expect(eps[0].textContent).not.toContain("0.0%");
  });

  it("keeps implied move present with its Phase-I reason, beside a real actual move", () => {
    renderTable(makePayload());
    const implied = screen.getAllByTestId("cell-implied")[0];
    expect(implied.textContent).toContain("UNAVAILABLE");
    expect(implied.getAttribute("title")).toContain(IMPLIED_REASON);
    // The computable half IS shown: |ret_1d| 0.0473 → 4.7%, unsigned.
    expect(screen.getAllByTestId("cell-actual")[0].textContent).toBe("4.7%");
  });

  it("renders every §60 column header the payload names, in the payload's order", () => {
    renderTable(makePayload());
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent ?? "");
    expect(headers.length).toBe(12);
    expect(headers[0]).toContain("Date (ET)");
    expect(headers[3]).toContain("EPS surprise");
    expect(headers[5]).toContain("Implied move");
    expect(headers[8]).toContain("+30m");
    expect(headers[11]).toContain("1D vs SPY");
  });

  it("follows a REORDERED payload column list rather than a local constant", () => {
    renderTable(
      makePayload({ columns: ["date_et", "ret_1d", "eps_surprise"], rows: [makeRow("2026-05-28")] }),
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent ?? "");
    expect(headers.length).toBe(3);
    expect(headers[1]).toContain("1D");
    expect(headers[2]).toContain("EPS surprise");
    // The fallback order is NOT what got rendered.
    expect(HISTORY_COLUMNS_FALLBACK.length).toBe(12);
  });
});

describe("EventHistoryTable — intraday column and the bounded backfill", () => {
  it("an event with no stored minute bars shows a reasoned dash, never a zero", () => {
    renderTable(makePayload());
    const cell = screen.getAllByTestId("cell-intraday")[0];
    expect(cell.textContent).toBe("—");
    expect(cell.getAttribute("title")).toContain("no minute bars stored for this event");
    expect(cell.textContent).not.toContain("0.0%");
  });

  it("an event WITH stored minute bars shows the measured +30m move", () => {
    renderTable(
      makePayload({
        rows: [
          makeRow("2026-05-28", {
            intraday_30m: {
              available: true,
              move: 0.0698,
              basis: "after_market_next_open",
              confidence: "high",
              bar_ts_utc: "2026-05-29T14:00:00+00:00",
            },
          }),
        ],
      }),
    );
    expect(screen.getByTestId("cell-intraday").textContent).toBe("+7.0%");
  });

  it("the backfill button is bounded to the last 4 and fires once per press", async () => {
    const user = userEvent.setup();
    const onBackfill = vi.fn();
    renderTable(makePayload(), onBackfill);
    await user.click(screen.getByTestId("history-backfill"));
    expect(onBackfill).toHaveBeenCalledTimes(1);
    expect(onBackfill).toHaveBeenCalledWith(4);
  });

  it("explains that loading the page fetches no minute bars at all", () => {
    renderTable(makePayload());
    expect(screen.getByText(/Loading this page fetches nothing/)).toBeTruthy();
  });
});

describe("EventHistoryTable — the 4/8/12 window toggle", () => {
  it("defaults to the last 4 and keeps the NEWEST four, chronologically ordered", () => {
    renderTable(makePayload());
    const rows = screen.getAllByTestId("history-row");
    expect(rows.length).toBe(4);
    // Newest four of the twelve, still reading forward in time.
    expect(within(rows[0]).getByText("2025-08-27")).toBeTruthy();
    expect(within(rows[3]).getByText("2026-05-28")).toBeTruthy();
  });

  it("switching to 12 widens the sample without refetching or re-sorting", async () => {
    const user = userEvent.setup();
    renderTable(makePayload());
    await user.click(screen.getByTestId("history-size-12"));
    const rows = screen.getAllByTestId("history-row");
    expect(rows.length).toBe(12);
    expect(within(rows[0]).getByText("2023-08-23")).toBeTruthy();
    expect(within(rows[11]).getByText("2026-05-28")).toBeTruthy();
    expect(screen.getByTestId("history-size-12").getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("a ticker with fewer events than the window shows all of them, not padding", async () => {
    const user = userEvent.setup();
    renderTable(makePayload({ rows: [makeRow("2026-02-25"), makeRow("2026-05-28")] }));
    await user.click(screen.getByTestId("history-size-8"));
    expect(screen.getAllByTestId("history-row").length).toBe(2);
  });

  it("no stored events reports the absence instead of an empty table", () => {
    renderTable(makePayload({ rows: [], summary: {} }));
    expect(screen.getByTestId("history-empty").textContent).toMatch(
      /No earlier comparable event is stored/,
    );
    expect(screen.queryAllByTestId("history-row").length).toBe(0);
  });
});

describe("EventHistoryTable — summary, provenance and states", () => {
  it("carries the sample size and keeps the positive tally a COUNT (§64)", () => {
    renderTable(makePayload());
    const line = screen.getByTestId("hist-stat-1D-last8");
    expect(line.textContent).toContain("median |1D| 4.2%");
    expect(line.textContent).toContain("positive 5/8");
    expect(line.textContent).toContain("based on 8 events");
    // 0.625 must never surface as a probability.
    expect(line.textContent).not.toContain("62.5%");
  });

  it("a window with fewer than 2 usable events shows a reason, not empty stats", () => {
    renderTable(makePayload());
    const line = screen.getByTestId("hist-stat-1D-last12");
    expect(line.textContent).toMatch(/Unavailable —/);
    expect(line.textContent).not.toMatch(/median/);
  });

  it("labels bars DATA and metrics QUANT from the payload's own provenance", () => {
    const { container } = renderTable(makePayload());
    expect(
      container.querySelector(".provenance.data-driven")?.textContent,
    ).toContain("DATA");
    expect(
      container.querySelector(".provenance.quant-derived")?.textContent,
    ).toContain("QUANT");
  });

  it("shows the as-of gate and names the not-backtestable columns", () => {
    renderTable(makePayload());
    expect(screen.getByTestId("history-as-of").textContent).toContain("2026-08-18");
    const nb = screen.getByTestId("history-not-backtestable");
    expect(nb.textContent).toContain("implied_move");
    expect(nb.textContent).toContain("never a probability");
  });

  it("available:false renders as an explanation, not an error state", () => {
    const { container } = renderTable({ available: false, reason: "no_ticker" });
    expect(screen.getByTestId("history-unavailable").textContent).toBe(
      "Unavailable — no_ticker",
    );
    expect(container.querySelector(".error")).toBeNull();
  });

  it("a row whose bars are missing explains each cell rather than showing zeros", () => {
    renderTable(
      makePayload({
        rows: [
          makeRow("2023-08-23", {
            gap: null,
            ret_1d: null,
            ret_5d: null,
            abnormal_1d: null,
            actual_move_abs: null,
            bars_available: false,
            reasons: {
              reaction: "bars unavailable before 2024-03-20",
              gap: "bars unavailable before 2024-03-20",
            },
          }),
        ],
      }),
    );
    const row = screen.getByTestId("history-row");
    expect(row.getAttribute("data-bars-available")).toBe("false");
    expect(screen.getByTestId("cell-gap").getAttribute("title")).toContain(
      "bars unavailable before 2024-03-20",
    );
    expect(screen.getByTestId("cell-1d").textContent).toBe("—");
    // Not one fabricated zero anywhere in the row.
    expect(row.textContent).not.toContain("0.0%");
  });
});

describe("EventHistoryTable — i18n and glossary coverage", () => {
  it("every ⓘ in the table resolves to a bilingual glossary entry", () => {
    const keys = [
      "event_history_table",
      "event_surprise_unavailable",
      "event_implied_vs_actual",
      "event_intraday_windows",
      "event_minute_bars_backfill",
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

  it("renders the Chinese side when the persisted language is zh", () => {
    store.set("lang", "zh");
    renderTable(makePayload());
    expect(screen.getByText("事件历史")).toBeTruthy();
    expect(screen.getAllByText("不可用").length).toBeGreaterThan(0);
    expect(screen.getByTestId("history-backfill").textContent).toContain(
      "回补分钟 K 线",
    );
  });
});

describe("replay-format cell helpers", () => {
  it("cellAvailable treats a missing flag as NOT available", () => {
    expect(cellAvailable({ available: true, move: 0.01 })).toBe(true);
    expect(cellAvailable({ available: false, reason: "x" })).toBe(false);
    // A cell that forgot to say it was available is not evidence that it was.
    expect(cellAvailable({ move: 0.01 })).toBe(false);
    expect(cellAvailable(null)).toBe(false);
  });

  it("cellReason returns the verbatim reason or null, never invented wording", () => {
    expect(cellReason({ available: false, reason: CONSENSUS_REASON })).toBe(
      CONSENSUS_REASON,
    );
    expect(cellReason({ available: false, reason: "" })).toBeNull();
    expect(cellReason(null)).toBeNull();
  });
});

/*
 * WIRE-FORMAT PIN (cross-unit, U3 ↔ U4).
 *
 * `build_event_history` returns `{event, as_of, available, **history_table(…),
 * ticker, benchmark, data_freshness, unavailable, max_last}` — the pure
 * layer's table spread FLAT, so `rows` / `summary` / `columns` /
 * `not_backtestable` / `provenance` sit at the TOP level. `history_table`
 * also sorts rows OLDEST FIRST and writes each unavailable cell as
 * `{available:false, reason}` with the two structural reasons spelled
 * exactly as the pure layer's constants spell them.
 */
describe("wire-format pin — the shape build_event_history really sends", () => {
  it("reads the flat-spread table and keeps the structural reasons verbatim", () => {
    const fromServer: EventHistoryPayload = {
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
      available: true,
      rows: [makeRow("2026-02-25"), makeRow("2026-05-28")],
      n_rows: 2,
      summary: { "1D": { last4: makeStats({ n: 2, n_available: 2 }) } },
      // The pure layer's own HISTORY_COLUMNS tuple, in its own order.
      columns: HISTORY_COLUMNS_FALLBACK,
      provenance: { bars: "DATA", metrics: "QUANT" },
      not_backtestable: ["eps_surprise", "rev_surprise", "implied_move"],
      model_version: "c1-replay-v1",
      ticker: "NVDA",
      benchmark: "SPY",
      data_freshness: {
        daily_bars_through: "2026-08-18",
        daily_bars: 603,
        bars_source: "alpaca",
        events_available: 2,
      },
      unavailable: [],
      max_last: 12,
    };
    renderTable(fromServer);
    // Rows and measured cells reach the table rather than falling through.
    expect(screen.getAllByTestId("history-row").length).toBe(2);
    expect(screen.getAllByTestId("cell-1d")[0].textContent).toBe("+4.7%");
    // The two structural absences keep the pure layer's exact wording.
    expect(screen.getAllByTestId("cell-eps")[0].getAttribute("title")).toBe(
      `Unavailable — ${CONSENSUS_REASON}`,
    );
    expect(screen.getAllByTestId("cell-implied")[0].getAttribute("title")).toBe(
      `Unavailable — ${IMPLIED_REASON}`,
    );
  });

  it("the local column fallback still matches the server's HISTORY_COLUMNS order", () => {
    // If the pure layer reorders §60, this is the assertion that notices —
    // the payload's copy always wins at render time, but a fallback that has
    // silently drifted would render the wrong table whenever it is used.
    expect(HISTORY_COLUMNS_FALLBACK).toEqual([
      "date_et",
      "session",
      "status",
      "eps_surprise",
      "rev_surprise",
      "implied_move",
      "actual_move_abs",
      "gap",
      "intraday_30m",
      "ret_1d",
      "ret_5d",
      "abnormal_1d",
    ]);
  });
});

/* ------------------------------------- Phase J: the options columns + chart */

/**
 * The rules pinned below are the ones a well-meaning refactor breaks:
 *
 *  1. NO PROP → NO CHANGE. Without `optionsHistory` the table is byte-for-byte
 *     the Phase C table: `implied_move` keeps its UNAVAILABLE cell, the two
 *     new columns do not exist, and the chart does not mount.
 *  2. THE JOIN IS ON IDENTITY, NEVER ON DATE. Two events can share a date;
 *     attributing one's straddle to the other is a plausible wrong number,
 *     which is worse than no number.
 *  3. A ROW WITH NO OPTIONS MATCH STAYS UNAVAILABLE. A partially covered
 *     history must not let its uncovered rows read as zeros.
 */

function makeOptionRow(
  date: string,
  overrides: Partial<EventOptionHistoryRow> = {},
): EventOptionHistoryRow {
  return {
    event_id: Number(date.replace(/-/g, "").slice(4)),
    event_key: `EARNINGS:NVDA:${date}`,
    event_date: date,
    basis: "HISTORICAL_DAILY_CLOSE_APPROXIMATION",
    status: "OK",
    implied_move_pct: 0.062,
    actual_move_pct: -0.071,
    implied_realized_ratio: 1.15,
    classification: "UNDER_PRICED",
    ...overrides,
  };
}

const OPTIONS_HISTORY = DATES.map((d) => makeOptionRow(d));

describe("EventHistoryTable — without optionsHistory nothing changes (Phase C)", () => {
  it("keeps implied_move as an UNAVAILABLE cell", () => {
    renderTable(makePayload());
    const cells = screen.getAllByTestId("cell-implied");
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(within(cell).getByText("UNAVAILABLE")).toBeTruthy();
    }
  });

  it("adds NO extra columns — an empty column is width without information", () => {
    renderTable(makePayload());
    expect(screen.queryByTestId("cell-options-actual")).toBeNull();
    expect(screen.queryByTestId("cell-options-ratio")).toBeNull();
    expect(screen.queryByText("Actual ÷ implied")).toBeNull();
  });

  it("does not mount the implied-vs-actual chart", () => {
    renderTable(makePayload());
    expect(screen.queryByTestId("history-implied-chart")).toBeNull();
  });

  it("an EMPTY options array is treated the same as none at all", () => {
    renderTable(makePayload(), () => {}, []);
    expect(screen.queryByTestId("history-implied-chart")).toBeNull();
    expect(screen.queryByTestId("cell-options-ratio")).toBeNull();
  });
});

describe("EventHistoryTable — with optionsHistory the §37 columns fill in", () => {
  it("replaces the UNAVAILABLE implied cell with the ± band, not a bare percent", () => {
    renderTable(makePayload(), () => {}, OPTIONS_HISTORY);
    const cells = screen.getAllByTestId("cell-implied");
    expect(cells[0].textContent).toBe("±6.2%");
    // No implied cell is unavailable any more — while EPS/revenue, which
    // Phase J does NOT fill, keep theirs. Filling one column must not quietly
    // clear the others.
    for (const cell of cells) expect(cell.textContent).not.toContain("UNAVAILABLE");
    expect(screen.getAllByTestId("cell-eps")[0].textContent).toContain("UNAVAILABLE");
  });

  it("appends the two new columns AFTER the server's own order, never inside it", () => {
    const { container } = renderTable(makePayload(), () => {}, OPTIONS_HISTORY);
    const headers = Array.from(container.querySelectorAll("thead th")).map(
      (th) => th.textContent?.trim(),
    );
    // The server's order is untouched up to its last column…
    expect(headers.slice(0, 12)).toEqual([
      "Date (ET)",
      "Session",
      "Status",
      "EPS surprise",
      "Rev surprise",
      "Implied move",
      "Actual |1D|",
      "Gap",
      "+30m",
      "1D",
      "5D",
      "1D vs SPY",
    ]);
    // …and the Phase J pair is appended to the end.
    expect(headers.slice(12)).toEqual(["Actual move (opt)", "Actual ÷ implied"]);
  });

  it("renders the options actual move as an ABSOLUTE magnitude", () => {
    renderTable(makePayload(), () => {}, OPTIONS_HISTORY);
    // -7.1% on the wire; the column compares against an unsigned implied move,
    // so it is folded to |x| — a signed value here would read as an undershoot.
    expect(screen.getAllByTestId("cell-options-actual")[0].textContent).toBe("7.1%");
  });

  it("renders the ratio as '1.15×' — a percent there would read as a return", () => {
    renderTable(makePayload(), () => {}, OPTIONS_HISTORY);
    expect(screen.getAllByTestId("cell-options-ratio")[0].textContent).toBe("1.15×");
  });

  it("mounts ImpliedVsActualChart beneath the table with the not-a-forecast note", () => {
    renderTable(makePayload(), () => {}, OPTIONS_HISTORY);
    const block = screen.getByTestId("history-implied-chart");
    expect(within(block).getByTestId("implied-vs-actual-chart")).toBeTruthy();
    expect(within(block).queryByTestId("iva-empty")).toBeNull();
    // The chart received real pairs, not an empty row list: one bar of each
    // series per prior event actually drew.
    expect(
      within(block).getAllByTestId(/^iva-implied-/).length,
    ).toBe(OPTIONS_HISTORY.length);
    expect(within(block).getAllByTestId(/^iva-actual-/).length).toBe(
      OPTIONS_HISTORY.length,
    );
    expect(screen.getByTestId("history-implied-note").textContent).toMatch(
      /not a forecast/i,
    );
  });

  it("puts the §37 caveat on every implied cell that prints a number", () => {
    renderTable(makePayload(), () => {}, OPTIONS_HISTORY);
    for (const cell of screen.getAllByTestId("cell-implied")) {
      expect(cell.getAttribute("title")).toMatch(/not a forecast/i);
    }
  });

  it("keeps the table inside .table-scroll so a wider table cannot overflow", () => {
    const { container } = renderTable(makePayload(), () => {}, OPTIONS_HISTORY);
    expect(container.querySelector(".table-scroll table")).toBeTruthy();
  });
});

describe("EventHistoryTable — the options join is on identity, not on date", () => {
  it("a row with NO matching options row stays UNAVAILABLE, never zero", () => {
    // Cover only the newest 3 of the 4 shown rows.
    const partial = DATES.slice(-3).map((d) => makeOptionRow(d));
    renderTable(makePayload(), () => {}, partial);
    const implied = screen.getAllByTestId("cell-implied");
    expect(implied.length).toBe(4);
    expect(within(implied[0]).getByText("UNAVAILABLE")).toBeTruthy();
    expect(implied[1].textContent).toBe("±6.2%");
    // …and its ratio cell is an em dash, not a 0.
    expect(screen.getAllByTestId("cell-options-ratio")[0].textContent).toBe("—");
  });

  it("an options row whose date COLLIDES but whose key differs does not join", () => {
    const impostor = [
      makeOptionRow(DATES[DATES.length - 1], {
        event_key: "FOMC:2026-05-28",
        event_id: 999_999,
        implied_move_pct: 0.42,
      }),
    ];
    renderTable(makePayload(), () => {}, impostor);
    for (const cell of screen.getAllByTestId("cell-implied")) {
      expect(cell.textContent).not.toContain("42.0%");
    }
  });

  it("joins by event_id when the history row carries no event_key", () => {
    const rows = [makeRow("2026-05-28", { event_key: null })];
    renderTable(makePayload({ rows, n_rows: 1 }), () => {}, [
      makeOptionRow("2026-05-28", { event_key: null, implied_move_pct: 0.081 }),
    ]);
    expect(screen.getAllByTestId("cell-implied")[0].textContent).toBe("±8.1%");
  });
});

describe("EventHistoryTable — a NO_DATA options row is a retraction, not a number", () => {
  it("does not print an implied move the server stood behind with NO_DATA", () => {
    const retracted = DATES.map((d) =>
      makeOptionRow(d, { status: "NO_DATA", implied_move_pct: 0.062 }),
    );
    renderTable(makePayload(), () => {}, retracted);
    for (const cell of screen.getAllByTestId("cell-implied")) {
      expect(within(cell).getByText("UNAVAILABLE")).toBeTruthy();
    }
  });

  it("a null actual with a real implied still renders the implied half", () => {
    const halves = DATES.map((d) =>
      makeOptionRow(d, { actual_move_pct: null, implied_realized_ratio: null }),
    );
    renderTable(makePayload(), () => {}, halves);
    expect(screen.getAllByTestId("cell-implied")[0].textContent).toBe("±6.2%");
    expect(screen.getAllByTestId("cell-options-actual")[0].textContent).toBe("—");
    expect(screen.getAllByTestId("cell-options-ratio")[0].textContent).toBe("—");
  });
});
