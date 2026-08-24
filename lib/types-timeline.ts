/**
 * Phase J §57 — `GET /api/events/{id}/timeline` wire types.
 *
 * Kept in their own module (rather than appended to `types.ts`) for the same
 * reason `types-options.ts` is: the timeline is one endpoint's payload, and a
 * seam that owns its own file is a seam whose shape can be read in one screen.
 *
 * EVERY FIELD PAST THE IDENTITY KEYS IS OPTIONAL, deliberately. The payload is
 * a UNION of four different item kinds serialised into one list, so a NEWS row
 * legitimately carries no `fiscal_period` and a FILING row legitimately carries
 * no `score`. Typing them as required would force the renderer either to invent
 * values or to cast, and a cast is how a missing key becomes `undefined` printed
 * on screen. The renderer reads defensively and prints nothing it was not sent.
 */

/** The four item kinds the server groups the window into. */
export type TimelineKind = "NEWS" | "FILING" | "EVENT" | "ANALYSIS";

/** The kinds in the fixed order the filter row and the counts strip use. */
export const TIMELINE_KINDS: TimelineKind[] = ["NEWS", "FILING", "EVENT", "ANALYSIS"];

/**
 * One end of the window — the previous comparable event, or this one.
 *
 * `is_estimated` travels with the anchor because an anchor is a DATE, and §7's
 * rule that a derived date must never read as a scheduled fact does not stop
 * applying because the date is drawn at the end of a line.
 */
export interface TimelineAnchor {
  event_id?: number | null;
  event_key?: string | null;
  event_type?: string | null;
  title?: string | null;
  /** The calendar day in the EVENT'S OWN zone, not UTC — an AMC print is not
   *  tomorrow. Prefer this over deriving a day from `scheduled_at_utc`. */
  date_et?: string | null;
  scheduled_at_local?: string | null;
  event_timezone?: string | null;
  scheduled_at_utc?: string | null;
  session?: string | null;
  status?: string | null;
  is_estimated?: boolean | null;
}

export interface TimelineAnchors {
  previous_event?: TimelineAnchor | null;
  /** The as-of instant the window was cut at — the "TODAY" marker. */
  as_of?: string | null;
  next_event?: TimelineAnchor | null;
}

/** The window the server actually measured, and what it was derived from. */
export interface TimelineWindow {
  start?: string | null;
  end?: string | null;
  /** Server token, e.g. "previous_earnings:<event_key>" or "default_120d".
   *  Rendered VERBATIM — the UI never re-spells a server token. */
  basis?: string | null;
  /** Width of the window in days, as the server measured it. */
  days?: number | null;
}

/**
 * One row on the timeline.
 *
 * The union is flat on the wire, so this interface is the union of all four
 * shapes with everything but `kind` and `at` optional. A renderer that wants a
 * kind-specific field must check it is there — which is exactly the discipline
 * the flat shape is supposed to enforce.
 */
export interface TimelineItem {
  kind: TimelineKind | string;
  /** ISO instant. The sort key, and always `<= as_of` by the server's contract. */
  at?: string | null;
  title?: string | null;

  /* NEWS */
  category?: string | null;
  publisher?: string | null;
  url?: string | null;
  evidence_id?: string | null;
  cluster_id?: string | null;
  score?: number | null;
  article_count?: number | null;

  /* FILING */
  fiscal_period?: string | null;
  fiscal_year?: number | null;
  timeframe?: string | null;
  source_url?: string | null;

  /* EVENT */
  event_type?: string | null;
  status?: string | null;

  /* ANALYSIS */
  regime?: string | null;
  confidence?: string | null;
  id?: number | string | null;

  [k: string]: unknown;
}

export interface TimelineCounts {
  by_kind?: Record<string, number> | null;
  by_category?: Record<string, number> | null;
  total?: number | null;
}

/** `GET /api/events/{id}/timeline` — the whole tab in one payload. */
export interface EventTimelinePayload {
  event_id?: number | null;
  event_key?: string | null;
  ticker?: string | null;
  as_of?: string | null;
  anchors?: TimelineAnchors | null;
  window?: TimelineWindow | null;
  items?: TimelineItem[] | null;
  counts?: TimelineCounts | null;
  /** True when the server dropped rows past its cap — a state, never hidden. */
  truncated?: boolean | null;
  /** The cap `truncated` was measured against, so the UI can name the number. */
  max_items?: number | null;
  /** False when the event has no ticker to build a window from; `reason` says
   *  why. An unavailable timeline is a stated state, never an empty rail. */
  available?: boolean | null;
  reason?: string | null;
  /** Per-kind evidence tier (§11), e.g. {news: "QUANT", analyses: "LLM"}. */
  provenance?: Record<string, string> | null;
  /** The same identity keys nested, matching /news, /replay and /options. */
  event?: TimelineEvent | null;
}

/** The nested identity block the other event tabs also receive. */
export interface TimelineEvent {
  event_id?: number | null;
  event_key?: string | null;
  event_type?: string | null;
  title?: string | null;
  ticker?: string | null;
  scheduled_at_utc?: string | null;
}
