/**
 * §52 "stock vs option risk display" — the rule that the two instruments are
 * never presented as identical, and the two projections the compliance audit
 * found missing (underlying exposure, vol sensitivity).
 *
 * These tests exist because the §52 rule CUTS BOTH WAYS, and each direction
 * has its own failure mode:
 *   - an option row must GAIN the two columns (the audit's finding);
 *   - a stock row must NOT sprout them as zeros, which would claim a
 *     measurement ("vega measured, and flat") where none applies.
 *
 * They also pin that neither figure is RECOMPUTED in the UI. Underlying
 * exposure is read off the served `delta_notional_usd`, which the backend
 * already computes as delta × spot × qty × mult; deriving it a second time
 * client-side would create two definitions of one number.
 */
import { describe, expect, it } from "vitest";
import {
  NON_OPTION_INSTRUMENTS,
  isOptionGreekRow,
  underlyingExposureUsd,
  volSensitivityUsd,
} from "./risk-greeks-52";

/** A long call: delta 0.425 × $208.02 spot × 5 contracts × 100 = $44,204.13. */
function optionRow(overrides: Record<string, unknown> = {}) {
  return {
    instrument: "LONG_CALL",
    delta_notional_usd: 44_204.13,
    vega_usd: 271.85,
    ...overrides,
  };
}

function stockRow(overrides: Record<string, unknown> = {}) {
  return {
    instrument: "LONG_STOCK",
    delta_notional_usd: 44_000,
    vega_usd: 0,
    ...overrides,
  };
}

describe("§52 isOptionGreekRow", () => {
  it("treats LONG_STOCK and SHORT_STOCK as non-option", () => {
    expect(isOptionGreekRow({ instrument: "LONG_STOCK" })).toBe(false);
    expect(isOptionGreekRow({ instrument: "SHORT_STOCK" })).toBe(false);
    expect(NON_OPTION_INSTRUMENTS).toEqual(["LONG_STOCK", "SHORT_STOCK"]);
  });

  it("treats calls and puts as options", () => {
    expect(isOptionGreekRow({ instrument: "LONG_CALL" })).toBe(true);
    expect(isOptionGreekRow({ instrument: "LONG_PUT" })).toBe(true);
  });

  it("treats an UNKNOWN instrument as an option rather than dropping its columns", () => {
    // A spread or option token the backend adds later must KEEP its §52
    // columns. The failure mode being pinned is an unlisted-enum fallthrough
    // that silently strips risk display from a real option position.
    expect(isOptionGreekRow({ instrument: "BULL_CALL_SPREAD" })).toBe(true);
    expect(isOptionGreekRow({ instrument: "" })).toBe(true);
  });
});

describe("§52 underlying exposure", () => {
  it("is the served delta notional on an option row — read, never recomputed", () => {
    // delta × spot × qty × mult IS `delta_notional_usd` on the wire. Equality
    // here is the point: one definition of the number, not two.
    expect(underlyingExposureUsd(optionRow())).toBe(44_204.13);
  });

  it("is NULL on a stock row — a share's underlying exposure is just its value", () => {
    expect(underlyingExposureUsd(stockRow())).toBeNull();
  });

  it("is NULL on a stock row even when the row carries a real notional", () => {
    // The stock row DOES have a delta notional ($44,000 above); the column
    // still must not render, because §52 asks that the instruments look
    // different, not that stock be given an option's vocabulary.
    expect(underlyingExposureUsd(stockRow({ delta_notional_usd: 999_999 }))).toBeNull();
  });

  it("passes a server null straight through on an option row", () => {
    // No chain data → the server sends null → the cell is an em dash. It is
    // never coerced to 0.
    expect(underlyingExposureUsd(optionRow({ delta_notional_usd: null }))).toBeNull();
  });

  it("preserves a NEGATIVE exposure (long put) rather than taking a magnitude", () => {
    // A long put is short the underlying. Flipping the sign would invert the
    // direction of the position on screen.
    expect(
      underlyingExposureUsd(optionRow({ instrument: "LONG_PUT", delta_notional_usd: -21_100 })),
    ).toBe(-21_100);
  });

  it("preserves an exposure of exactly zero on an option row", () => {
    // A genuinely delta-neutral option row is a REAL measurement of 0, and is
    // distinct from the null a stock row returns.
    expect(underlyingExposureUsd(optionRow({ delta_notional_usd: 0 }))).toBe(0);
  });
});

describe("§52 vol sensitivity", () => {
  it("is the served vega in $ per IV point on an option row", () => {
    expect(volSensitivityUsd(optionRow())).toBe(271.85);
  });

  it("is NULL on a stock row — a share has no vega, and 0 would claim otherwise", () => {
    // The stock fixture carries vega_usd: 0, which is exactly the trap: the
    // server's structural zero must NOT be displayed as a measurement.
    expect(volSensitivityUsd(stockRow())).toBeNull();
  });

  it("preserves NEGATIVE vega (a short-premium row) with its sign", () => {
    expect(volSensitivityUsd(optionRow({ vega_usd: -140.2 }))).toBe(-140.2);
  });

  it("passes a server null straight through on an option row", () => {
    expect(volSensitivityUsd(optionRow({ vega_usd: null }))).toBeNull();
  });

  it("preserves a vega of exactly zero on an option row", () => {
    expect(volSensitivityUsd(optionRow({ vega_usd: 0 }))).toBe(0);
  });
});

describe("§52 the rule cuts both ways", () => {
  it("gives an option row BOTH columns and a stock row NEITHER", () => {
    const opt = optionRow();
    const stk = stockRow();
    expect([underlyingExposureUsd(opt), volSensitivityUsd(opt)]).toEqual([
      44_204.13, 271.85,
    ]);
    expect([underlyingExposureUsd(stk), volSensitivityUsd(stk)]).toEqual([null, null]);
  });
});
