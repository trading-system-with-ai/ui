"use client";

/**
 * Display helpers for the Phase C replay surfaces (§20 Previous Event, §60
 * History).
 *
 * These extend price-format rather than restating it: `fmtRatioPct`,
 * `signColor`, `reasonFor` and `unavailableText` are imported from there and
 * re-exported, because a second copy of "how a fraction becomes a percent"
 * is exactly how two tabs start disagreeing about the same number.
 *
 * What is new here is the CELL: Phase C's payload marks an un-computable
 * value with `{available: false, reason}` instead of a bare null plus a
 * `reasons` lookup. That shape is the whole §60 honesty mechanism — EPS
 * surprise, revenue surprise and implied move are unavailable at EVERY
 * instant, for stated structural reasons, and they must render as such
 * rather than being quietly dropped from the table.
 */
import type { TFn } from "./event-format";
import { fmtRatioPct, reasonFor, signColor, unavailableText } from "./price-format";
import type {
  EventHistoryCell,
  EventIntradayReaction,
  IntradayWindowCell,
} from "@/lib/types";

export { fmtRatioPct, reasonFor, signColor, unavailableText };

/** The §60 window toggle. Matches the backend's `last_n` keys exactly. */
export const HISTORY_SIZES = [4, 8, 12] as const;
export type HistorySize = (typeof HISTORY_SIZES)[number];

/** Intraday marks, in the order the tiles show them. */
export const INTRADAY_WINDOWS = [5, 30, 60] as const;

/**
 * The §20 column order for the history table, used ONLY as the fallback when
 * the payload omits `columns`. The server carries its own order (from
 * `replay.HISTORY_COLUMNS`) precisely so this constant cannot silently drift
 * away from it; the payload's copy always wins.
 */
export const HISTORY_COLUMNS_FALLBACK: string[] = [
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
];

/**
 * Read one intraday window mark.
 *
 * `intraday_reaction_to_dict` keys the map by the LABEL it prints (`"30m"`),
 * so that spelling is tried first. The bare-number spelling is accepted second
 * for a hand-built or older payload — the same accept-both/invent-neither rule
 * `horizonValue` follows for the daily horizons. Returns null (not a
 * fabricated empty cell) when the window is genuinely absent, so the caller
 * must reach for a reason.
 */
export function windowCell(
  windows: Record<string, IntradayWindowCell> | null | undefined,
  minutes: number,
): IntradayWindowCell | null {
  if (windows == null) return null;
  return windows[`${minutes}m`] ?? windows[String(minutes)] ?? null;
}

/**
 * True when a `{available, reason}` cell carries a real value.
 *
 * `available` is treated as the authority and defaults to FALSE when absent:
 * a cell that forgot to say it was available is not evidence that it was.
 */
export function cellAvailable(cell: EventHistoryCell | null | undefined): boolean {
  return cell != null && cell.available === true;
}

/**
 * The reason an unavailable cell carries, verbatim (§26/§36).
 *
 * Returns null only when the server sent an unavailable cell with NO reason —
 * which the UI reports as such instead of inventing wording for the server.
 */
export function cellReason(cell: EventHistoryCell | null | undefined): string | null {
  if (cell == null) return null;
  const r = cell.reason;
  return typeof r === "string" && r !== "" ? r : null;
}

/**
 * §85 — a measurement made on an ASSUMPTION must say so.
 *
 * An UNKNOWN-session release has no known release time relative to the
 * session, so the library assumes an after-market print
 * ("unknown_session_assumed_after_market") and marks the result low
 * confidence. The two signals are checked independently: either one alone is
 * enough to flag the block, because a payload that sets only one of them is
 * still describing an assumed measurement.
 */
export function isAssumedBasis(
  reaction: EventIntradayReaction | null | undefined,
): boolean {
  if (reaction == null) return false;
  const basis = reaction.basis ?? "";
  return basis.startsWith("unknown_session") || reaction.confidence === "low";
}

/**
 * Format a raw share count (volume). Not a fraction — never scaled by 100.
 * Null in, null out; the caller pairs it with the server's reason.
 */
export function fmtVolume(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

/**
 * Format a MULTIPLE (volume ratio). "2.4×" — deliberately not a percentage,
 * because "240%" of normal volume reads as a return to a tired eye.
 */
export function fmtMultiple(v: number | null | undefined, digits = 2): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v.toFixed(digits)}×`;
}

/**
 * ISO timestamp → the "HH:MM" wall clock, verbatim from the string.
 *
 * Parsed textually rather than through `Date`, on purpose: `new Date(iso)`
 * renders in the BROWSER's zone, which would silently retime an ET release
 * for a user in Shanghai. The server already sent both the UTC and the ET
 * spelling; this only reads the clock out of the one it was handed.
 */
export function isoClock(v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const idx = v.indexOf("T");
  if (idx === -1) return null;
  const rest = v.slice(idx + 1);
  const m = /^(\d{2}:\d{2})/.exec(rest);
  return m == null ? null : m[1];
}

/** ISO timestamp → "YYYY-MM-DD HH:MM", verbatim (same no-reparse rule). */
export function isoStamp(v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const idx = v.indexOf("T");
  if (idx === -1) return v;
  const clock = isoClock(v);
  return clock == null ? v.slice(0, idx) : `${v.slice(0, idx)} ${clock}`;
}

/**
 * The label a lag gets when the bar used is not the bar asked for.
 *
 * A +30m mark satisfied by a bar 14 minutes late is still a real
 * measurement, but it is NOT a 30-minute measurement, and a tile that hides
 * the gap overstates its own precision. Returns null when the lag is absent
 * or under a minute — sub-minute lag on 1-minute bars is the normal case and
 * annotating it would be noise.
 */
export function lagNote(
  cell: IntradayWindowCell | null | undefined,
  t: TFn,
): string | null {
  const lag = cell?.lag_seconds;
  if (lag == null || !Number.isFinite(lag) || Math.abs(lag) < 60) return null;
  const minutes = Math.round(Math.abs(lag) / 60);
  return lag < 0
    ? t(`bar ${minutes}m early`, `实际取自提前 ${minutes} 分钟的 K 线`)
    : t(`bar ${minutes}m late`, `实际取自延后 ${minutes} 分钟的 K 线`);
}
