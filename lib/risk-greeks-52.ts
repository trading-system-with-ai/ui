/**
 * §52 "stock vs option risk display" — the rule that an option row and a
 * stock row must never be presented as if they were the same thing, plus the
 * two projections the compliance audit found missing from the Greeks table:
 * UNDERLYING EXPOSURE and VOL SENSITIVITY.
 *
 * This module is deliberately pure and free of React so the rule can be
 * pinned by tests directly, rather than only through a page component. The
 * risk page imports it; nothing here formats or renders.
 *
 * The substantive point, and the reason these functions exist at all: both
 * §52 figures are RESTATEMENTS of columns the wire already carries, not new
 * measurements.
 *
 *   underlying exposure = delta × spot × qty × mult
 *
 * which is bit-for-bit what the backend already serves as
 * `delta_notional_usd` (`greeks.py` computes `delta_notional =
 * delta_shares × spot` where `delta_shares = qty × mult × delta`). Deriving
 * it a second time in the UI would create two definitions of one number and
 * let them drift; reading it off the served field keeps exactly one.
 *
 *   vol sensitivity = vega in $ per ONE IV POINT
 *
 * which is the served `vega_usd`. Both are returned as nulls on a stock row,
 * because a share's "underlying exposure" is simply its market value (already
 * shown on the Positions page) and a share has no vega AT ALL — rendering 0
 * there would say "measured, and flat" where the truth is "does not apply".
 */

/** The subset of a Greeks row these rules need. */
export interface GreekRowLike {
  instrument: string;
  delta_notional_usd: number | null;
  vega_usd: number | null;
}

/**
 * Instruments that are NOT options. Everything else — LONG_CALL, LONG_PUT,
 * and any spread or option token the backend adds later — is treated as an
 * option, so a new option instrument keeps its §52 columns rather than
 * silently losing them to an unlisted-enum fallthrough.
 */
export const NON_OPTION_INSTRUMENTS: readonly string[] = ["LONG_STOCK", "SHORT_STOCK"];

/** §52 — is this row an OPTION row? */
export function isOptionGreekRow(p: { instrument: string }): boolean {
  return !NON_OPTION_INSTRUMENTS.includes(p.instrument);
}

/**
 * §52 underlying exposure, in dollars of stock the row behaves like right
 * now. Null on a stock row (the column does not apply) and null whenever the
 * server itself could not price the row — the two nulls are indistinguishable
 * here on purpose, because both render as the same honest em dash.
 */
export function underlyingExposureUsd(p: GreekRowLike): number | null {
  if (!isOptionGreekRow(p)) return null;
  return p.delta_notional_usd;
}

/**
 * §52 vol sensitivity — the dollar P&L for a ONE POINT move in implied
 * volatility. Null on a stock row: a share has no vega, and 0 would assert a
 * measurement that was never taken.
 */
export function volSensitivityUsd(p: GreekRowLike): number | null {
  if (!isOptionGreekRow(p)) return null;
  return p.vega_usd;
}
