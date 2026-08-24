/**
 * Phase G §38-§41 Macro-tab tests.
 *
 * Each pins a rule where a plausible-looking macro screen lies:
 *
 *  1. THE CONSENSUS MARKER IS ALWAYS ON SCREEN, AND IS NEVER A NUMBER. This
 *     platform subscribes to no estimate provider. Every other macro screen a
 *     trader has used puts a consensus beside the actual, so an empty cell
 *     would be read as "there wasn't one" or filled in from memory. There must
 *     be no payload — not even one that carries a stray numeric `consensus` —
 *     that puts a figure in that column.
 *  2. THE UNIT COMES FROM THE VALUE, NEVER FROM THE ROLE. "headline" is a
 *     percent for CPI and a level in thousands for payrolls; a formatter that
 *     switched on the role name would print "147.0%" for a 147k payrolls
 *     print.
 *  3. ZERO IS A FINDING, ABSENT IS A NULL. CPI printing 0.0% MoM is news; a
 *     series with no stored observation is not the same thing, and the two
 *     must not render identically.
 *  4. A DERIVED RELEASE TIME MUST NOT READ AS A SCHEDULED ONE (§7). BLS
 *     observations carry no timestamps, so an ESTIMATED basis is badged.
 *  5. NOTHING IS RECOMPUTED (§61). The trend `direction` is the server's word,
 *     printed as sent; the UI never re-derives it from the prints.
 *  6. A PROXY IS BADGED. IEF is not the 10-year yield and GLD is not gold; a
 *     reader who takes the proxy for the thing was misled by an omission.
 *  7. AN UNMEASURABLE ASSET IS NAMED, NOT DROPPED. A shorter table reads as a
 *     complete one.
 *  8. YIELDS STAY IN BASIS POINTS AND OFF THE PERCENT CHART. Two units on one
 *     axis is the dual-axis anti-pattern wearing a table for a disguise.
 *  9. A MISSING HORIZON DRAWS NO BAR. A zero-height column at the baseline
 *     reads as "it did not move", the opposite of "we do not know".
 * 10. THE RENDERER READS DEFENSIVELY. The packet is assembled from four
 *     independent government sources and any of them can be absent; an empty
 *     or partial payload must still render.
 * 11. THE MACRO CONTEXT CARD IS SILENT WHEN EMPTY. Most weeks hold no CPI, and
 *     a permanent "no macro events" panel is a fixture the eye learns to skip.
 * 12. THE TAB IS SCOPED TO RELEASE TYPES. `isMacroEventType` is a closed list,
 *     not "has no ticker" — FOMC and MARKET_HOLIDAY are tickerless too and
 *     have no BLS release packet behind them.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type {
  EventMacroPayload,
  MacroContextSection,
} from "@/lib/types-macro";
import { isMacroEventType } from "@/lib/types-macro";
import MacroContextCard from "../MacroContextCard";
import MacroReactionChart, { type MacroReactionRow } from "../MacroReactionChart";
import { MacroTabContent } from "../MacroTab";
import { REACTION_HORIZONS, YIELD_TENORS, assetRoleLabel, consensusText, coverageNotes, directionText, fmtActual, fmtBp, fmtReturnPct, hasPacket, horizonReturn, isProxy, orderedAssets, orderedRoles, stampDay, stampMinute, trendSeriesIds } from "../macro-format";

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
 * Keys spelled exactly as the SERVER emits them — verified against a live
 * `GET /api/events/{id}/macro` response, not transcribed from prose. The
 * distinction matters: this fixture is the only thing standing between a
 * renamed field and a tab that renders "—" in production while every test
 * here stays green. Load-bearing spellings:
 * `packet.previous_release.actual.<role>` (with `release_time_basis` on the
 * RELEASE, not the packet), `packet.recent_trend.<series_id>:<role>`,
 * `previous_release_reaction.assets.<SYMBOL>.returns.1D` (uppercase),
 * `previous_release_reaction.yields["2 Yr"].change_bp` (an object, and the
 * Treasury's own column spelling), `related_evidence.events[]`, and
 * `consensus` / `surprise` as bare STRINGS.
 */
function makePayload(overrides: Partial<EventMacroPayload> = {}): EventMacroPayload {
  return {
    event_id: 77,
    event_key: "CPI:2026-09-11",
    event_type: "CPI",
    as_of: "2026-09-01T13:00:00+00:00",
    packet: {
      previous_release: {
        period: "2026-07",
        release_at: "2026-08-12T12:30:00+00:00",
        actual: {
          headline: {
            series_id: "CUSR0000SA0",
            label: "CPI-U all items (SA)",
            value: 0.3,
            unit: "%",
            transform: "mom_pct",
            period: "2026-07",
            seasonally_adjusted: true,
          },
          core: {
            series_id: "CUSR0000SA0L1E",
            label: "CPI-U less food and energy (SA)",
            value: 0.2,
            unit: "%",
            transform: "mom_pct",
            period: "2026-07",
            seasonally_adjusted: true,
          },
        },
        consensus: "CONSENSUS DATA UNAVAILABLE",
        surprise: "SURPRISE UNAVAILABLE",
        release_time_basis: "SCHEDULED",
      },
      current_release: {
        period: "2026-08",
        release_at: "2026-09-11T12:30:00+00:00",
        consensus: "CONSENSUS DATA UNAVAILABLE",
        release_time_basis: "SCHEDULED",
      },
      recent_trend: {
        "CUSR0000SA0:headline": {
          label: "CPI-U all items (SA)",
          transform: "mom_pct",
          unit: "%",
          direction: "falling",
          prints: [
            { period: "2026-05", value: 0.5, prior: 0.4, release_at: "2026-06-10T12:30:00+00:00" },
            { period: "2026-06", value: 0.4, prior: 0.5, release_at: "2026-07-14T12:30:00+00:00" },
            { period: "2026-07", value: 0.3, prior: 0.4, release_at: "2026-08-12T12:30:00+00:00" },
          ],
        },
      },
      coverage: { notes: ["BEA series unavailable: no API key configured."] },
    },
    previous_release_reaction: {
      event_at_utc: "2026-08-12T12:30:00+00:00",
      horizons: ["1D", "5D"],
      assets: {
        SPY: {
          symbol: "SPY",
          role: "equity",
          is_proxy: false,
          returns: { "1D": 0.0102, "5D": 0.0185 },
          returns_unit: "fraction",
          react_date: "2026-08-12",
        },
        IEF: {
          symbol: "IEF",
          role: "10y_proxy",
          is_proxy: true,
          returns: { "1D": -0.0043, "5D": -0.0061 },
          returns_unit: "fraction",
          react_date: "2026-08-12",
        },
        GLD: {
          symbol: "GLD",
          role: "gold_proxy",
          is_proxy: true,
          returns: { "1D": 0.0, "5D": null },
          returns_unit: "fraction",
          react_date: "2026-08-12",
        },
      },
      yields: {
        "2 Yr": { tenor: "2 Yr", change_bp: 7.5, change_unit: "basis_points" },
        "10 Yr": { tenor: "10 Yr", change_bp: -2.25, change_unit: "basis_points" },
      },
      unavailable: [{ symbol: "USO", reason: "no stored bars in window" }],
    },
    related_evidence: {
      available: true,
      window_start: "2026-08-12T12:30:00+00:00",
      window_end: "2026-09-01T13:00:00+00:00",
      events: [
        {
          event_id: 91,
          event_type: "PPI",
          title: "PPI — July 2026",
          scheduled_at: "2026-08-14T12:30:00+00:00",
          is_macro: true,
        },
      ],
    },
    disclaimer: "No consensus source is subscribed; consensus and surprise are unavailable.",
    coverage: { available: true },
    ...overrides,
  };
}

function renderMacro(
  data: EventMacroPayload | null | undefined,
  props: { onBackfill?: () => void; backfilling?: boolean } = {},
) {
  return render(
    <LanguageProvider>
      <MacroTabContent data={data} {...props} />
    </LanguageProvider>,
  );
}

function renderCard(section: MacroContextSection | null | undefined) {
  return render(
    <LanguageProvider>
      <MacroContextCard section={section} />
    </LanguageProvider>,
  );
}

/* ------------------------------------------- 1. no fabricated consensus */

describe("MacroTab — the consensus is never a number", () => {
  it("renders the unavailable marker beside every actual, and no estimate", () => {
    renderMacro(makePayload());
    for (const role of ["headline", "core"]) {
      const cell = screen.getByTestId(`macro-consensus-${role}`);
      expect(cell.textContent).toBe("CONSENSUS DATA UNAVAILABLE");
    }
    expect(screen.getByTestId("macro-current-consensus").textContent).toBe(
      "CONSENSUS DATA UNAVAILABLE",
    );
    expect(screen.getByTestId("macro-surprise-headline").textContent).toBe(
      "SURPRISE UNAVAILABLE",
    );
  });

  it("states the disclaimer verbatim, above the first number", () => {
    renderMacro(makePayload());
    const banner = screen.getByTestId("macro-disclaimer");
    expect(banner.textContent).toContain(
      "No consensus source is subscribed; consensus and surprise are unavailable.",
    );
  });

  it("falls back to the loud marker when the server sends no consensus block", () => {
    const data = makePayload();
    data.packet!.previous_release!.consensus = null;
    renderMacro(data);
    expect(screen.getByTestId("macro-consensus-headline").textContent).toBe(
      "CONSENSUS DATA UNAVAILABLE",
    );
  });

  /**
   * The load-bearing one. A numeric `consensus` is not a shape the server
   * sends — the point of the test is that even if some future payload leaked
   * one, the formatter has no branch that would print it.
   */
  it("cannot print a numeric consensus even when one is present in the payload", () => {
    const t = (en: string) => en;
    expect(consensusText({ value: 0.25 } as never, t)).toBe("CONSENSUS DATA UNAVAILABLE");
    expect(consensusText({ status: "CONSENSUS_DATA_UNAVAILABLE", value: 0.25 } as never, t)).toBe(
      "CONSENSUS DATA UNAVAILABLE",
    );

    const data = makePayload();
    (data.packet!.previous_release!.consensus as Record<string, unknown>) = {
      status: "CONSENSUS_DATA_UNAVAILABLE",
      value: 0.25,
    };
    renderMacro(data);
    expect(screen.getByTestId("macro-consensus-headline").textContent).not.toContain("0.25");
  });
});

/* ------------------------------------------------ 2/3. units and zeroes */

describe("MacroTab — the unit comes from the value, never the role", () => {
  it("formats a MoM percent and a payrolls change in thousands under the same role", () => {
    expect(
      fmtActual({ value: 0.3, transform: "mom_pct", unit: "%" }),
    ).toBe("+0.3%");
    // Same role name ("headline"), completely different unit.
    expect(
      fmtActual({ value: 147, transform: "change_k", unit: "k" }),
    ).toBe("+147k");
    // A RATE takes no forced sign — "+4.1%" would read as a change.
    expect(fmtActual({ value: 4.1, transform: "level", unit: "%" })).toBe("4.1%");
  });

  it("renders a payrolls packet with its own unit, not CPI's", () => {
    const data = makePayload({
      event_type: "EMPLOYMENT_REPORT",
      packet: {
        previous_release: {
          period: "2026-07",
          release_at: "2026-08-07T12:30:00+00:00",
          actual: {
            headline: {
              series_id: "CES0000000001",
              label: "Total nonfarm payrolls",
              value: 147,
              unit: "k",
              transform: "change_k",
            },
            rate: {
              series_id: "LNS14000000",
              label: "Unemployment rate",
              value: 4.1,
              unit: "%",
              transform: "level",
            },
          },
          consensus: { status: "CONSENSUS_DATA_UNAVAILABLE" },
          surprise: { status: "UNAVAILABLE" },
        },
        release_time_basis: "SCHEDULED",
      },
    });
    renderMacro(data);
    expect(screen.getByTestId("macro-actual-value-headline").textContent).toBe("+147k");
    expect(screen.getByTestId("macro-actual-value-rate").textContent).toBe("4.1%");
  });

  /* Rule 3. */
  it("keeps a 0.0% print on screen and distinguishes it from an absent one", () => {
    expect(fmtActual({ value: 0, transform: "mom_pct", unit: "%" })).toBe("0.0%");
    expect(fmtActual({ value: null, transform: "mom_pct", unit: "%" })).toBeNull();
    expect(fmtActual(null)).toBeNull();
    // 0 is a return; absent is not.
    expect(fmtReturnPct(0)).toBe("0.00%");
    expect(fmtReturnPct(null)).toBeNull();
    expect(fmtBp(0)).toBe("0.0 bp");
    expect(fmtBp(undefined)).toBeNull();
  });

  it("renders a flat CPI print as 0.0%, not as a dash", () => {
    const data = makePayload();
    data.packet!.previous_release!.actual!.headline.value = 0;
    renderMacro(data);
    expect(screen.getByTestId("macro-actual-value-headline").textContent).toBe("0.0%");
  });

  it("badges a non-seasonally-adjusted series", () => {
    const data = makePayload();
    data.packet!.previous_release!.actual!.headline.seasonally_adjusted = false;
    renderMacro(data);
    expect(screen.getByTestId("macro-nsa-headline").textContent).toBe("NSA");
    // The SA series carries no badge.
    expect(screen.queryByTestId("macro-nsa-core")).toBeNull();
  });
});

/* -------------------------------------------------- 4. the §7 date rule */

describe("MacroTab — a derived release time never reads as a scheduled one", () => {
  it("badges an ESTIMATED basis on both releases", () => {
    const data = makePayload();
    // Per RELEASE, matching the wire: the packet carries no basis of its own.
    data.packet!.previous_release!.release_time_basis = "ESTIMATED";
    data.packet!.current_release!.release_time_basis = "ESTIMATED";
    renderMacro(data);
    expect(screen.getByTestId("macro-previous-release-at-estimated").textContent).toBe(
      "ESTIMATED",
    );
    expect(screen.getByTestId("macro-current-release-at-estimated").textContent).toBe(
      "ESTIMATED",
    );
  });

  it("leaves a SCHEDULED basis unbadged", () => {
    renderMacro(makePayload());
    expect(screen.queryByTestId("macro-previous-release-at-estimated")).toBeNull();
    expect(screen.queryByTestId("macro-current-release-at-estimated")).toBeNull();
    expect(screen.getByTestId("macro-previous-release-at").textContent).toContain(
      "2026-08-12 12:30 UTC",
    );
  });
});

/* --------------------------------------------------- 5. nothing derived */

describe("MacroTab — the trend direction is the server's word", () => {
  it("prints the direction it was sent, even against the prints' own slope", () => {
    const data = makePayload();
    // Prints RISE; the server says "falling". The UI must not correct it —
    // it does not own the slope rule, and silently disagreeing is worse.
    data.packet!.recent_trend!["CUSR0000SA0:headline"]!.prints = [
      { period: "2026-05", value: 0.1 },
      { period: "2026-06", value: 0.3 },
      { period: "2026-07", value: 0.6 },
    ];
    renderMacro(data);
    expect(screen.getByTestId("macro-direction-CUSR0000SA0:headline").textContent).toContain("falling");
  });

  it("renders an unknown direction token as itself rather than dropping it", () => {
    const t = (en: string) => en;
    expect(directionText("accelerating", t)).toEqual({ text: "accelerating", glyph: "·" });
    expect(directionText(null, t)).toBeNull();
  });

  it("renders every stored print with its prior, in payload order", () => {
    renderMacro(makePayload());
    const rows = within(screen.getByTestId("macro-trend-table-CUSR0000SA0:headline")).getAllByTestId(
      "macro-trend-row",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("2026-05");
    expect(rows[2].textContent).toContain("2026-07");
    // The value wears the series' unit, and so does the prior.
    expect(rows[2].textContent).toContain("+0.3%");
    expect(rows[2].textContent).toContain("+0.4%");
  });
});

/* ------------------------------------------------ 6/7/8. the §39 reaction */

describe("MacroTab — the reaction table", () => {
  it("badges every proxy and leaves the true exposures unbadged", () => {
    renderMacro(makePayload());
    expect(screen.getByTestId("macro-proxy-IEF").textContent).toBe("PROXY");
    expect(screen.getByTestId("macro-proxy-GLD").textContent).toBe("PROXY");
    // SPY is the equity exposure itself, not a stand-in for one.
    expect(screen.queryByTestId("macro-proxy-SPY")).toBeNull();
  });

  it("names the assets it could not measure instead of shortening the table", () => {
    renderMacro(makePayload());
    const block = screen.getByTestId("macro-reaction-unavailable");
    expect(block.textContent).toContain("USO");
    // Verbatim server reason.
    expect(block.textContent).toContain("no stored bars in window");
  });

  it("renders returns as signed percents and yields as basis points", () => {
    renderMacro(makePayload());
    expect(screen.getByTestId("macro-return-SPY-1D").textContent).toBe("+1.02%");
    expect(screen.getByTestId("macro-return-IEF-1D").textContent).toBe("-0.43%");
    // Rule 8 — bp, on their own tiles, never rescaled into the chart's percent.
    expect(screen.getByTestId("macro-yield-2 Yr").textContent).toContain("+7.5 bp");
    // Rounded to a tenth of a bp — the precision a daily curve supports.
    expect(screen.getByTestId("macro-yield-10 Yr").textContent).toContain("-2.3 bp");
  });

  it("renders a 0.00% move and a missing horizon differently", () => {
    renderMacro(makePayload());
    // GLD 1d is exactly zero — a finding.
    expect(screen.getByTestId("macro-return-GLD-1D").textContent).toBe("0.00%");
    // GLD 5d is null — not a zero.
    expect(screen.getByTestId("macro-return-GLD-5D").textContent).toBe("—");
  });

  it("orders assets by the fixed risk→rates→real sequence, not payload order", () => {
    const rows = orderedAssets({
      USO: { role: "oil_proxy" },
      SPY: { role: "equity" },
      IEF: { role: "10y_proxy" },
      SHY: { role: "2y_proxy" },
    });
    expect(rows).toEqual(["SPY", "SHY", "IEF", "USO"]);
  });

  it("keeps an unknown symbol rather than dropping it from the table", () => {
    expect(orderedAssets({ ZZZ: { role: "mystery" }, SPY: { role: "equity" } })).toEqual([
      "SPY",
      "ZZZ",
    ]);
  });
});

/* -------------------------------------------------- 9. the chart's marks */

describe("MacroReactionChart — a missing horizon draws nothing", () => {
  const rows: MacroReactionRow[] = [
    { key: "SPY", label: "SPY", d1: 0.01, d5: 0.018 },
    { key: "IEF", label: "IEF", d1: -0.004, d5: null, proxy: true },
  ];

  function renderChart(r: MacroReactionRow[]) {
    return render(
      <LanguageProvider>
        <MacroReactionChart rows={r} />
      </LanguageProvider>,
    );
  }

  it("draws a bar per present horizon and none for an absent one", () => {
    renderChart(rows);
    expect(screen.getByTestId("mrc-d1-SPY")).toBeTruthy();
    expect(screen.getByTestId("mrc-d5-SPY")).toBeTruthy();
    expect(screen.getByTestId("mrc-d1-IEF")).toBeTruthy();
    // Rule 9 — no zero-height column standing in for "we do not know".
    expect(screen.queryByTestId("mrc-d5-IEF")).toBeNull();
  });

  it("draws a measured 0.00% as a baseline hairline, not as nothing", () => {
    // The mirror of rule 9. An absent horizon draws NO element; a measured
    // zero draws a flat mark on the baseline. If both drew nothing, "it did
    // not move" and "we could not measure it" would be pixel-identical.
    renderChart([{ key: "GLD", label: "GLD", d1: 0, d5: null, proxy: true }]);
    const zeroBar = screen.getByTestId("mrc-d1-GLD");
    expect(zeroBar.getAttribute("d")).not.toBe("");
    expect(screen.queryByTestId("mrc-d5-GLD")).toBeNull();
  });

  it("draws the zero baseline the polarity is read against", () => {
    renderChart(rows);
    const zero = screen.getByTestId("mrc-zero-line");
    // Full weight, distinct from the recessive hairline grid.
    expect(zero.getAttribute("stroke-width")).toBe("2");
  });

  it("puts a negative bar below the zero line and a positive one above", () => {
    renderChart(rows);
    const zeroY = Number(screen.getByTestId("mrc-zero-line").getAttribute("y1"));
    // The path's first vertical coordinate tells us which side it occupies.
    const up = screen.getByTestId("mrc-d1-SPY").getAttribute("d") ?? "";
    const down = screen.getByTestId("mrc-d1-IEF").getAttribute("d") ?? "";
    const firstY = (d: string) => Number(d.split(/[ ,]/)[1]);
    // A rise starts at the baseline and climbs ABOVE it (smaller y).
    expect(firstY(up)).toBeCloseTo(zeroY, 0);
    // A fall starts AT the baseline and descends below it.
    expect(firstY(down)).toBeCloseTo(zeroY, 0);
    // The falling bar's path reaches below zero; the rising one does not.
    const maxY = (d: string) =>
      Math.max(...d.split(/[^0-9.]+/).filter(Boolean).map(Number));
    expect(maxY(down)).toBeGreaterThan(zeroY);
  });

  it("states the empty case rather than drawing an axis with no marks", () => {
    renderChart([{ key: "SPY", label: "SPY", d1: null, d5: null }]);
    expect(screen.getByTestId("mrc-empty")).toBeTruthy();
    expect(screen.queryByTestId("mrc-zero-line")).toBeNull();
  });

  it("labels both horizons in the legend — identity is never colour alone", () => {
    renderChart(rows);
    const legend = screen.getByTestId("mrc-legend");
    expect(legend.textContent).toContain("1 day after");
    expect(legend.textContent).toContain("5 days after");
  });

  it("surfaces the same numbers on focus that the table already prints", async () => {
    const user = userEvent.setup();
    renderChart(rows);
    const targets = screen.getAllByRole("button");
    await user.click(targets[0]);
    targets[0].focus();
    expect(screen.getByTestId("mrc-readout").textContent).toContain("SPY");
  });
});

/* ------------------------------------------------ 10. defensive reading */

describe("MacroTab — reads defensively", () => {
  it("renders an entirely empty payload without throwing", () => {
    renderMacro({});
    expect(screen.getByTestId("macro-panel")).toBeTruthy();
    expect(screen.getByTestId("macro-empty")).toBeTruthy();
    // The consensus rule survives an empty packet.
    expect(screen.getByTestId("macro-disclaimer")).toBeTruthy();
  });

  it("renders null/undefined data without throwing", () => {
    renderMacro(null);
    expect(screen.getByTestId("macro-panel")).toBeTruthy();
    cleanup();
    renderMacro(undefined);
    expect(screen.getByTestId("macro-panel")).toBeTruthy();
  });

  it("states each absent section as a state with a reason, not a blank", () => {
    renderMacro({ event_id: 1 });
    expect(screen.getByTestId("macro-previous-none")).toBeTruthy();
    expect(screen.getByTestId("macro-current-none")).toBeTruthy();
    expect(screen.getByTestId("macro-trend-none")).toBeTruthy();
    expect(screen.getByTestId("macro-reaction-none")).toBeTruthy();
    expect(screen.getByTestId("macro-related-empty")).toBeTruthy();
  });

  it("renders a release whose actuals block is empty", () => {
    const data = makePayload();
    data.packet!.previous_release!.actual = {};
    renderMacro(data);
    expect(screen.getByTestId("macro-previous-no-actuals")).toBeTruthy();
  });

  it("prints coverage notes verbatim", () => {
    const data = makePayload({ coverage: { notes: ["Treasury CSV missing for 2026."] } });
    renderMacro(data);
    expect(screen.getByTestId("macro-coverage").textContent).toContain(
      "Treasury CSV missing for 2026.",
    );
  });

  it("keeps an unknown role in the actuals table instead of dropping it", () => {
    const data = makePayload();
    data.packet!.previous_release!.actual!.supercore = {
      series_id: "X",
      label: "Supercore",
      value: 0.25,
      unit: "%",
      transform: "mom_pct",
    };
    renderMacro(data);
    // Known roles first, unknown appended — never omitted.
    expect(orderedRoles(data.packet!.previous_release!.actual)).toEqual([
      "headline",
      "core",
      "supercore",
    ]);
    expect(screen.getByTestId("macro-actual-supercore")).toBeTruthy();
  });

  it("lists the §40 related window and its items", () => {
    renderMacro(makePayload());
    expect(screen.getByTestId("macro-related-window").textContent).toContain("2026-08-12");
    const items = screen.getAllByTestId("macro-related-item");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("PPI — July 2026");
  });
});

/* ------------------------------------------------------ the backfill seam */

describe("MacroTab — backfill is the only control that spends anything", () => {
  it("fires the backfill callback and disables while pending", async () => {
    const user = userEvent.setup();
    const onBackfill = vi.fn();
    const { rerender } = renderMacro(makePayload(), { onBackfill });
    await user.click(screen.getByTestId("macro-backfill"));
    expect(onBackfill).toHaveBeenCalledTimes(1);

    rerender(
      <LanguageProvider>
        <MacroTabContent data={makePayload()} onBackfill={onBackfill} backfilling />
      </LanguageProvider>,
    );
    expect((screen.getByTestId("macro-backfill") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("omits the button entirely when no handler is supplied", () => {
    renderMacro(makePayload());
    expect(screen.queryByTestId("macro-backfill")).toBeNull();
  });
});

/* -------------------------------------------- 11. the §46 context card */

describe("MacroContextCard", () => {
  const section: MacroContextSection = {
    tier: "DATA",
    horizon_days: 14,
    upcoming: [
      {
        event_id: 77,
        event_key: "CPI:2026-09-11",
        event_type: "CPI",
        title: "CPI — August 2026",
        scheduled_at: "2026-09-11T12:30:00+00:00",
        days_to: 2,
        importance: 0.9,
        is_estimated: false,
      },
      {
        event_id: 78,
        event_key: "EMPLOYMENT_REPORT:2026-09-04",
        event_type: "EMPLOYMENT_REPORT",
        title: "Employment Situation — August 2026",
        scheduled_at: "2026-09-04T12:30:00+00:00",
        days_to: 0,
        importance: 0.95,
        is_estimated: true,
      },
    ],
  };

  it("lists each upcoming release with the server's own days_to", () => {
    renderCard(section);
    const items = screen.getAllByTestId("macro-context-item");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("CPI — August 2026");
    expect(screen.getByTestId("macro-context-days-0").textContent).toBe("in 2d");
    // 0 renders as "today", never as "in 0d" and never as absent.
    expect(screen.getByTestId("macro-context-days-1").textContent).toBe("today");
  });

  /**
   * Pins the DATE, not merely the row.
   *
   * The card read `scheduled_at_utc` while `macro_context` sends
   * `scheduled_at` — the EventRow API's spelling leaking into a section that
   * does not use it. Every existing assertion here passed throughout, because
   * they checked the title, the T-minus chip and the ESTIMATED badge, none of
   * which come from that field: the date silently rendered "—" on every card.
   * An absent date is indistinguishable from a date the server could not
   * supply, which is the confusion the "—" is reserved for.
   */
  it("renders the release date from the server's `scheduled_at`", () => {
    renderCard(section);
    // Asserted on the date element itself: the title legitimately contains an
    // em dash ("CPI — August 2026"), so a whole-row check cannot tell a
    // rendered date from the "—" placeholder.
    expect(screen.getByTestId("macro-context-when-0").textContent).toBe("2026-09-11");
    expect(screen.getByTestId("macro-context-when-1").textContent).toBe("2026-09-04");
  });

  it("carries §7 through: an estimated macro date is badged here too", () => {
    renderCard(section);
    expect(screen.getByTestId("macro-context-estimated-1").textContent).toBe("ESTIMATED");
    expect(screen.queryByTestId("macro-context-estimated-0")).toBeNull();
  });

  /* Rule 11 — the load-bearing behaviour of this component. */
  it("renders nothing at all when the horizon is empty", () => {
    const { container } = renderCard({ tier: "DATA", horizon_days: 14, upcoming: [] });
    expect(container.innerHTML).toBe("");
    expect(screen.queryByTestId("macro-context-card")).toBeNull();
  });

  it("renders nothing for an absent or unavailable section", () => {
    const { container } = renderCard(null);
    expect(container.innerHTML).toBe("");
    cleanup();
    const second = renderCard({ available: false, reason: "no calendar provider configured" });
    expect(second.container.innerHTML).toBe("");
  });

  it("links only to events that have an id", () => {
    renderCard({
      upcoming: [
        { event_id: 5, event_type: "CPI", title: "CPI", scheduled_at: "2026-09-11T12:30:00Z" },
        { event_type: "PPI", title: "PPI", scheduled_at: "2026-09-12T12:30:00Z" },
      ],
    });
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/catalysts/5");
  });

  it("never paints a registry listing with the LLM chip", () => {
    renderCard({ ...section, tier: "LLM" });
    // An unrecognised/wrong tier is narrowed to DATA — a scheduled fact must
    // not be labelled as generated.
    expect(screen.getByTestId("tier-chip-DATA")).toBeTruthy();
    expect(screen.queryByTestId("tier-chip-LLM")).toBeNull();
  });
});

/* ------------------------------------------------ 12. the type gate */

describe("isMacroEventType — a closed list, not 'has no ticker'", () => {
  it("accepts the release types that have a packet behind them", () => {
    for (const type of ["CPI", "PPI", "PCE", "GDP", "EMPLOYMENT_REPORT", "JOLTS"]) {
      expect(isMacroEventType(type)).toBe(true);
    }
  });

  it("rejects tickerless events that are not data releases", () => {
    // Both have no ticker; neither has a BLS/BEA release packet.
    expect(isMacroEventType("FOMC_DECISION")).toBe(false);
    expect(isMacroEventType("MARKET_HOLIDAY")).toBe(false);
    expect(isMacroEventType("FED_SPEECH")).toBe(false);
    expect(isMacroEventType("EARNINGS")).toBe(false);
  });

  it("rejects empty and absent types", () => {
    expect(isMacroEventType(null)).toBe(false);
    expect(isMacroEventType(undefined)).toBe(false);
    expect(isMacroEventType("")).toBe(false);
  });
});

/* --------------------------------------------------- format-module units */

describe("macro-format helpers", () => {
  it("returns null rather than a dash for every absent value", () => {
    expect(stampMinute(null)).toBeNull();
    expect(stampMinute("")).toBeNull();
    expect(stampDay(undefined)).toBeNull();
    expect(fmtReturnPct(Number.NaN)).toBeNull();
    expect(fmtBp(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("passes an unparseable stamp through rather than inventing a date", () => {
    expect(stampMinute("not-a-date")).toBe("not-a-date");
  });

  it("identifies proxies by their role suffix", () => {
    expect(isProxy("10y_proxy")).toBe(true);
    expect(isProxy("equity")).toBe(false);
    expect(isProxy(null)).toBe(false);
  });

  it("reads a horizon return, treating 0 as present and absent as null", () => {
    expect(horizonReturn({ returns: { "1d": 0 } }, "1d")).toBe(0);
    expect(horizonReturn({ returns: { "1d": null } }, "1d")).toBeNull();
    expect(horizonReturn({}, "1d")).toBeNull();
    expect(horizonReturn(null, "1d")).toBeNull();
  });

  it("flattens the several shapes a coverage block arrives in", () => {
    expect(coverageNotes(null)).toEqual([]);
    expect(coverageNotes("one note")).toEqual(["one note"]);
    expect(coverageNotes(["a", "b"])).toEqual(["a", "b"]);
    expect(coverageNotes({ notes: ["a"], reason: "b" })).toEqual(["a", "b"]);
  });

  it("detects an empty packet", () => {
    expect(hasPacket(null)).toBe(false);
    expect(hasPacket({})).toBe(false);
    expect(hasPacket({ packet: {} })).toBe(false);
    expect(hasPacket({ packet: { previous_release: { period: "2026-07" } } })).toBe(true);
  });

  it("sorts trend series ids for a stable render", () => {
    expect(trendSeriesIds({ B: {}, A: {} })).toEqual(["A", "B"]);
    expect(trendSeriesIds(null)).toEqual([]);
  });
});

/* ------------------------------------------- N. the wire contract itself */

/**
 * The keys above are a TRANSCRIPTION of the server's payload, and a
 * transcription can drift. Every other test in this file feeds the component
 * `makePayload()`, so a fixture that renamed a field in step with the reader
 * would keep all of them green while the real endpoint rendered "—".
 *
 * These tests assert against the SPELLINGS the server actually emits,
 * verified against a live `GET /api/events/{id}/macro`. They are deliberately
 * about names rather than rendering: if the backend renames a field, this is
 * the test that says so, and it says which one.
 *
 * The bugs this pins were all real, all shipped, and all invisible to the 52
 * tests above: `previous_reaction` (server: `previous_release_reaction`),
 * lowercase `1d`/`5d` return keys (server: `1D`/`5D`), `2y_bp` yield keys
 * (server: the Treasury's own `"2 Yr"`, holding an OBJECT rather than a
 * number), a packet-level `release_time_basis` (server: one per release),
 * `related_evidence.items` (server: `.events`), and `first_reaction_date`
 * (server: `react_date`).
 */
describe("MacroTab — the payload keys are the server's, not ours", () => {
  it("reads the reaction from `previous_release_reaction`", () => {
    const data = makePayload();
    // Present under the server's key: the table renders.
    renderMacro(data);
    expect(screen.getByTestId("macro-return-SPY-1D").textContent).toBe("+1.02%");
    cleanup();

    // Under the OLD key the section must go absent, not silently empty-render
    // with the same chrome — proving the reader is bound to the server's name.
    const wrong = makePayload();
    (wrong as Record<string, unknown>).previous_release_reaction = undefined;
    (wrong as Record<string, unknown>).previous_reaction = data.previous_release_reaction;
    renderMacro(wrong);
    expect(screen.queryByTestId("macro-return-SPY-1D")).toBeNull();
  });

  it("reads horizons as the server's uppercase 1D/5D", () => {
    expect(REACTION_HORIZONS).toEqual(["1D", "5D"]);
    expect(horizonReturn({ returns: { "1D": 0.5 } }, "1D")).toBe(0.5);
    // The lowercase spelling is a different key and must not resolve.
    expect(horizonReturn({ returns: { "1D": 0.5 } }, "1d")).toBeNull();
  });

  it("reads yields by the Treasury's own tenor spelling, off `change_bp`", () => {
    expect(YIELD_TENORS.map((y) => y.key)).toEqual(["2 Yr", "10 Yr"]);
    renderMacro(makePayload());
    expect(screen.getByTestId("macro-yield-2 Yr").textContent).toContain("+7.5 bp");
  });

  it("reads the release basis off each release, not off the packet", () => {
    const data = makePayload();
    // Set ONLY on the previous release: the current one must stay unbadged.
    data.packet!.previous_release!.release_time_basis = "ESTIMATED";
    renderMacro(data);
    expect(screen.getByTestId("macro-previous-release-at-estimated").textContent).toBe(
      "ESTIMATED",
    );
    expect(screen.queryByTestId("macro-current-release-at-estimated")).toBeNull();
  });

  it("reads related evidence from `events` with flat window bounds", () => {
    renderMacro(makePayload());
    expect(screen.getAllByTestId("macro-related-item")).toHaveLength(1);
    expect(screen.getByTestId("macro-related-window").textContent).toContain("2026-08-12");
    expect(screen.getByTestId("macro-related-window").textContent).toContain("2026-09-01");
  });

  it("reads the backfill counts from `counts`, by source", () => {
    // The server reports {counts: {observations, yield_curves, bars}} — a flat
    // `stored_observations` would read as zero and call a real backfill empty.
    const result = { counts: { observations: 36, yield_curves: 2, bars: 160 } };
    const counts = result.counts ?? {};
    expect((counts.observations ?? 0) + (counts.yield_curves ?? 0) + (counts.bars ?? 0)).toBe(198);
  });
});

/**
 * A macro release has no issuer, so the INDEX reaction is the reader's only
 * instrument — which makes it exactly the place a proxy must not pass for the
 * thing itself. Added 2026-08-23 with DIA and VIXY.
 */
describe("index proxies", () => {
  it("labels VIXY as a futures-based proxy, not as the VIX", () => {
    const label = assetRoleLabel("volatility_proxy", (en: string) => en);
    expect(label).toMatch(/proxy/i);
    // The reader must be able to tell this is not a VIX quote: VIXY holds VIX
    // FUTURES, and roll cost makes it track direction faithfully but level
    // only loosely.
    expect(label).toMatch(/futures/i);
  });

  it("marks both new index roles as proxies so the badge fires", () => {
    expect(isProxy("volatility_proxy")).toBe(true);
    expect(isProxy("equity_dow_proxy")).toBe(true);
  });

  it("names the index behind each broad-equity role", () => {
    // "Equity" alone does not tell a reader WHICH index moved.
    expect(assetRoleLabel("equity", (en: string) => en)).toMatch(/S&P 500/);
    expect(assetRoleLabel("equity_growth", (en: string) => en)).toMatch(/Nasdaq/);
  });
});
