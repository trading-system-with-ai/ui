/**
 * Phase K — wire types for the §62-§67 event-risk surface
 * (`GET /api/events/{id}/risk`, plus the `event_risk` block a trade plan
 * carries).
 *
 * Their own module for the same reason as `types-options.ts` and
 * `types-timeline.ts`: every name below belongs to ONE endpoint family, so a
 * reader chasing a field has one file to open and a rename on that seam
 * cannot ripple through the shared type surface.
 *
 * Four shapes carry the whole honesty contract of this surface, and the types
 * encode them rather than leaving them to convention:
 *
 *  A. `n` IS PART OF EVERY HISTORICAL STAT (§64). `n` is typed `number` and
 *     the four stats around it are all nullable — the server sends `n: 0`
 *     with four nulls when it has no sample, and never a median without the
 *     count that earned it. The type therefore makes it IMPOSSIBLE to render
 *     `median_abs` from this block without `n` being in hand.
 *  B. "UNKNOWN" IS A STATE, NOT A LOW. `EventRiskState` lists it explicitly
 *     beside LOW; the classifier emits it when there is neither an implied
 *     move nor a single historical print, and a UI that folded it into LOW
 *     would turn "we do not know" into "this is quiet".
 *  C. PERCENT, NOT FRACTION — AND ONLY ON THIS SEAM. Every `*_pct` and
 *     `*_share` field here is ALREADY A PERCENT NUMBER (`8.8` = 8.8%), which
 *     is the OPPOSITE convention to `types-options.ts` (`0.062` = 6.2%) and
 *     to `lib/risk-format`'s `fmtPct`. The split is by field and by module,
 *     never inferred from magnitude, and `risk-format.ts` is the only place
 *     that formats these — see its header.
 *  D. THE OPTION GREEKS BLOCK IS NULL OR REAL. The server sends `null` when
 *     no greek was supplied rather than a dict of zeros, because a zero vega
 *     on an options position reads as "this position is insensitive to
 *     volatility", which is the exact opposite of "we have no greeks".
 *
 * Every field is optional/nullable on purpose. This seam is new, U2 owns the
 * server half, and a payload that ships one field late must still render.
 */

/**
 * The deterministic classifier's verdict (§63).
 *
 * Assigned by a pure table in `libs/trading_core/risk/event_risk.py` — NO
 * language model is involved anywhere in this state, which is why the UI may
 * badge it as a measurement rather than as an opinion. Widened with `string`
 * so a server that adds a sixth token cannot make the panel unrenderable.
 */
export type EventRiskState =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "EXTREME"
  | "UNKNOWN"
  | string;

/**
 * The OPTIONS axis (§66), reported beside the state and never folded into it.
 *
 * A long call and 100 shares of the same stock into the same print carry the
 * same event risk and completely different sensitivity to it, so the two are
 * separate readings. `sensitivity` NEVER changes `event_risk_state`.
 */
export type EventRiskSensitivity = "LOW" | "MODERATE" | "HIGH" | string;

/**
 * Which measurement the expected move came from.
 *
 * IMPLIED is the option market's price for this event; HISTORICAL_MEDIAN is
 * the median absolute move of previous comparable events; NONE means neither
 * existed — the case that produces `UNKNOWN`. A number whose basis is unknown
 * is a number this surface must not print.
 */
export type EventRiskBasis =
  | "IMPLIED"
  | "HISTORICAL_MEDIAN"
  | "NONE"
  | string;

/**
 * Absolute-move statistics over previous comparable events.
 *
 * `n` is ALWAYS present (§64) and is `0` when there is no sample; the four
 * stats are then all null. Stats are ABSOLUTE (the underlying moves are
 * signed, the statistics are not) and are PERCENT numbers.
 */
export interface EventRiskHistorical {
  median_abs?: number | null;
  p75_abs?: number | null;
  p90_abs?: number | null;
  max_abs?: number | null;
  /** Sample size. Never absent — the whole point of §64. */
  n?: number | null;
}

/** The option market's priced move for this event, with its own basis label. */
export interface EventRiskImplied {
  /** PERCENT number (8.8 = 8.8%). */
  pct?: number | null;
  basis?: string | null;
}

/**
 * Net POSITION greeks, or null.
 *
 * Null and "all zeros" are different facts and the server never conflates
 * them: null means no greek was supplied at all.
 */
export interface EventRiskGreeks {
  gamma?: number | null;
  vega?: number | null;
  theta?: number | null;
}

/**
 * The classifier output — the same 15 keys on the event endpoint and on a
 * trade plan's `event_risk`, so ONE renderer serves both surfaces.
 */
export interface EventRiskSnapshot {
  event_type?: string | null;
  /** Days until the event; fractional (1.3 = a day and change). */
  time_to_event_days?: number | null;
  historical?: EventRiskHistorical | null;
  implied?: EventRiskImplied | null;
  /** PERCENT number. Implied when present, else the historical median. */
  expected_move_pct?: number | null;
  expected_move_basis?: EventRiskBasis | null;
  position_exposure_usd?: number | null;
  /** PERCENT of NAV (5.0 = 5%). Null-safe — never a fabricated 0. */
  exposure_share?: number | null;
  option_greeks?: EventRiskGreeks | null;
  event_risk_state?: EventRiskState | null;
  sensitivity?: EventRiskSensitivity | null;
  /** Why the classifier landed where it did. Always present, possibly empty. */
  drivers?: string[] | null;
  /** Sample-size and ESTIMATED-date honesty lines (§64). */
  caveats?: string[] | null;
  /** Non-null only in UNKNOWN: the reason nothing could be classified. */
  reason?: string | null;
  model_version?: string | null;

  /* Provenance the gateway stamps onto the classifier's own 15 keys. These
     answer "why is n=0" on the same payload that reports the n — the
     difference between "this stock does not move" and "nobody has looked". */
  event_id?: number | null;
  event_key?: string | null;
  ticker?: string | null;
  scheduled_at_utc?: string | null;
  /** §7 — a DERIVED date no source confirmed. Also appears in `caveats`. */
  is_estimated?: boolean | null;
  /**
   * Coverage of the history behind `historical`, and the BACKFILL that would
   * fill it. Lives INSIDE the snapshot (not beside it), because a coverage
   * reason separated from the sample it describes is a reason nobody reads.
   */
  coverage?: {
    history_events?: number | null;
    history_with_metrics?: number | null;
    history_moves_used?: number | null;
    own_metrics?: boolean | null;
    reason?: string | null;
    [k: string]: unknown;
  } | null;
}

/**
 * §66 options context for the event: what the option market charged, and what
 * previous events' IV actually did across the print.
 *
 * `expected_crush` is deliberately a STATUS block rather than a number — the
 * platform forecasts no crush, and `{status: "NO_DATA"}` is the honest form
 * of that. A UI that rendered a blank here would be read as "no crush
 * expected", which is a forecast nobody made.
 */
export interface EventRiskOptions {
  /**
   * This event's own stored IV, or null with no stored straddle. A PERCENT
   * number (62.0 = 62% IV): the column stores the fraction `0.62` and the
   * gateway converts it, so this renders through `fmtPctNumber` like every
   * other figure on this seam.
   */
  event_iv?: number | null;
  /**
   * This event's implied move, as a PERCENT number (8.8 = 8.8%) — the same
   * value and the same units as `snapshot.implied.pct`.
   *
   * The underlying column `event_option_metrics.implied_move_pct` stores a
   * FRACTION (0.088), which is the options seam's convention; the gateway
   * converts it at the boundary so that THIS payload speaks one unit
   * convention end to end. That is deliberate: a payload mixing fractions and
   * percents across sibling keys is how an EXTREME print ends up rendered as
   * "implied move 0.09%".
   */
  implied_move_pct?: number | null;
  /** LIVE_CHAIN_SNAPSHOT vs HISTORICAL_DAILY_CLOSE_APPROXIMATION (§37). */
  implied_basis?: string | null;
  implied_status?: string | null;
  is_live_basis?: boolean | null;
  /**
   * The literal string "NO_DATA" — never a number.
   *
   * This platform subscribes to no forward volatility surface, so the crush
   * this print will produce is NOT forecast. Typed as a string precisely so
   * that no caller can arithmetic on it.
   */
  expected_iv_crush?: string | null;
  expected_iv_crush_note?: string | null;
  /**
   * REALIZED crushes of previous prints — a `historical_event_risk` block, so
   * it carries its own `n` (§64) and its stats are absolute.
   */
  historical_iv_crush?: EventRiskHistorical | null;
  /** Same shape, for what previous prints were IMPLIED to move. */
  historical_implied_move?: EventRiskHistorical | null;
  /** The §66 long-call sentence, authored server-side (§26/§36). */
  explainer?: string | null;
  [k: string]: unknown;
}

/**
 * The §62 MARKET-WIDE flag: an FOMC decision within a few days.
 *
 * Reported BESIDE a ticker's own state and never folded into it — a decision
 * that moves every position in the book at once would both overstate one
 * ticker's idiosyncratic risk and understate the book's if it were expressed
 * as a bump to a single event's state. Null when no meeting is close, which
 * is an honest absence rather than a cleared flag.
 */
export interface EventRiskMarketWide {
  event_id?: number | null;
  event_key?: string | null;
  event_type?: string | null;
  title?: string | null;
  scheduled_at_utc?: string | null;
  days_away?: number | null;
  is_estimated?: boolean | null;
  note?: string | null;
}

/** `GET /api/events/{id}/risk`. */
export interface EventRiskPayload {
  event_id?: number | null;
  event_key?: string | null;
  ticker?: string | null;
  as_of?: string | null;
  /**
   * False for an event with no issuer whose risk this could be (a CPI print
   * has no position and no straddle). The row still answers 200 — the event
   * exists, it simply is not a single-name catalyst — so this is a STATE the
   * UI renders with its reason, never an error and never an empty snapshot.
   */
  available?: boolean | null;
  /** Why `available` is false. Null when it is true. */
  reason?: string | null;
  snapshot?: EventRiskSnapshot | null;
  options?: EventRiskOptions | null;
  /** §62 — present on EVERY response, null when no FOMC meeting is close. */
  market_wide?: EventRiskMarketWide | null;
  /**
   * Always "SHADOW" in Phase K (§65). Typed as a string rather than a literal
   * so that the DAY it changes, the badge changes with it instead of the type
   * silently lying about a promoted layer.
   */
  enforcement?: string | null;
  model_version?: string | null;
  /** The server's own SHADOW sentence — rendered verbatim (§26/§36). */
  note?: string | null;
  /**
   * NAV at COST BASIS, and `nav_basis` says so. This surface reads registry
   * rows only, so exposure and NAV are both taken at cost and their ratio is
   * a magnitude check for a threshold bump, never a valuation.
   */
  nav_at_cost?: number | null;
  nav_basis?: string | null;
}

/**
 * The block a trade plan carries (`plan.event_risk`), computed FRESH on every
 * read — never stored inside `preview`, because a plan generated last Tuesday
 * would otherwise keep announcing "earnings in 1.3 days" forever, and a stale
 * countdown is a false statement with a number attached.
 *
 * The snapshot is NESTED here exactly as it is on the event endpoint, so one
 * renderer serves both. `exposure_share` is deliberately null on this seam: a
 * plan is a research artifact and not a position, so the share of a portfolio
 * it does not own is an honest absence with its caveat rather than a zero.
 */
export interface PlanEventRisk {
  snapshot?: EventRiskSnapshot | null;
  enforcement?: string | null;
  model_version?: string | null;
  /** When this block was recomputed — the countdown's own as-of. */
  computed_at?: string | null;
  note?: string | null;
}
