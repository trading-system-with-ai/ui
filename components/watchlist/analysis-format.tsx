/**
 * Number formatting for the symbol-analysis screens.
 *
 * Extracted from ``app/watchlist/[ticker]/page.tsx`` (2026-08-24). Shared by
 * the page and its tabs so a value is rendered the same way wherever it
 * appears — two formatters drifting apart is how the same number comes to
 * read differently on two tabs of one screen.
 *
 * ABSENT IS NOT ZERO (§44 rule 18): every helper here renders a missing value
 * as a dash, never as ``0`` or ``0.0%``.
 */
import type { ReactNode } from "react";

import type { TFn } from "@/components/catalysts/event-format";
import { fmtPct } from "@/lib/risk-format";

export function fmtPrice(v: number | null): string {
  return v == null ? "—" : `$${v.toFixed(2)}`;
}

export function fmtScore(v: number): string {
  return v.toFixed(1);
}

export function fmtSigned(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

export function fmtFeature(v: number | boolean, t: TFn): string {
  if (typeof v === "boolean") return v ? t("yes", "是") : t("no", "否");
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/* Null-safe % helpers for the §7 vol chip (fields arrive as FRACTIONS). */
export function pctOrDash(v: number | null | undefined): string {
  return v == null ? "—" : fmtPct(v);
}

export function signedPctOrDash(v: number | null | undefined): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${fmtPct(v)}`;
}

export function plusMinusPctOrDash(v: number | null | undefined): string {
  return v == null ? "—" : `±${fmtPct(v)}`;
}

export function indicatorValue(v: number | null, fmt: (v: number) => string, insufficient: ReactNode) {
  return v == null ? insufficient : fmt(v);
}
