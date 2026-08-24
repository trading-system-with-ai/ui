/**
 * Phase G §8/§38–§41 — `GET /api/events/{id}/macro` wire types.
 *
 * Own module, like `types-timeline.ts` and `types-options.ts`: one endpoint's
 * payload whose shape can be read in one screen.
 *
 * EVERY FIELD PAST THE IDENTITY KEYS IS OPTIONAL, and that is a statement
 * about the domain rather than defensive habit. A macro packet is assembled
 * from four independent government sources, any of which can be absent for a
 * given release: BLS has no schedule row for a period, BEA needs an API key
 * nobody configured, the Treasury CSV has a blank cell on a bank holiday, an
 * ETF has no stored bars. Typing those as required would force the renderer to
 * invent values or to cast — and a cast is how a missing key becomes the string
 * "undefined" printed under a number a trader is about to act on.
 *
 * The one field that is NEVER optional in spirit is `consensus.status`. §33 and
 * the Phase G contract are explicit: this platform subscribes to no estimate
 * provider, so the consensus is ALWAYS the unavailable marker. It is typed as a
 * status-bearing object rather than `number | null` precisely so that no code
 * path can put a number there — the one figure a reader most expects beside an
 * actual is the one nobody may invent.
 */

/** §11 provenance tiers that reach this payload. The macro tab has no LLM on it. */
export type MacroTier = "DATA" | "QUANT";

/**
 * The marker the server sends in place of an estimate.
 *
 * Rendered VERBATIM (`CONSENSUS_DATA_UNAVAILABLE` → "CONSENSUS DATA
 * UNAVAILABLE"). The UI never re-spells it into something softer like "n/a":
 * the whole point of the string is that it is loud.
 */
export interface MacroConsensus {
  status?: string | null;
  reason?: string | null;
  [k: string]: unknown;
}

/**
 * What the server actually puts in a `consensus` / `surprise` slot.
 *
 * VERIFIED against the live payload: it is the bare marker STRING
 * ("CONSENSUS DATA UNAVAILABLE"), not an object. The object form stays
 * accepted so that a future estimate provider can arrive without a UI change,
 * but the string is the shape that ships today — typing it object-only made
 * every renderer read `.status` off a string and silently print nothing.
 */
export type MacroConsensusField = string | MacroConsensus | null;

/** The surprise block. Same rule as consensus — no consensus, no surprise. */
export interface MacroSurprise {
  status?: string | null;
  reason?: string | null;
  [k: string]: unknown;
}

/**
 * One actual reading, keyed by its ROLE in the release
 * ("headline" | "core" | "rate" | "level" | "wages").
 *
 * `transform` and `unit` travel WITH the value because a bare number is
 * meaningless here: 0.3 is a monthly percent change, 3.2 a year-over-year
 * percent, 147 a level in thousands, 4.1 a rate in percent. The renderer
 * formats from these fields and never from the role name — the same role
 * carries a different unit for a different release.
 */
export interface MacroActual {
  series_id?: string | null;
  label?: string | null;
  value?: number | null;
  /** e.g. "%", "pp", "k", "index". Printed verbatim after the number. */
  unit?: string | null;
  /** Server token: "mom_pct" | "yoy_pct" | "level" | "change_k". */
  transform?: string | null;
  /** The reference period the value describes, e.g. "2026-07". */
  period?: string | null;
  /** True when the series is NOT seasonally adjusted — a material caveat. */
  seasonally_adjusted?: boolean | null;
  [k: string]: unknown;
}

/** The release that already happened: actuals, and the consensus we do not have. */
export interface MacroPreviousRelease {
  /** Reference period, e.g. "2026-07" or "2026-Q2". */
  period?: string | null;
  /** ISO instant the print hit the tape. */
  release_at?: string | null;
  /** Actuals keyed by role. */
  actual?: Record<string, MacroActual> | null;
  consensus?: MacroConsensusField;
  surprise?: string | MacroSurprise | null;
  /** "SCHEDULED" | "ESTIMATED" — per release, NOT per packet. */
  release_time_basis?: string | null;
  available?: boolean | null;
  [k: string]: unknown;
}

/** The release that has NOT happened: a period, a time, and no estimate. */
export interface MacroCurrentRelease {
  period?: string | null;
  release_at?: string | null;
  consensus?: MacroConsensusField;
  /** "SCHEDULED" | "ESTIMATED" — per release, NOT per packet. */
  release_time_basis?: string | null;
  available?: boolean | null;
  [k: string]: unknown;
}

/** One historical print inside a trend series. */
export interface MacroPrint {
  period?: string | null;
  value?: number | null;
  /** The preceding period's value, as the server paired them. */
  prior?: number | null;
  release_at?: string | null;
  [k: string]: unknown;
}

/**
 * A trend series, keyed by `series_id` in `recent_trend`.
 *
 * `direction` is the SERVER's label ("rising" | "falling" | "flat") computed
 * from its own slope rule (§61 — the UI never computes analytics the backend
 * computes). The renderer prints it; it does not re-derive it from `prints`,
 * because two different slope rules producing two different words on the same
 * data is exactly the kind of quiet disagreement nobody catches.
 */
export interface MacroTrendSeries {
  label?: string | null;
  prints?: MacroPrint[] | null;
  direction?: string | null;
  unit?: string | null;
  transform?: string | null;
  [k: string]: unknown;
}

/**
 * Coverage — what the packet could NOT see.
 *
 * Open-shaped on purpose: this is the field that grows as U1 adds sources, and
 * a closed type here would mean a new caveat silently fails to render. The tab
 * prints the notes it recognises and the raw entries it does not.
 */
export interface MacroCoverage {
  available?: boolean | null;
  reason?: string | null;
  notes?: string[] | null;
  [k: string]: unknown;
}

/** The §38 packet: previous print, next print, the run of prints behind them. */
export interface MacroPacket {
  previous_release?: MacroPreviousRelease | null;
  current_release?: MacroCurrentRelease | null;
  /** Keyed by series_id. */
  recent_trend?: Record<string, MacroTrendSeries> | null;
  coverage?: MacroCoverage | null;
  consensus_status?: string | null;
  surprise_status?: string | null;
  /**
   * NOTE: there is deliberately no packet-level `release_time_basis`. The
   * server stamps the basis on EACH release block, because the previous print
   * can be SCHEDULED (a real schedule row was stored) while the upcoming one
   * is still ESTIMATED. One flag for both would let a guess read as a
   * published time — see `MacroPreviousRelease.release_time_basis`.
   */
  [k: string]: unknown;
}

/**
 * One asset's move around the previous print.
 *
 * `role` names what the asset is standing in FOR ("2y_proxy", "gold_proxy"…).
 * It is rendered as a badge rather than dropped, because a reader who sees IEF
 * move 40bp and thinks they are reading the 10-year yield has been misled by
 * an omission. `returns` is keyed by horizon ("1d", "5d") as FRACTIONS.
 */
export interface MacroAssetReaction {
  symbol?: string | null;
  role?: string | null;
  is_proxy?: boolean | null;
  basis?: string | null;
  pre_event_close?: number | null;
  pre_event_date?: string | null;
  /** The bar the server treated as the first tradeable reaction (§39). */
  react_date?: string | null;
  /** Keyed by the server's own horizon labels "1D" / "5D". FRACTIONS. */
  returns?: Record<string, number | null> | null;
  /** Always "fraction" — 0.0102 is +1.02%, never a percent already. */
  returns_unit?: string | null;
  reasons?: string[] | null;
  [k: string]: unknown;
}

/**
 * One tenor's move across the release, in BASIS POINTS.
 *
 * An object rather than a number because the levels it was measured between
 * travel with it, and because an absent curve needs a `reason` — a bare
 * `null` bp would make a bank holiday indistinguishable from an unchanged
 * curve, which is the one confusion the null-handling here exists to prevent.
 */
export interface MacroYieldChange {
  tenor?: string | null;
  before?: number | null;
  before_date?: string | null;
  after?: number | null;
  after_date?: string | null;
  change_bp?: number | null;
  change_unit?: string | null;
  level_unit?: string | null;
  reason?: string | null;
  [k: string]: unknown;
}

/** An asset the server could not measure, and why. Never silently omitted. */
export interface MacroUnavailableAsset {
  symbol?: string | null;
  reason?: string | null;
  [k: string]: unknown;
}

/**
 * §39 — what markets did around the PREVIOUS release.
 *
 * `yields` is in BASIS POINTS (the server's own unit), keyed "2y_bp"/"10y_bp",
 * and is kept apart from `assets` for that reason: a yield change in bp and an
 * ETF return in percent share no scale, and putting them on one axis would be
 * the dual-axis anti-pattern wearing a table for a disguise.
 */
export interface MacroPreviousReaction {
  tier?: MacroTier | string | null;
  available?: boolean | null;
  /** The instant the release hit the tape (server key: `event_at_utc`). */
  event_at_utc?: string | null;
  event_date_et?: string | null;
  session?: string | null;
  /** ["1D","5D"] — the keys into each asset's `returns`. */
  horizons?: string[] | null;
  assets?: Record<string, MacroAssetReaction> | null;
  /** Keyed by the Treasury CSV's own spelling: "2 Yr" / "10 Yr". */
  yields?: Record<string, MacroYieldChange> | null;
  unavailable?: MacroUnavailableAsset[] | null;
  asset_roles?: Record<string, string> | null;
  proxy_note?: string | null;
  yields_reason?: string | null;
  [k: string]: unknown;
}

/** One neighbouring event inside the §40 window. */
export interface MacroRelatedItem {
  event_id?: number | null;
  event_type?: string | null;
  title?: string | null;
  /** The instant the neighbouring event is scheduled for. */
  scheduled_at?: string | null;
  importance?: number | null;
  is_macro?: boolean | null;
  [k: string]: unknown;
}

/** §40 — other prints and Fed speeches between the last release and as-of. */
export interface MacroRelatedEvidence {
  available?: boolean | null;
  /** Flat bounds, not a nested `window` object. */
  window_start?: string | null;
  window_end?: string | null;
  /** Server key is `events`, not `items`. */
  events?: MacroRelatedItem[] | null;
  n_events?: number | null;
  reason?: string | null;
  note?: string | null;
  [k: string]: unknown;
}

/** `GET /api/events/{id}/macro` — the whole tab in one payload. */
export interface EventMacroPayload {
  event_id?: number | null;
  event_key?: string | null;
  event_type?: string | null;
  as_of?: string | null;
  available?: boolean | null;
  reason?: string | null;
  model_version?: string | null;
  packet?: MacroPacket | null;
  /**
   * §39. The server's key is `previous_release_reaction` — it names the
   * release the reaction was measured around, not merely "the previous one".
   */
  previous_release_reaction?: MacroPreviousReaction | null;
  related_evidence?: MacroRelatedEvidence | null;
  /** The §33 consensus disclaimer, printed verbatim. */
  disclaimer?: string | null;
  coverage?: MacroCoverage | null;
  [k: string]: unknown;
}

/** `POST /api/events/{id}/macro/backfill` — reported by what the SERVER stored. */
export interface EventMacroBackfillResult {
  status?: string | null;
  reason?: string | null;
  available?: boolean | null;
  /** What the server actually stored, by source. Absent counts mean zero. */
  counts?: {
    observations?: number | null;
    yield_curves?: number | null;
    bars?: number | null;
  } | null;
  series?: unknown[] | null;
  [k: string]: unknown;
}

/* ------------------------------------------------------- §46 macro_context */

/**
 * One upcoming macro event, as the evidence bundle's `macro_context` lists it.
 *
 * This is the EARNINGS-side view of Phase G: a reader looking at a single
 * company's print wants to know that CPI lands two days before it. `days_to`
 * and `importance` arrive computed (§61).
 */
export interface MacroContextEvent {
  event_id?: number | null;
  event_key?: string | null;
  event_type?: string | null;
  title?: string | null;
  /** Server key is `scheduled_at` (tz-aware ISO), not `scheduled_at_utc`. */
  scheduled_at?: string | null;
  days_to?: number | null;
  importance?: number | null;
  /** §7 — a derived date must never render as a scheduled fact. */
  is_estimated?: boolean | null;
  [k: string]: unknown;
}

/** `bundle.macro_context` — the §46 section. */
export interface MacroContextSection {
  tier?: MacroTier | string | null;
  /**
   * Which of the two shapes this section is: "upcoming_macro_releases" on a
   * non-macro event (the list below), "macro_event_packet" on a macro row.
   */
  kind?: string | null;
  consensus_status?: string | null;
  disclaimer?: string | null;
  horizon_end?: string | null;
  next?: MacroContextEvent | null;
  upcoming?: MacroContextEvent[] | null;
  horizon_days?: number | null;
  available?: boolean | null;
  reason?: string | null;
  [k: string]: unknown;
}

/* ---------------------------------------------------------- macro identity */

/**
 * The event types whose detail page mounts the Macro tab.
 *
 * A CLOSED list rather than "anything without a ticker": the tab renders a BLS
 * / BEA release packet, and mounting it for a MARKET_HOLIDAY or a
 * CORPORATE_EVENT would promise a packet the server has no catalogue for. The
 * Fed types are deliberately absent — an FOMC decision has no release packet
 * of index prints behind it, and Phase G's §41 question is asked of data
 * releases.
 */
export const MACRO_EVENT_TYPES = [
  "CPI",
  "PPI",
  "PCE",
  "GDP",
  "EMPLOYMENT_REPORT",
  "JOLTS",
  "RETAIL_SALES",
  "ISM",
  "CONSUMER_SENTIMENT",
] as const;

export type MacroEventType = (typeof MACRO_EVENT_TYPES)[number];

/** True when this event type gets a Macro tab. */
export function isMacroEventType(eventType: string | null | undefined): boolean {
  if (typeof eventType !== "string" || eventType === "") return false;
  return (MACRO_EVENT_TYPES as readonly string[]).includes(eventType);
}
