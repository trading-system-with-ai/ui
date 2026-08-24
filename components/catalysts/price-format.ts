"use client";

/**
 * Display helpers for the Phase E1 Price tab.
 *
 * The one rule they all encode: a MISSING number and a ZERO number are
 * different facts, and this module never lets the first become the second.
 * `fmtRatioPct(null)` does not return "0.0%" and does not return a bare em
 * dash either — the caller pairs it with the server's own reason, because an
 * unexplained blank cell is indistinguishable from a bug.
 *
 * Wire convention: every `*_pct`, return and volatility field is a FRACTION
 * (0.042 = 4.2%), matching lib/risk-format's fmtPct rather than
 * lib/backtest-metrics' already-percent one. Scaling happens HERE, once.
 */
import type { TFn } from "./event-format";
import type { PriceHorizonMap, PriceReasons } from "@/lib/types";

/** The horizons the reaction table shows, in the order it shows them. */
export const HORIZONS = [1, 3, 5, 10] as const;

/** The abnormal-vs-SPY columns (§19 keeps the table narrow: 1D and 5D). */
export const ABNORMAL_HORIZONS = [1, 5] as const;

/** History-stat windows, matching the backend's `last_n` keys. */
export const HISTORY_WINDOWS = ["last4", "last8", "last12"] as const;
export type HistoryWindow = (typeof HISTORY_WINDOWS)[number];

/** Horizon keys of the history_stats block, in display order. */
export const HISTORY_HORIZONS = ["1D", "5D"] as const;

/**
 * Format a FRACTION as a percentage. Returns null (not "0.0%", not "—") when
 * the input is absent or non-finite, so callers must decide what to render
 * in its place — which is always the reason, never a placeholder number.
 */
export function fmtRatioPct(
  v: number | null | undefined,
  digits = 1,
  signed = false,
): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const scaled = v * 100;
  const sign = signed && scaled > 0 ? "+" : "";
  return `${sign}${scaled.toFixed(digits)}%`;
}

/** Format a price level. Same null contract as fmtRatioPct. */
export function fmtPrice(v: number | null | undefined, digits = 2): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v.toFixed(digits);
}

/**
 * Colour a return by SIGN. An absent value is NEVER coloured: a blank cell
 * tinted green would read as a small gain.
 */
export function signColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "var(--text-dim)";
  return v < 0 ? "var(--red)" : "var(--green)";
}

/**
 * Horizon maps arrive JSON-keyed by the LABEL the server prints: `{"1D": …}`
 * (gateway `_horizon_map` renders `{f"{k}D": …}`, so the wire never carries a
 * bare `"1"`). The bare-number spelling is still accepted second because it
 * costs one lookup and keeps an older or hand-built payload readable — but the
 * labelled key is the real one and is tried first. Accept both, invent neither.
 */
export function horizonValue(
  map: PriceHorizonMap | null | undefined,
  horizon: number,
): number | null {
  if (map == null) return null;
  const v = map[`${horizon}D`] ?? map[String(horizon)];
  return v == null || !Number.isFinite(v) ? null : v;
}

/**
 * Find the server's explanation for a null field. Looks up the exact field
 * key first, then the block-level fallbacks the backend uses when one reason
 * covers everything ("bars_unavailable", "no_bars"). Returns null when the
 * server sent no reason at all — which the UI reports as such rather than
 * inventing wording on the server's behalf.
 */
export function reasonFor(
  reasons: PriceReasons | null | undefined,
  ...keys: string[]
): string | null {
  if (reasons == null) return null;
  for (const k of keys) {
    const r = reasons[k];
    if (typeof r === "string" && r !== "") return r;
  }
  for (const fallback of ["bars_unavailable", "no_bars", "bars", "all"]) {
    const r = reasons[fallback];
    if (typeof r === "string" && r !== "") return r;
  }
  return null;
}

/**
 * The single sentence shown wherever a metric is missing. The server's reason
 * is passed through VERBATIM (§26/§36) — it names the real dates and the real
 * shortfall ("needs 200 bars, have 143"), which no client-side wording could
 * reproduce. Only the "no reason supplied" case is worded here, and it says
 * exactly that instead of pretending to know why.
 */
export function unavailableText(reason: string | null | undefined, t: TFn): string {
  if (reason == null || reason === "") {
    return t(
      "Unavailable — the server sent no reason.",
      "无法计算 — 服务端未提供原因。",
    );
  }
  return t(`Unavailable — ${reason}`, `无法计算 — ${reason}`);
}

/** ISO date/datetime → the date part, verbatim. Never re-derives a date. */
export function isoDate(v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const idx = v.indexOf("T");
  return idx === -1 ? v : v.slice(0, idx);
}

/** "5 of 8" — a COUNT of history. §64: never rendered as a percentage. */
export function positiveTally(
  positiveCount: number | null | undefined,
  n: number | null | undefined,
): string | null {
  if (positiveCount == null || n == null || n <= 0) return null;
  return `${positiveCount}/${n}`;
}
