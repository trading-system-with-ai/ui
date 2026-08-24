/**
 * Phase H §9/§42–§45 — `GET /api/events/{id}/fed` wire types.
 *
 * Own module, like `types-macro.ts` and `types-timeline.ts`: one endpoint's
 * payload, one file, readable in a single screen.
 *
 * Three things about this shape are contracts rather than conveniences, and
 * each is enforced by the type as much as by the renderer:
 *
 *  1. THERE IS NO HAWKISH/DOVISH SCORE, ANYWHERE (§43). Not as a number, not
 *     as a label, not as a "tone" field the UI could quietly average. The
 *     dimensions are reported SEPARATELY — POLICY_RATE can be unchanged while
 *     FORWARD_GUIDANCE changes materially, and collapsing that pair into one
 *     scalar destroys exactly the information the reader opened the tab for.
 *     `FedDimensionReport` has no numeric field at all, and that is deliberate:
 *     there is no slot for a score to arrive in.
 *  2. THE TWO REACTION WINDOWS ARE SEPARATE OBJECTS (§45). An FOMC afternoon
 *     holds two distinct events — the statement at 14:00 ET and the chair's
 *     press conference at 14:30 — and they routinely move markets in OPPOSITE
 *     directions. `FedPreviousReaction` therefore carries `statement` and
 *     `press_conference` as sibling keys rather than a merged "reaction", so
 *     no renderer can average the pair by accident.
 *  3. MARKET PRICING IS ALWAYS UNAVAILABLE (§42). This platform subscribes to
 *     no fed funds futures feed, so the implied-probability column every other
 *     Fed screen carries is absent here. Like `MacroConsensus`, it is typed as
 *     a status-bearing object rather than `number | null` precisely so that no
 *     code path can put a probability there. The 2-year yield change is
 *     offered as an explicitly LABELLED proxy and is never called a probability.
 *
 * Every field past the identity keys is optional. A Fed packet is assembled
 * from four independent Federal Reserve documents (two statements, the
 * minutes, the speeches) plus stored bars, any of which can be absent for a
 * given meeting — the previous-previous statement does not exist for the first
 * meeting on file, minutes are released three weeks late, and a meeting with
 * no backfilled minute bars falls back to daily. Typing those as required
 * would force the renderer to cast, and a cast is how a missing key becomes
 * the string "undefined" under a number a trader is about to act on.
 */

/** §11 provenance tiers that reach this payload. The Fed tab has no LLM on it. */
export type FedTier = "DATA" | "QUANT";

/* ------------------------------------------------------------------ vote */

/**
 * The recorded vote on the previous statement.
 *
 * `dissenters` is a list of NAMES, printed verbatim. A dissent is the single
 * most legible signal of committee dispersion in the whole document, and a
 * count without names ("2 against") loses which way they dissented — Bowman
 * dissenting for a cut and Goolsbee dissenting for a hold are opposite facts
 * that a bare integer renders identically.
 */
export interface FedVote {
  for?: number | null;
  against?: number | null;
  dissenters?: string[] | null;
  /** True only when the server saw an explicitly unanimous vote. */
  unanimous?: boolean | null;
  /** The vote sentence from the statement, verbatim. */
  text?: string | null;
  [k: string]: unknown;
}

/**
 * The target range for the federal funds rate, as the statement words it.
 *
 * Both the parsed bounds and the ORIGINAL TEXT travel together. The Fed writes
 * "3-1/2 to 3-3/4 percent" and the platform stores 3.5/3.75; showing only the
 * parse hides a mis-parse, and showing only the text makes the change
 * uncomputable. §44's rule that the source document is authoritative means the
 * text is what the reader can check the number against.
 */
export interface FedTargetRange {
  low_pct?: number | null;
  high_pct?: number | null;
  text?: string | null;
  [k: string]: unknown;
}

/** A statement as stored: identity, the vote, the range, and its paragraphs. */
export interface FedStatement {
  url?: string | null;
  released_at?: string | null;
  title?: string | null;
  vote?: FedVote | null;
  target_range?: FedTargetRange | null;
  /** Verbatim paragraphs, in document order (§44 — stored as published). */
  paragraphs?: string[] | null;
  [k: string]: unknown;
}

/* ------------------------------------------------------------------ diff */

/**
 * One sentence-level diff item between the previous two statements.
 *
 * The status vocabulary is closed and comes from `difflib` on the server, so
 * the same two documents always produce the same diff — §44's determinism rule.
 * A CHANGED item carries BOTH texts because the change is the pair: "risks to
 * employment have risen" against "risks to employment remain elevated" is only
 * legible when the reader sees what it replaced.
 */
export type FedDiffStatus = "ADDED" | "REMOVED" | "CHANGED" | "UNCHANGED";

export interface FedDiffItem {
  status?: FedDiffStatus | string | null;
  previous_text?: string | null;
  current_text?: string | null;
  /** Dimension tags the server attached to this sentence (§43). */
  dimensions?: string[] | null;
  /** difflib ratio for a CHANGED pair, 0..1. Never re-derived by the UI. */
  similarity?: number | null;
  [k: string]: unknown;
}

/**
 * The server's diff tally, keyed by the UPPERCASE status constants it builds
 * the block from (`counts[item.status]`), plus `TOTAL`. Not lowercase.
 */
export interface FedDiffCounts {
  ADDED?: number | null;
  REMOVED?: number | null;
  CHANGED?: number | null;
  UNCHANGED?: number | null;
  TOTAL?: number | null;
  [k: string]: unknown;
}

export interface FedStatementDiff {
  items?: FedDiffItem[] | null;
  counts?: FedDiffCounts | null;
  [k: string]: unknown;
}

/* ------------------------------------------------------------ dimensions */

/**
 * One §43 policy dimension, reported ON ITS OWN.
 *
 * Note the absence: there is no `score`, no `tone`, no `hawkishness`. The
 * report is `status` plus the sentences that produced it, so a reader who
 * disagrees with the tag can read the source sentences in the same row. That
 * is the whole design — the platform locates and pairs the language, and the
 * judgement about what it means stays with the reader (and, on the Analysis
 * tab, with a model that must explain per dimension rather than collapse).
 */
export type FedDimensionStatus =
  | "CHANGED"
  | "UNCHANGED"
  | "ADDED"
  | "REMOVED"
  | "NA";

export interface FedDimensionReport {
  status?: FedDimensionStatus | string | null;
  /** Sentences from the earlier statement carrying this dimension. */
  previous?: string[] | null;
  /** Sentences from the later statement carrying this dimension. */
  current?: string[] | null;
  notes?: string | null;
  [k: string]: unknown;
}

/**
 * The §43 dimension catalogue, in RENDER ORDER.
 *
 * The order is the order a policy reader works down a statement: the rate
 * itself, then the two mandate variables it is set against, then growth, then
 * the balance sheet, then what the committee said about what comes next, then
 * how it framed risk, and finally how divided it was. Payload order is a dict
 * order and would let the server's serialisation decide what the eye meets
 * first.
 */
export const FED_DIMENSIONS = [
  "POLICY_RATE",
  "INFLATION",
  "EMPLOYMENT",
  "GROWTH",
  "BALANCE_SHEET",
  "FORWARD_GUIDANCE",
  "RISK_BALANCE",
  "COMMITTEE_DISPERSION",
] as const;

export type FedDimension = (typeof FED_DIMENSIONS)[number];

/** The change in the target range between the two statements. */
export interface FedPolicyRateChange {
  change_bp?: number | null;
  /** Server token: "CUT" | "HIKE" | "HOLD". Printed, never re-derived. */
  direction?: string | null;
  [k: string]: unknown;
}

/* --------------------------------------------------------------- minutes */

export interface FedMinutes {
  url?: string | null;
  released_at?: string | null;
  /** Sentences the server tagged as dimension-bearing, verbatim. */
  key_paragraphs?: string[] | null;
  [k: string]: unknown;
}

/** A speech given between the previous decision and the as-of instant. */
export interface FedSpeech {
  speaker?: string | null;
  title?: string | null;
  at?: string | null;
  url?: string | null;
  [k: string]: unknown;
}

/* ------------------------------------------------------------------ data */

/**
 * The macro prints the committee will be looking at, passed through from the
 * Phase G store. Open-shaped: U3 owns what lands in each slot, and a closed
 * type here would mean a new print silently fails to render.
 */
export interface FedDataPanel {
  inflation?: unknown;
  labor?: unknown;
  growth?: unknown;
  [k: string]: unknown;
}

/* -------------------------------------------------------- market pricing */

/**
 * §42 — what the fed funds futures market implied. Which this platform does
 * not have, and says so.
 *
 * Typed with no numeric field at the top level for the same reason
 * `MacroConsensus` is: the implied-probability column is the single most
 * expected number on any Fed screen, and an empty cell where it belongs reads
 * as "there wasn't one" rather than "we don't subscribe to that". The 2-year
 * yield change lives inside `proxy` — a different measurement wearing a
 * different name, never presented as the probability itself.
 */
export interface FedMarketPricing {
  /** Always "UNAVAILABLE" in this platform. Rendered verbatim. */
  status?: string | null;
  reason?: string | null;
  /** Labelled proxy, e.g. `{"2y_yield_change_bp": -7.5}`. Not a probability. */
  proxy?: Record<string, number | null> | null;
  [k: string]: unknown;
}

/* -------------------------------------------------------------- reaction */

/** One symbol's move across one FOMC window. */
export interface FedWindowReaction {
  pre_close?: number | null;
  post_close?: number | null;
  /** FRACTION, as the server sends it. The UI multiplies by 100 to display. */
  return_pct?: number | null;
  [k: string]: unknown;
}

/** One window: every symbol measured across it. Keyed by symbol. */
export type FedReactionWindow = Record<string, FedWindowReaction>;

/**
 * §45 — the two windows, kept apart.
 *
 * `statement` covers 14:00–14:30 ET and `press_conference` 14:30–15:30 ET.
 * They are siblings, never summed: the classic FOMC afternoon is a statement
 * the market reads one way and a press conference that reverses it inside the
 * hour, and a single "FOMC day return" reports that afternoon as if nothing
 * happened.
 *
 * `basis` says which measurement produced them — "1m_bars" when the minute
 * window was backfilled, "daily" when it was not. That distinction is load
 * bearing: a DAILY basis CANNOT separate the two windows, so the UI must not
 * let a daily number sit silently under a "14:00–14:30 ET" heading.
 */
export interface FedPreviousReaction {
  statement?: FedReactionWindow | null;
  press_conference?: FedReactionWindow | null;
  /** Server token: "1m_bars" | "daily". */
  basis?: string | null;
  /** The decision instant the windows are measured around. */
  decision_at?: string | null;
  [k: string]: unknown;
}

/* --------------------------------------------------------------- packet */

export interface FedCoverage {
  available?: boolean | null;
  reason?: string | null;
  notes?: string[] | null;
  [k: string]: unknown;
}

/** The §42–§45 packet. */
export interface FedPacket {
  previous_statement?: FedStatement | null;
  statement_diff?: FedStatementDiff | null;
  /** Keyed by `FedDimension`. */
  dimensions?: Record<string, FedDimensionReport> | null;
  policy_rate_change?: FedPolicyRateChange | null;
  previous_minutes?: FedMinutes | null;
  subsequent_speeches?: FedSpeech[] | null;
  data?: FedDataPanel | null;
  market_pricing?: FedMarketPricing | null;
  previous_reaction?: FedPreviousReaction | null;
  coverage?: FedCoverage | null;
  [k: string]: unknown;
}

/** `GET /api/events/{id}/fed` — the whole tab in one payload. */
export interface EventFedPayload {
  event_id?: number | null;
  event_key?: string | null;
  event_type?: string | null;
  as_of?: string | null;
  packet?: FedPacket | null;
  /** §42/§44 disclaimer lines, printed verbatim. */
  disclaimers?: string[] | null;
  [k: string]: unknown;
}

/** `POST /api/events/{id}/fed/backfill` — reported by what the SERVER stored. */
export interface EventFedBackfillResult {
  status?: string | null;
  reason?: string | null;
  /**
   * What the server stored, as U3 emits it: a nested `counts` object, NOT
   * top-level `stored_*` keys. Read through `backfillCounts()` so a shape the
   * server never sends cannot silently read as zero.
   */
  counts?: { documents?: number | null; bars?: number | null } | null;
  /** Per-document outcomes, as U3 reports them. */
  documents?: { url?: string | null; outcome?: string | null; [k: string]: unknown }[] | null;
  [k: string]: unknown;
}

/* ------------------------------------------------------------ fed identity */

/**
 * The event types whose detail page mounts the Fed tab.
 *
 * A CLOSED list, like `MACRO_EVENT_TYPES`, and for the same reason: this tab
 * renders a packet built from FOMC statements and minutes, and mounting it for
 * a MARKET_HOLIDAY or a CPI print would promise a document set the server has
 * no catalogue for.
 *
 * All four FOMC types are included even though only the DECISION has a
 * statement of its own, because they share a meeting: a reader on the MINUTES
 * event is asking about the same meeting's policy language, and U3 resolves
 * every one of them to the same decision. FED_SPEECH is included because the
 * question a speech raises — "what did the committee last say, and has this
 * speaker moved off it?" — is answered by exactly this packet.
 */
export const FED_EVENT_TYPES = [
  "FOMC_MEETING",
  "FOMC_DECISION",
  "FOMC_PRESS_CONFERENCE",
  "FOMC_MINUTES",
  "FED_SPEECH",
  "FED_BOARD_EVENT",
] as const;

export type FedEventType = (typeof FED_EVENT_TYPES)[number];

/**
 * True when this event type gets a Fed tab.
 *
 * Matches the closed list first, then falls back to the `FOMC_`/`FED_` prefix
 * so a registry that grows a new Fed event type (a Humphrey-Hawkins testimony,
 * say) still reaches the packet rather than silently losing the tab. The
 * prefix is a safe widening in a way "has no ticker" would not be — it names
 * the issuing institution, which is exactly what the packet is scoped to.
 */
export function isFedEventType(eventType: string | null | undefined): boolean {
  if (typeof eventType !== "string" || eventType === "") return false;
  if ((FED_EVENT_TYPES as readonly string[]).includes(eventType)) return true;
  return eventType.startsWith("FOMC_") || eventType.startsWith("FED_");
}
