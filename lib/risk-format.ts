import type {
  HeatState,
  Instrument,
  OpportunityStatus,
  ProposedContract,
  RiskDecision,
  VolRegime,
} from "./types";

/** Badge class per watchlist opportunity status (shared by Watchlist & Dashboard). */
export const OPPORTUNITY_BADGE: Record<OpportunityStatus, "green" | "amber" | "red" | "dim"> = {
  ENTRY_READY: "green",
  SETUP_FORMING: "amber",
  DATA_ISSUE: "red",
  BACKTEST_FAILED: "red",
  WATCH: "dim",
  NO_SIGNAL: "dim",
};

/** Badge class (globals.css .badge.green/.amber/.red) per Portfolio Heat state. */
export const HEAT_BADGE: Record<HeatState, "green" | "amber" | "red"> = {
  NORMAL: "green",
  ELEVATED: "amber",
  HIGH: "amber",
  BLOCKED: "red",
};

/** Badge class per risk approval decision. */
export const DECISION_BADGE: Record<RiskDecision, "green" | "amber" | "red"> = {
  APPROVE: "green",
  APPROVE_WITH_RESIZE: "amber",
  REJECT: "red",
};

/** Badge class per §8 instrument verdict (NO_TRADE = the matrix chose nothing). */
export const INSTRUMENT_BADGE: Record<
  Instrument | "NO_TRADE",
  "accent" | "green" | "red" | "dim"
> = {
  LONG_STOCK: "accent",
  LONG_CALL: "green",
  LONG_PUT: "red",
  NO_TRADE: "dim",
};

/** Compact instrument label for tight tables (dashboard mini table). */
export const INSTRUMENT_SHORT: Record<Instrument, string> = {
  LONG_STOCK: "STOCK",
  LONG_CALL: "CALL",
  LONG_PUT: "PUT",
};

/** Badge class per volatility regime (input to the §8 instrument matrix). */
export const VOL_REGIME_BADGE: Record<VolRegime, "dim" | "accent" | "amber" | "red"> = {
  LOW: "dim",
  NORMAL: "accent",
  HIGH: "amber",
  EXTREME: "red",
};

/** "$150" / "$152.50" — strike without spurious decimals. */
export function fmtStrike(strike: number): string {
  return `$${strike.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * One-line contract summary, e.g.
 * "C 2026-09-18 $150 · Δ0.62 · IV 32% · 45 DTE · mid $4.20 · max loss/contract $420".
 * Used by the Trade Plan contract card AND the approve confirm dialog (§39 —
 * max loss per contract is never hidden).
 */
export function fmtProposedContract(c: ProposedContract): string {
  return [
    `${c.right} ${c.expiry} ${fmtStrike(c.strike)}`,
    `Δ${c.delta.toFixed(2)}`,
    `IV ${(c.iv * 100).toFixed(0)}%`,
    `${c.dte} DTE`,
    `mid $${c.mid.toFixed(2)}`,
    `max loss/contract ${fmtUsd(c.max_loss_per_contract, 0)}`,
  ].join(" · ");
}

export function fmtUsd(v: number, digits = 0): string {
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Format a FRACTION of NAV/cap as a percentage. The portfolio-risk and
 * order-preview APIs send every `*_pct` field as a fraction (0.04 = 4%,
 * pinned by services/tests/test_portfolio_risk.py), so scale by 100 here.
 */
export function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/**
 * Severity of a utilization ratio (risk vs cap): green under 70%, amber
 * approaching the cap, red at >= 95% of the cap.
 */
export function utilizationSeverity(utilizationPct: number): "green" | "amber" | "red" {
  if (utilizationPct >= 95) return "red";
  if (utilizationPct >= 70) return "amber";
  return "green";
}
