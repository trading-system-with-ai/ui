import type { HeatState, RiskDecision } from "./types";

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
