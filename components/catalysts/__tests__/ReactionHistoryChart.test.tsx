/**
 * The reaction chart answers "what did the STOCK do", where its sibling
 * ImpliedVsActualChart answers "did the OPTIONS MARKET charge the right
 * price". It needs no option chain, so it renders for the many events that
 * have none. These tests pin the honesty rules:
 *
 *  1. A MISSING RETURN DRAWS NOTHING — never a zero-height bar. "The bars were
 *     never fetched" and "the stock did not move" are opposite claims.
 *  2. SIGN IS KEPT, and carried by GEOMETRY. Unlike the implied chart (where a
 *     straddle prices magnitude, so both series fold to absolute), direction
 *     is the whole question here.
 *  3. THE AXIS IS SYMMETRIC about zero and floored, so a quiet history is not
 *     magnified into drama.
 *  4. COLOUR ENCODES THE HORIZON, NOT GOOD/BAD.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import ReactionHistoryChart, { type ReactionHistoryRow } from "../ReactionHistoryChart";

afterEach(cleanup);

function renderChart(rows: ReactionHistoryRow[]) {
  return render(
    <LanguageProvider>
      <ReactionHistoryChart rows={rows} />
    </LanguageProvider>,
  );
}

const ROW = (over: Partial<ReactionHistoryRow> = {}): ReactionHistoryRow => ({
  key: "EARNINGS:HPE:2026-06-01",
  label: "2026-06-01",
  ret1d: 0.05,
  ret5d: 0.02,
  ...over,
});

describe("ReactionHistoryChart", () => {
  it("draws no bar for a horizon that could not be measured", () => {
    renderChart([ROW({ key: "a", ret1d: 0.05, ret5d: null })]);
    expect(screen.getByTestId("rh-bar-a-1D")).toBeTruthy();
    // A zero-height bar would state "the stock did not move over 5 days".
    expect(screen.queryByTestId("rh-bar-a-5D")).toBeNull();
  });

  it("omits an event entirely when neither horizon was measured", () => {
    renderChart([
      ROW({ key: "a" }),
      ROW({ key: "b", label: "2026-03-01", ret1d: null, ret5d: null }),
    ]);
    expect(screen.queryByTestId("rh-bar-b-1D")).toBeNull();
    expect(screen.queryByTestId("rh-bar-b-5D")).toBeNull();
  });

  it("renders nothing when no event has any measured return", () => {
    const { container } = renderChart([ROW({ ret1d: null, ret5d: null })]);
    expect(container.querySelector('[data-testid="reaction-history-chart"]')).toBeNull();
  });

  it("keeps the sign — a fall sits below the baseline, a rise above", () => {
    renderChart([
      ROW({ key: "up", ret1d: 0.05, ret5d: null }),
      ROW({ key: "down", label: "2026-03-01", ret1d: -0.05, ret5d: null }),
    ]);
    const up = screen.getByTestId("rh-bar-up-1D");
    const down = screen.getByTestId("rh-bar-down-1D");
    // Symmetric axis: equal magnitudes give equal heights on opposite sides.
    expect(Number(up.getAttribute("height"))).toBeCloseTo(
      Number(down.getAttribute("height")),
      1,
    );
    expect(Number(up.getAttribute("y"))).toBeLessThan(Number(down.getAttribute("y")));
  });

  it("does not magnify a quiet history", () => {
    // A 0.1% move must not fill the frame just because it is the maximum.
    renderChart([ROW({ key: "quiet", ret1d: 0.001, ret5d: null })]);
    const bar = screen.getByTestId("rh-bar-quiet-1D");
    // The axis floor is 2%, so a 0.1% move occupies a small slice of the
    // half-height, not all of it.
    expect(Number(bar.getAttribute("height"))).toBeLessThan(20);
  });

  it("says colour means the horizon, not good or bad", () => {
    renderChart([ROW()]);
    expect(screen.getByTestId("reaction-history-chart").textContent).toMatch(
      /not good or bad/i,
    );
  });
});
